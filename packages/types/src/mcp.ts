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

export interface MemoryEntry {
  readonly id: string;
  readonly content: string;
  readonly scope: MemoryScope;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly score?: number;
}
