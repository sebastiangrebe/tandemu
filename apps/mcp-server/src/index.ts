import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createMemoryProvider } from "./memory/index.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "tandemu-mcp",
  version: "0.0.0",
});

const memory = createMemoryProvider();

const DEFAULT_USER_ID = process.env.MEM0_USER_ID ?? "default";

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.tool(
  "ping",
  "Health check for the Tandemu MCP server",
  {},
  async () => ({
    content: [{ type: "text", text: "pong" }],
  }),
);

// ---- add_memory ----------------------------------------------------------

server.tool(
  "add_memory",
  "Store a memory entry with content, scope, and optional metadata",
  {
    content: z.string().describe("The text content of the memory to store"),
    scope: z
      .enum(["user", "session", "agent"])
      .default("user")
      .describe("Memory scope: user, session, or agent"),
    userId: z
      .string()
      .optional()
      .describe("User ID to scope the memory to (defaults to MEM0_USER_ID env)"),
    sessionId: z
      .string()
      .optional()
      .describe("Session ID (relevant when scope is 'session')"),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Arbitrary metadata to attach to the memory"),
  },
  async (params) => {
    try {
      const result = await memory.add({
        content: params.content,
        scope: params.scope.toUpperCase(),
        userId: params.userId ?? DEFAULT_USER_ID,
        sessionId: params.sessionId,
        metadata: params.metadata,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, id: result.id }),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: message }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- search_memories -----------------------------------------------------

server.tool(
  "search_memories",
  "Search memories by semantic query within a scope, returns ranked results",
  {
    query: z.string().describe("The search query"),
    scope: z
      .enum(["user", "session", "agent"])
      .default("user")
      .describe("Memory scope to search within"),
    userId: z
      .string()
      .optional()
      .describe("User ID to scope the search to (defaults to MEM0_USER_ID env)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of results to return (default 10)"),
  },
  async (params) => {
    try {
      const results = await memory.search({
        query: params.query,
        scope: params.scope.toUpperCase(),
        userId: params.userId ?? DEFAULT_USER_ID,
        limit: params.limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, results }),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: message }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- get_memories --------------------------------------------------------

server.tool(
  "get_memories",
  "List all memories for a given scope and user",
  {
    scope: z
      .enum(["user", "session", "agent"])
      .default("user")
      .describe("Memory scope to list"),
    userId: z
      .string()
      .optional()
      .describe("User ID (defaults to MEM0_USER_ID env)"),
  },
  async (params) => {
    try {
      const memories = await memory.list({
        scope: params.scope.toUpperCase(),
        userId: params.userId ?? DEFAULT_USER_ID,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, memories }),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: message }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- delete_memory -------------------------------------------------------

server.tool(
  "delete_memory",
  "Delete a specific memory by its ID",
  {
    id: z.string().describe("The ID of the memory to delete"),
  },
  async (params) => {
    try {
      await memory.delete({ id: params.id });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, deleted: params.id }),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: message }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Tandemu MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
