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
> /plugin install tandemu
> /reload-plugins

# Exit and reopen Claude Code, then:
> /tandemu:setup

# Exit and reopen once more to activate memory, then:
> /morning
```

### Option B: Install script

Run the install script to configure Claude Code with Tandemu skills and memory:

```bash
./install.sh
```

Same result as the plugin setup, but as a bash script. Useful for scripted onboarding or CI/CD.

### Managing your installation

```bash
./install.sh --check       # Check for updates
./install.sh --uninstall   # Remove all Tandemu files
```

### Full uninstall (clean slate)

If you need to do a hard reset (e.g., plugin cache is stale or you want a completely fresh install):

```bash
# 1. Remove plugin cache and registry entries
rm -rf ~/.claude/plugins/marketplaces/tandemu
rm -rf ~/.claude/plugins/cache/tandemu*

# 2. Remove plugin from registry files
python3 -c "
import json, os
for f in ['installed_plugins.json', 'known_marketplaces.json']:
    path = os.path.expanduser(f'~/.claude/plugins/{f}')
    try:
        with open(path) as fh: d = json.load(fh)
        if f == 'installed_plugins.json':
            d['plugins'] = {k:v for k,v in d.get('plugins',{}).items() if 'tandemu' not in k}
        else:
            d.pop('tandemu', None)
        with open(path, 'w') as fh: json.dump(d, fh, indent=2)
    except: pass
"

# 3. Remove from settings.json (env, permissions, hooks, plugin entries)
python3 -c "
import json, os
f = os.path.expanduser('~/.claude/settings.json')
try:
    with open(f) as fh: s = json.load(fh)
    s['enabledPlugins'] = {k:v for k,v in s.get('enabledPlugins',{}).items() if 'tandemu' not in k}
    ekm = s.get('extraKnownMarketplaces', {}); ekm.pop('tandemu', None)
    if ekm: s['extraKnownMarketplaces'] = ekm
    elif 'extraKnownMarketplaces' in s: del s['extraKnownMarketplaces']
    env = s.get('env', {})
    for k in list(env.keys()):
        if k.startswith('OTEL_') or k == 'CLAUDE_CODE_ENABLE_TELEMETRY': del env[k]
    if env: s['env'] = env
    elif 'env' in s: del s['env']
    allow = s.get('permissions',{}).get('allow',[])
    allow = [p for p in allow if 'tandemu' not in p.lower() and ':3001' not in p and ':4318' not in p]
    if allow: s['permissions']['allow'] = allow
    elif 'allow' in s.get('permissions',{}): del s['permissions']['allow']
    if not s.get('permissions',{}).get('allow'):
        s.get('permissions',{}).pop('allow', None)
    if not s.get('permissions'): s.pop('permissions', None)
    hooks = s.get('hooks', {})
    hooks.pop('SessionStart', None)
    if not hooks: s.pop('hooks', None)
    with open(f, 'w') as fh: json.dump(s, fh, indent=2)
except: pass
"

# 4. Remove Tandemu config, skills, lib, memory index, and MCP
rm -f ~/.claude/tandemu.json ~/.claude/tandemu-active-task.json ~/.claude/tandemu-version.txt
rm -f ~/.claude/tandemu-memory-index-*.md
rm -f ~/.claude/CLAUDE.md ~/.claude/lib/tandemu-env.sh
rm -rf ~/.claude/skills/{morning,finish,pause,create,standup,setup}
python3 -c "
import json, os
for f in [os.path.expanduser('~/.mcp.json'), os.path.expanduser('~/.claude.json')]:
    try:
        with open(f) as fh: c = json.load(fh)
        c.get('mcpServers',{}).pop('tandemu-memory', None)
        if not c.get('mcpServers'): c.pop('mcpServers', None)
        if c:
            with open(f, 'w') as fh: json.dump(c, fh, indent=2)
        else: os.remove(f)
    except: pass
"

# 5. Restart Claude Code, then reinstall fresh:
#    /plugin marketplace add sebastiangrebe/tandemu
#    /plugin install tandemu
#    /tandemu:setup
```

### Why install.sh?

Claude Code has an official plugin marketplace, but plugin skills are namespaced (`/tandemu:morning`). Tandemu uses `install.sh` (or `/tandemu:setup`) to install skills with short names (`/morning`) for daily use. The installer also handles OAuth authentication and user-scoped memory configuration that plugins can't do natively.

### Available skills

| Skill | Description |
|-------|-------------|
| `/morning` | Pick a task and start working |
| `/finish` | Complete task, measure work, send telemetry |
| `/pause` | Pause current task, switch to another |
| `/create` | Create a new task in the ticket system |
| `/standup` | Generate a team standup report |

## License

MIT
