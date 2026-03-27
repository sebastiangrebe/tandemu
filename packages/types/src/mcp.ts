export enum MemoryScope {
  USER = "USER",
  SESSION = "SESSION",
  AGENT = "AGENT",
}

export interface AddMemoryRequest {
  readonly content: string;
  readonly scope: MemoryScope;
  readonly metadata?: Record<string, unknown>;
  readonly userId: string;
  readonly sessionId?: string;
}

export interface SearchMemoriesRequest {
  readonly query: string;
  readonly scope: MemoryScope;
  readonly userId: string;
  readonly limit?: number;
}

export interface MemoryMetadata {
  status?: 'draft' | 'published';
  author_id?: string;
  taskId?: string;
  repo?: string;
  files?: string[];
  category?: string;
  [key: string]: unknown;
}

export interface MemoryEntry {
  readonly id: string;
  readonly content: string;
  readonly scope: MemoryScope;
  readonly metadata: MemoryMetadata;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly score?: number;
}

export interface MemoryListResponse {
  memories: MemoryEntry[];
  total: number;
}

export interface MemoryStatsResponse {
  personal: number;
  org: number;
  total: number;
  categories: Record<string, number>;
}
