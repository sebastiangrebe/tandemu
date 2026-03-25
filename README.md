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

### Option A: Plugin marketplace

```bash
# In Claude Code:
> /plugin marketplace add sebastiangrebe/tandemu
> /tandemu:setup
```

The setup skill handles authentication, configuration, and installs short-named skills (`/morning`, `/finish`, etc.) for daily use.

### Option B: Install script

```bash
./install.sh
```

Same result as the plugin setup, but as a bash script. Useful for scripted onboarding or CI/CD.

### Managing your installation

```bash
./install.sh --check       # Check for updates
./install.sh --uninstall   # Remove all Tandemu files
```

### Why install.sh?

Claude Code has an official plugin marketplace, but plugin skills are namespaced (`/tandemu:morning`). Tandemu uses `install.sh` (or `/tandemu:setup`) to install skills with short names (`/morning`) for daily use. The installer also handles OAuth authentication and user-scoped memory configuration that plugins can't do natively.

### Available skills

| Skill | Description |
|-------|-------------|
| `/morning` | Pick a task and start working |
| `/finish` | Complete task, measure work, send telemetry |
| `/pause` | Pause current task, switch to another |
| `/standup` | Generate a team standup report |
| `/blockers` | See what's slowing the team down |

## License

MIT
