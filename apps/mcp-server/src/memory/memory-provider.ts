export interface AddParams {
  content: string;
  scope: string;
  userId: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryRecord {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface MemoryProvider {
  add(params: AddParams): Promise<{ id: string }>;
  search(params: {
    query: string;
    scope: string;
    userId: string;
    limit?: number;
  }): Promise<SearchResult[]>;
  list(params: { scope: string; userId: string }): Promise<MemoryRecord[]>;
  delete(params: { id: string }): Promise<void>;
}
