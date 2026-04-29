import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { RequestUser } from '../auth/auth.decorator.js';
import { MemoryService } from '../memory/memory.service.js';
import { IntegrationsService } from '../integrations/integrations.service.js';
import { TasksService } from '../integrations/tasks.service.js';
import { GitHubGitService, type GitPRData, type GitCommitData } from '../integrations/providers/github-git.service.js';
import { getProvider } from '../integrations/providers/index.js';
import { reciprocalRankFusion, type RankedItem, type FusedItem } from './rrf.js';

export type SearchSource = 'memory' | 'tasks' | 'git';

export interface SearchOptions {
  query: string;
  sources: SearchSource[];
  limit: number;
  fileContext?: string;
}

export interface SearchResultCitation {
  url?: string;
  id?: string;
  taskId?: string;
  author?: string;
  category?: string;
  status?: string;
  provider?: string;
  repo?: string;
  mergedAt?: string;
  sha?: string;
}

export interface SearchResult {
  type: 'memory' | 'task' | 'pr' | 'commit';
  content: string;
  score: number;
  citation: SearchResultCitation;
  relatedCitations?: SearchResultCitation[];
}

export interface SourceStats {
  count: number;
  ms: number;
  errors?: string[];
  byProvider?: Record<string, number>;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  sources: Partial<Record<SearchSource, SourceStats>>;
  tookMs: number;
}

