import { Mem0MemoryProvider } from "./mem0-provider.js";

export type { MemoryProvider, SearchResult, MemoryRecord, AddParams } from "./memory-provider.js";
export { Mem0MemoryProvider } from "./mem0-provider.js";
export type { Mem0ProviderConfig } from "./mem0-provider.js";

/**
 * Create a Mem0MemoryProvider from environment variables.
 *
 * Requires MEM0_API_KEY. Optionally reads MEM0_ORG_ID.
 */
export function createMemoryProvider() {
  const apiKey = process.env.MEM0_API_KEY;
  if (!apiKey) {
    throw new Error("MEM0_API_KEY environment variable is required");
  }

  return new Mem0MemoryProvider({
    apiKey,
    orgId: process.env.MEM0_ORG_ID,
  });
}
