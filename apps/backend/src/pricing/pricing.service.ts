import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { OrgSettings, ModelPriceOverride } from '@tandemu/types';

export interface ModelPrice {
  readonly modelName: string;
  readonly provider: string;
  readonly inputPer1M: number;
  readonly outputPer1M: number;
  readonly cachedPer1M: number | null;
  readonly reasoningPer1M: number | null;
  readonly currency: string;
  readonly source: string;
  readonly updatedAt: Date;
}

export interface TokenCounts {
  readonly input?: number;
  readonly output?: number;
  readonly cached?: number;
  readonly reasoning?: number;
}

/**
 * Looks up per-model USD rates and computes cost from token counts.
 *
 * Used by `TelemetryService` to convert Codex CLI token counts (the only data
 * Codex emits; no native USD field) into per-day / per-developer / per-task
 * cost figures that flow through the same dashboards as Claude Code and
 * OpenCode (which both emit USD directly).
 *
 * Resolution order:
 *  1. Per-org override at `organizations.settings.modelPriceOverrides[model]`
 *  2. Global default row in the `model_prices` Postgres table
 *  3. `null` (caller treats as $0 contribution and logs the missing model)
 *
 * Global rates are cached in-process for 5 minutes. Admin PATCH endpoints call
 * `invalidate()` to drop the cache synchronously so an edit is visible on the
 * next request.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private readonly cacheTtlMs = 5 * 60 * 1000;
  private globalCache: { rows: Map<string, ModelPrice>; expiresAt: number } | null = null;
  private readonly missingModelWarned = new Set<string>();

  constructor(private readonly db: DatabaseService) {}

  /**
   * Get the effective price for a model, applying any per-org override on top
   * of the global default. Returns null if no global row exists and no
   * override is set.
   */
  async getModelPrice(modelName: string, orgId?: string): Promise<ModelPrice | null> {
    if (!modelName) return null;

    const base = await this.getGlobalPrice(modelName);
    const override = orgId ? await this.getOrgOverride(orgId, modelName) : null;

    if (!base && !override) {
      if (!this.missingModelWarned.has(modelName)) {
        this.missingModelWarned.add(modelName);
        this.logger.warn(
          `No price for model "${modelName}" (global or per-org). Cost contribution will be $0 until a row is added to model_prices or an override is set.`,
        );
      }
      return null;
    }

    return this.merge(modelName, base, override);
  }

  /**
   * Compute USD cost from token counts for the given model. Any token field
   * that's missing OR has no corresponding rate contributes $0 — callers don't
   * need to pre-check which rates exist for a model. Returns 0 when the model
   * has no price at all.
   */
  async computeCost(
    tokens: TokenCounts,
    modelName: string,
    orgId?: string,
  ): Promise<number> {
    const price = await this.getModelPrice(modelName, orgId);
    if (!price) return 0;

    let total = 0;
    if (tokens.input && tokens.input > 0) {
      total += (tokens.input * price.inputPer1M) / 1_000_000;
    }
    if (tokens.output && tokens.output > 0) {
      total += (tokens.output * price.outputPer1M) / 1_000_000;
    }
    if (tokens.cached && tokens.cached > 0 && price.cachedPer1M !== null) {
      total += (tokens.cached * price.cachedPer1M) / 1_000_000;
    }
    if (tokens.reasoning && tokens.reasoning > 0 && price.reasoningPer1M !== null) {
      total += (tokens.reasoning * price.reasoningPer1M) / 1_000_000;
    }
    return total;
  }

  /**
   * List every global model_prices row. Used by the admin endpoint.
   */
  async listGlobalPrices(): Promise<ModelPrice[]> {
    const result = await this.db.query<{
      model_name: string;
      provider: string;
      input_per_1m: string;
      output_per_1m: string;
      cached_per_1m: string | null;
      reasoning_per_1m: string | null;
      currency: string;
      source: string;
      updated_at: Date;
    }>(
      `SELECT model_name, provider, input_per_1m, output_per_1m,
              cached_per_1m, reasoning_per_1m, currency, source, updated_at
       FROM model_prices
       ORDER BY provider, model_name`,
    );
    return result.rows.map((r) => this.rowToPrice(r));
  }

  /**
   * Update a global model_prices row. Only fields present in `patch` are
   * changed. Marks the row as `source = 'admin'` and invalidates the cache.
   */
  async updateGlobalPrice(
    modelName: string,
    patch: Partial<{
      provider: string;
      inputPer1M: number;
      outputPer1M: number;
      cachedPer1M: number | null;
      reasoningPer1M: number | null;
      currency: string;
    }>,
  ): Promise<ModelPrice | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const push = (sql: string, val: unknown) => {
      fields.push(`${sql} = $${i++}`);
      values.push(val);
    };

    if (patch.provider !== undefined) push('provider', patch.provider);
    if (patch.inputPer1M !== undefined) push('input_per_1m', patch.inputPer1M);
    if (patch.outputPer1M !== undefined) push('output_per_1m', patch.outputPer1M);
    if (patch.cachedPer1M !== undefined) push('cached_per_1m', patch.cachedPer1M);
    if (patch.reasoningPer1M !== undefined) push('reasoning_per_1m', patch.reasoningPer1M);
    if (patch.currency !== undefined) push('currency', patch.currency);

    if (fields.length === 0) {
      // No-op update; just return the current row.
      return this.getGlobalPrice(modelName);
    }

    fields.push(`source = 'admin'`);
    fields.push(`updated_at = NOW()`);
    values.push(modelName);

    const result = await this.db.query<{
      model_name: string;
      provider: string;
      input_per_1m: string;
      output_per_1m: string;
      cached_per_1m: string | null;
      reasoning_per_1m: string | null;
      currency: string;
      source: string;
      updated_at: Date;
    }>(
      `UPDATE model_prices SET ${fields.join(', ')}
       WHERE model_name = $${i}
       RETURNING *`,
      values,
    );

    this.invalidate();

    if (result.rows.length === 0) return null;
    return this.rowToPrice(result.rows[0]);
  }

  /**
   * Drop the in-process cache. Called from admin PATCH so edits become
   * visible without waiting for TTL expiry.
   */
  invalidate(): void {
    this.globalCache = null;
  }

  // ── Internals ──

  private async getGlobalPrice(modelName: string): Promise<ModelPrice | null> {
    const cache = await this.loadGlobalCache();
    return cache.get(modelName) ?? null;
  }

  private async getOrgOverride(
    orgId: string,
    modelName: string,
  ): Promise<ModelPriceOverride | null> {
    try {
      const result = await this.db.query<{ settings: Record<string, unknown> | null }>(
        `SELECT settings FROM organizations WHERE id = $1`,
        [orgId],
      );
      const settings = (result.rows[0]?.settings ?? {}) as OrgSettings;
      const overrides = settings.modelPriceOverrides;
      if (!overrides) return null;
      return overrides[modelName] ?? null;
    } catch (err) {
      this.logger.warn(`Failed to read org override for ${modelName}: ${err}`);
      return null;
    }
  }

  private async loadGlobalCache(): Promise<Map<string, ModelPrice>> {
    const now = Date.now();
    if (this.globalCache && this.globalCache.expiresAt > now) {
      return this.globalCache.rows;
    }

    const rows = await this.listGlobalPrices();
    const map = new Map<string, ModelPrice>();
    for (const row of rows) {
      map.set(row.modelName, row);
    }
    this.globalCache = { rows: map, expiresAt: now + this.cacheTtlMs };
    return map;
  }

  private merge(
    modelName: string,
    base: ModelPrice | null,
    override: ModelPriceOverride | null,
  ): ModelPrice {
    return {
      modelName,
      provider: base?.provider ?? 'unknown',
      inputPer1M: override?.inputPer1M ?? base?.inputPer1M ?? 0,
      outputPer1M: override?.outputPer1M ?? base?.outputPer1M ?? 0,
      cachedPer1M: override?.cachedPer1M ?? base?.cachedPer1M ?? null,
      reasoningPer1M: override?.reasoningPer1M ?? base?.reasoningPer1M ?? null,
      currency: base?.currency ?? 'USD',
      source: override ? 'override' : (base?.source ?? 'seed'),
      updatedAt: base?.updatedAt ?? new Date(0),
    };
  }

  private rowToPrice(row: {
    model_name: string;
    provider: string;
    input_per_1m: string;
    output_per_1m: string;
    cached_per_1m: string | null;
    reasoning_per_1m: string | null;
    currency: string;
    source: string;
    updated_at: Date;
  }): ModelPrice {
    return {
      modelName: row.model_name,
      provider: row.provider,
      inputPer1M: Number(row.input_per_1m),
      outputPer1M: Number(row.output_per_1m),
      cachedPer1M: row.cached_per_1m === null ? null : Number(row.cached_per_1m),
      reasoningPer1M: row.reasoning_per_1m === null ? null : Number(row.reasoning_per_1m),
      currency: row.currency,
      source: row.source,
      updatedAt: row.updated_at,
    };
  }
}
