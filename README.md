<p align="center">
  <img src="apps/frontend/public/logo-mark-dark.svg" alt="Tandemu" width="80" />
</p>

<h1 align="center">Tandemu</h1>

<p align="center">
  <strong>An AI that remembers you. A team that sees everything.</strong>
</p>

<p align="center">
  The management layer for AI-assisted development.<br/>
  Persistent memory and telemetry for Claude Code — built for developers and engineering leads.
</p>

<p align="center">
  <a href="https://tandemu.dev">Website</a> · <a href="https://tandemu.dev/docs">Documentation</a> · <a href="https://app.tandemu.dev">Dashboard</a> · <a href="https://tandemu.dev/docs/self-hosting/overview">Self-Hosting Guide</a>
</p>

<br/>

<p align="center">
  <img src="apps/e2e/screenshots/app-dashboard.png" alt="Tandemu Dashboard" width="800" />
</p>

<br/>

## What is Tandemu?

Tandemu is an AI teammate platform that sits on top of [Claude Code](https://claude.ai/code). It serves two audiences:

- **For developers** — a persistent AI companion that remembers your coding style, architectural decisions, and debugging history across sessions. Daily workflow is driven by slash commands (`/morning`, `/finish`, `/standup`).
- **For engineering leads** — non-invasive observability into AI-native development. Real metrics (AI ratio, cycle time, friction, DORA) replace estimation ceremonies like story points and manual timesheets.

## Key Features

| | Feature | Description |
|---|---|---|
| 🧠 | **Persistent Memory** | Retains coding styles, decisions, and context across sessions |
| 📊 | **Code Attribution** | Exact AI vs. manual split per commit via `Co-Authored-By` |
| ⏱️ | **Passive Time Tracking** | Automated session-based logging — no manual timesheets |
| 🔥 | **Friction Detection** | Surfaces tool failures and prompt loops as a heatmap |
| 📈 | **DORA Metrics** | Deployment frequency and lead time from task completions |
| 💰 | **ROI Analysis** | Productivity multipliers, cost-per-task, capacity freed |
| 🔒 | **Privacy-First** | Session-level metrics only — no keystrokes, screen recordings, or prompt content |

## Integrations

GitHub Issues · Linear · Jira · ClickUp · Asana · monday.com

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+

### 1. Start the stack

```bash
git clone https://github.com/sebastiangrebe/tandemu.git
cd tandemu
docker compose up -d
```

### 2. Connect Claude Code

```bash
# In Claude Code:
/plugin marketplace add sebastiangrebe/tandemu
/plugin install tandemu
/tandemu:setup
```

Exit and reopen Claude Code to activate memory, then start working:

```bash
/morning
```

> Alternatively, run `./install.sh` for scripted onboarding. See the [setup docs](https://tandemu.dev/docs/setup) for details.

### 3. Development mode

For local development with hot reload:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
pnpm install   # IDE support
pnpm build     # Build all packages
```

## Architecture

```
apps/
  backend/        — NestJS API (PostgreSQL + ClickHouse)
  frontend/       — Next.js dashboard (shadcn/ui + Recharts)
  claude-plugins/ — Skills, personality, hooks
  e2e/            — Playwright E2E tests
packages/
  types/          — Shared TypeScript types
  database/       — SQL migrations
```

| Service | Port | Purpose |
|---------|------|---------|
| frontend | 3000 | Next.js dashboard |
| backend | 3001 | NestJS API |
| postgres | 5432 | Relational data |
| clickhouse | 8123 | Telemetry analytics |
| redis | 6379 | Cache + job queues |
| otel-collector | 4317/4318 | OpenTelemetry ingestion |
| openmemory | 8765 | MCP memory server (Mem0) |
| mem0_store | 6333 | Qdrant vector store |

## How It Works

```
/morning  →  pick a task  →  work  →  /finish
```

1. **`/morning`** — Fetches tasks from your ticket system. Creates a git worktree with a feature branch.
2. **Work** — Code normally. Tandemu tracks session time, AI ratio, and friction in the background.
3. **`/finish`** — Measures work, sends telemetry, updates the ticket, creates a PR, and cleans up the worktree.

Each task runs in its own worktree, so you can work on multiple tasks in parallel across Claude Code sessions.

| Skill | Description |
|-------|-------------|
| `/morning` | Pick a task and start working |
| `/finish` | Complete task, measure work, send telemetry |
| `/pause` | Pause current task for later |
| `/create` | Create a new task in the ticket system |
| `/standup` | Generate a team standup report |

## Deployment

| | Option | Details |
|---|---|---|
| 🏠 | **Self-hosted** | Docker Compose — free and open-source |
| ☁️ | **Managed cloud** | [app.tandemu.dev](https://app.tandemu.dev) — $25/developer/month |

See the [self-hosting guide](https://tandemu.dev/docs/self-hosting/overview) for production deployment instructions.

## Documentation

Full documentation is available at **[tandemu.dev/docs](https://tandemu.dev/docs)**.

- [Installation & Setup](https://tandemu.dev/docs/setup)
- [Developer Workflow](https://tandemu.dev/docs/developer/workflow)
- [Memory System](https://tandemu.dev/docs/developer/memory)
- [Dashboard & Metrics](https://tandemu.dev/docs/lead/dashboard)
- [Self-Hosting Configuration](https://tandemu.dev/docs/self-hosting/configuration)

## Uninstalling

```bash
./install.sh --uninstall
```

For a full clean-slate reset, see [UNINSTALL.md](UNINSTALL.md).

## License

[Elastic License 2.0 (ELv2)](LICENSE) — free to use and self-host, but you may not offer it as a competing hosted service.
