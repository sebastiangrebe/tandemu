# Suggested New Page: Troubleshooting

**Proposed URL:** /docs/troubleshooting

## Why This Page Is Needed

Troubleshooting content is scattered across multiple pages (connecting, installation) or missing entirely. A centralized troubleshooting page reduces support burden and helps self-service users.

## Suggested Structure

### Installation Issues
- "Claude Code not found" — How to install Claude Code CLI
- "Plugin not found after install" — Restart Claude Code
- "install.sh permission denied" — chmod +x
- "Python not found" — Install Python 3

### Authentication Issues
- "Token expired" — Re-run /tandemu:setup
- "Wrong organization" — Re-run setup and select different org
- "Browser doesn't open during auth" — Copy URL manually
- "401 Unauthorized from API" — Token refresh needed

### Memory Issues
- "Memory server not responding" — Docker not running, check `docker ps`
- "No memories found" — Memory is empty for new users, use Claude normally
- "Memories from another project appearing" — Check MCP URL user ID
- "OpenAI API key missing" — Required for embeddings

### Skill Issues
- "/morning shows no tasks" — Check integration, team mapping, task assignment
- "/finish fails" — API unreachable, OTEL collector down
- "Worktree already exists" — Previous task not cleaned up, manual removal
- "Skills not found" — Restart Claude Code after plugin install

### Dashboard Issues
- "Dashboard shows no data" — No /finish completions yet, check OTEL pipeline
- "All metrics are zero" — OTEL collector not receiving data
- "Wrong team data" — Check team filter in dashboard header

### Self-Hosting Issues
- "Service won't start" — Check Docker logs, port conflicts
- "ClickHouse OOM" — Increase memory limit
- "Migrations failed" — Check PostgreSQL connection, run manually
- "Memory server can't reach Qdrant" — Check Docker networking

### Diagnostic Commands
```bash
# Check all services
docker compose ps

# Check backend health
curl http://localhost:3001/api/health

# Check OTEL collector
curl http://localhost:4318/v1/traces

# Check memory server
curl http://localhost:8765/health

# View backend logs
docker compose logs -f backend

# View Claude Code config
cat ~/.claude/tandemu.json | jq .
cat ~/.mcp.json | jq .
```
