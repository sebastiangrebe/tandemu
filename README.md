# Tandemu

AI Teammate platform — persistent memory, personality, and development telemetry for AI-native coding.

## Architecture

```
apps/
  backend/        — NestJS API (Postgres + ClickHouse)
  frontend/       — Next.js dashboard (shadcn/ui + Recharts)
  mcp-server/     — MCP memory server
  claude-plugins/ — Skills, personality, hooks
  e2e/            — Playwright E2E tests
packages/
  types/          — Shared TypeScript types
  database/       — SQL migrations
  telemetry/      — OTEL SDK
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

## Getting Started

### 1. Start infrastructure

Production mode (builds backend and frontend in containers):

```bash
docker compose up -d
```

### 2. Development mode

Development mode mounts source code and enables hot reload for backend and frontend:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

This starts infrastructure services (Postgres, ClickHouse, Redis, OTEL collector, OpenMemory, Qdrant) from the base compose file, and replaces backend/frontend with hot-reloading dev containers.

### 3. Install dependencies (for IDE support)

```bash
pnpm install
```

### 4. Build all packages

```bash
pnpm build
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| backend | 3001 | NestJS API |
| frontend | 3000 | Next.js dashboard |
| postgres | 5432 | Relational data |
| clickhouse | 8123 | Telemetry analytics |
| redis | 6379 | Cache |
| otel-collector | 4317/4318 | Telemetry ingestion |
| openmemory | 8765 | MCP memory server |
| mem0_store | 6333 | Qdrant vector store |

## Claude Code Setup

Run the install script to configure Claude Code with Tandemu skills and memory:

```bash
./install.sh
```

## License

MIT