const FILE_CONTEXT_BOOST = 1.25;
const RRF_K = 60;
const SOURCE_LIMIT = 20;

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly memoryService: MemoryService,
    private readonly integrationsService: IntegrationsService,
    private readonly tasksService: TasksService,
    private readonly githubGitService: GitHubGitService,
  ) {}

  async search(user: RequestUser, opts: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const sources = opts.sources.length ? opts.sources : (['memory', 'tasks', 'git'] as SearchSource[]);
    const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));

    const tasks = await Promise.allSettled([
      sources.includes('memory') ? this.searchMemorySource(user, opts.query, limit) : Promise.resolve(null),
      sources.includes('tasks') ? this.searchTasksSource(user, opts.query, limit) : Promise.resolve(null),
      sources.includes('git') ? this.searchGitSource(user, opts.query, limit) : Promise.resolve(null),
    ]);

    const sourceStats: Partial<Record<SearchSource, SourceStats>> = {};
    const lists: RankedItem[][] = [];
    const itemsByKey = new Map<string, SearchResult>();

    const handleSource = (
      source: SearchSource,
      settled: PromiseSettledResult<SourceFetchResult | null>,
    ) => {
      if (settled.status === 'rejected') {
        sourceStats[source] = { count: 0, ms: 0, errors: [String(settled.reason)] };
        return;
      }
      if (!settled.value) return;
      const { results, ms, byProvider, errors } = settled.value;
      sourceStats[source] = {
        count: results.length,
        ms,
        ...(byProvider ? { byProvider } : {}),
        ...(errors && errors.length ? { errors } : {}),
      };
      const ranked: RankedItem[] = results.map((result) => {
        const key = this.canonicalKey(result);
        // Keep the highest-scored payload per key. RRF will collapse duplicates,
        // but we also stash per-key results to preserve relatedCitations.
        const existing = itemsByKey.get(key);
        if (!existing) {
          itemsByKey.set(key, result);
        } else {
          existing.relatedCitations = existing.relatedCitations ?? [];
          if (existing.citation.url !== result.citation.url) {
            existing.relatedCitations.push(result.citation);
          }
        }
        return { key, source, payload: null };
      });
      lists.push(ranked);
    };

    handleSource('memory', tasks[0]);
    handleSource('tasks', tasks[1]);
    handleSource('git', tasks[2]);

    const fused: FusedItem[] = reciprocalRankFusion(lists, RRF_K);

    const ordered: SearchResult[] = fused.map((f) => {
      const item = itemsByKey.get(f.key);
      if (!item) return null as unknown as SearchResult;
      return { ...item, score: f.score };
    }).filter(Boolean);

    if (opts.fileContext) {
      const ctx = opts.fileContext.toLowerCase();
      for (const item of ordered) {
        if (this.mentionsContext(item, ctx)) item.score *= FILE_CONTEXT_BOOST;
      }
      ordered.sort((a, b) => b.score - a.score);
    }

    const tookMs = Date.now() - start;
    if (tookMs > 2000) {
      this.logger.warn(`Slow search: q="${opts.query}" took ${tookMs}ms`);
    }

    return {
      query: opts.query,
      results: ordered.slice(0, limit),
      sources: sourceStats,
      tookMs,
    };
  }

  // ---- Per-source fetchers ----

  private async searchMemorySource(
    user: RequestUser,
    query: string,
    limit: number,
  ): Promise<SourceFetchResult> {
    const start = Date.now();
    try {
      const memories = await this.memoryService.searchMemoriesGated(user, query, Math.min(limit, SOURCE_LIMIT));
      const results: SearchResult[] = memories.map((m) => {
        const metadata = (m.metadata ?? {}) as Record<string, unknown>;
        return {
          type: 'memory',
          content: String(m.memory ?? m.content ?? ''),
          score: 0,
          citation: {
            id: String(m.id ?? ''),
            taskId: metadata.taskId as string | undefined,
            author: metadata.author_name as string | undefined,
            category: metadata.category as string | undefined,
          },
        };
      });
      return { results, ms: Date.now() - start };
    } catch (err) {
      this.logger.warn(`memory source failed: ${err}`);
      Sentry.captureException(err, { tags: { operation: 'search-memory' } });
      return { results: [], ms: Date.now() - start, errors: [String(err)] };
    }
  }

  private async searchTasksSource(
    user: RequestUser,
    query: string,
    limit: number,
  ): Promise<SourceFetchResult> {
    const start = Date.now();
    const errors: string[] = [];
    const byProvider: Record<string, number> = {};
    const results: SearchResult[] = [];

    try {
      const integrations = await this.integrationsService.findAll(user.organizationId);
      const integrationData = await Promise.all(
        integrations.map(async (integration) => {
          try {
            const raw = await this.integrationsService.findOne(user.organizationId, integration.provider);
            const mappings = await this.integrationsService.getMappings(raw.id);
            return { raw, mappings, providerName: integration.provider, provider: getProvider(integration.provider) };
          } catch (err) {
            errors.push(`${integration.provider}: ${String(err)}`);
            return null;
          }
        }),
      );

      const providerSearches: Promise<{ providerName: string; tasks: import('@tandemu/types').Task[] } | null>[] = [];
      for (const data of integrationData) {
        if (!data || !data.provider) continue;
        const { raw, mappings, provider, providerName } = data;
        // One searchTasks call per mapping (most providers can only filter by one project)
        for (const mapping of mappings) {
          providerSearches.push(
            (async () => {
              try {
                const tasks = await provider.searchTasks({
                  accessToken: raw.access_token,
                  query,
                  externalProjectId: mapping.externalProjectId,
                  limit: SOURCE_LIMIT,
                  config: { ...raw.config, ...mapping.config },
                });
                return { providerName, tasks };
              } catch (err) {
                errors.push(`${providerName}: ${String(err)}`);
                return null;
              }
            })(),
          );
        }
      }

      const settled = await Promise.all(providerSearches);
      const seen = new Set<string>();
      for (const entry of settled) {
        if (!entry) continue;
        for (const t of entry.tasks) {
          const dedupeKey = `${entry.providerName}:${t.id}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          byProvider[entry.providerName] = (byProvider[entry.providerName] ?? 0) + 1;
          results.push({
            type: 'task',
            content: [t.title, t.description].filter(Boolean).join(' — ').slice(0, 500),
            score: 0,
            citation: {
              url: t.url,
              id: t.id,
              status: t.status,
              provider: entry.providerName,
            },
          });
          if (results.length >= limit) break;
        }
        if (results.length >= limit) break;
      }
    } catch (err) {
      errors.push(String(err));
      this.logger.warn(`tasks source failed: ${err}`);
      Sentry.captureException(err, { tags: { operation: 'search-tasks' } });
    }

    return { results, ms: Date.now() - start, byProvider, errors };
  }

  private async searchGitSource(
    user: RequestUser,
    query: string,
    limit: number,
  ): Promise<SourceFetchResult> {
    const start = Date.now();
    const errors: string[] = [];
    const results: SearchResult[] = [];

    try {
      // Single GitHub integration per org currently; collect repos from mappings
      let raw: Awaited<ReturnType<typeof this.integrationsService.findOne>> | null = null;
      try {
        raw = await this.integrationsService.findOne(user.organizationId, 'github');
      } catch {
        return { results, ms: Date.now() - start };
      }
      if (!raw) return { results, ms: Date.now() - start };

      const mappings = await this.integrationsService.getMappings(raw.id);
      const repos = mappings
        .map((m) => {
          const [owner, repo] = m.externalProjectId.split('/');
          return owner && repo ? { owner, repo } : null;
        })
        .filter((r): r is { owner: string; repo: string } => r !== null);

      if (repos.length === 0) return { results, ms: Date.now() - start };

      const [prs, commits] = await Promise.all([
        this.githubGitService.searchPullRequests(raw.access_token, repos, query, SOURCE_LIMIT)
          .catch((err) => { errors.push(`prs: ${String(err)}`); return [] as GitPRData[]; }),
        this.githubGitService.searchCommits(raw.access_token, repos, query, SOURCE_LIMIT)
          .catch((err) => { errors.push(`commits: ${String(err)}`); return [] as GitCommitData[]; }),
      ]);

      for (const pr of prs) {
        const repoFromUrl = this.extractRepoFromGithubUrl(pr.url);
        results.push({
          type: 'pr',
          content: [pr.title, pr.body].filter(Boolean).join(' — ').slice(0, 500),
          score: 0,
          citation: {
            url: pr.url,
            author: pr.author.login,
            repo: repoFromUrl,
            mergedAt: pr.mergedAt || undefined,
          },
        });
      }
      for (const c of commits) {
        results.push({
          type: 'commit',
          content: c.message.slice(0, 500),
          score: 0,
          citation: {
            sha: c.sha,
            author: c.author.login ?? c.author.email,
          },
        });
      }
    } catch (err) {
      errors.push(String(err));
      this.logger.warn(`git source failed: ${err}`);
      Sentry.captureException(err, { tags: { operation: 'search-git' } });
    }

    return { results, ms: Date.now() - start, errors };
  }

  // ---- Helpers ----

  private canonicalKey(result: SearchResult): string {
    if (result.citation.url) return this.normalizeUrl(result.citation.url);
    if (result.type === 'commit' && result.citation.sha) return `commit:${result.citation.sha}`;
    if (result.type === 'memory' && result.citation.id) return `memory:${result.citation.id}`;
    return `${result.type}:${result.content.slice(0, 64)}`;
  }

  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/+$/, '');
      return `${u.host.toLowerCase()}${path}`;
    } catch {
      return url;
    }
  }

  private mentionsContext(item: SearchResult, ctx: string): boolean {
    if (item.content.toLowerCase().includes(ctx)) return true;
    if (item.citation.url?.toLowerCase().includes(ctx)) return true;
    return false;
  }

  private extractRepoFromGithubUrl(url: string): string | undefined {
    const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
    return match?.[1];
  }
}

interface SourceFetchResult {
  results: SearchResult[];
  ms: number;
  byProvider?: Record<string, number>;
  errors?: string[];
}
