import { randomUUID } from "node:crypto";
import type {
  MemoryProvider,
  AddParams,
  SearchResult,
  MemoryRecord,
} from "./memory-provider.js";

export interface Mem0ProviderConfig {
  apiKey: string;
  orgId?: string;
}

/**
 * Mem0 memory provider.
 *
 * Uses the `mem0ai` MemoryClient to store and retrieve memories
 * via the Mem0 Platform API.
 */
export class Mem0MemoryProvider implements MemoryProvider {
  private client: any;
  private initialised = false;
  private readonly config: Mem0ProviderConfig;

  constructor(config: Mem0ProviderConfig) {
    this.config = config;
  }

  private async ensureInitialised(): Promise<void> {
    if (this.initialised) return;

    const { MemoryClient } = await import("mem0ai");
    this.client = new MemoryClient({
      apiKey: this.config.apiKey,
      ...(this.config.orgId ? { orgId: this.config.orgId } : {}),
    });
    this.initialised = true;
  }

  private scopeParams(
    scope: string,
    userId: string,
    sessionId?: string,
  ): Record<string, string> {
    switch (scope.toUpperCase()) {
      case "SESSION":
        return {
          user_id: userId,
          ...(sessionId ? { run_id: sessionId } : {}),
        };
      case "AGENT":
        return { agent_id: userId };
      case "USER":
      default:
        return { user_id: userId };
    }
  }

  async add(params: AddParams): Promise<{ id: string }> {
    await this.ensureInitialised();

    const result = await this.client.add(params.content, {
      ...this.scopeParams(params.scope, params.userId, params.sessionId),
      metadata: params.metadata,
    });

    const id: string =
      result?.results?.[0]?.id ?? result?.id ?? randomUUID();
    return { id };
  }

  async search(params: {
    query: string;
    scope: string;
    userId: string;
    limit?: number;
  }): Promise<SearchResult[]> {
    await this.ensureInitialised();

    const results = await this.client.search(params.query, {
      ...this.scopeParams(params.scope, params.userId),
      limit: params.limit ?? 10,
    });

    const items: any[] = Array.isArray(results)
      ? results
      : results?.results ?? [];

    return items.map((r: any) => ({
      id: r.id ?? "",
      content: r.memory ?? r.content ?? "",
      score: r.score ?? 0,
      metadata: r.metadata,
    }));
  }

  async list(params: {
    scope: string;
    userId: string;
  }): Promise<MemoryRecord[]> {
    await this.ensureInitialised();

    const results = await this.client.getAll(
      this.scopeParams(params.scope, params.userId),
    );

    const items: any[] = Array.isArray(results)
      ? results
      : results?.results ?? [];

    return items.map((r: any) => ({
      id: r.id ?? "",
      content: r.memory ?? r.content ?? "",
      metadata: r.metadata,
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
    }));
  }

  async delete(params: { id: string }): Promise<void> {
    await this.ensureInitialised();
    await this.client.delete(params.id);
  }
}
