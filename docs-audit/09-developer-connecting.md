# Audit: /docs/developer/connecting

**URL:** https://tandemu.dev/docs/developer/connecting

## Content Accuracy Issues

### 1. MCP config file reference is inconsistent
Correct on this page (`~/.mcp.json`), but the Developer Memory page says `~/.claude.json`. All pages should consistently say `~/.mcp.json`.

### 2. Config file examples are accurate
The JSON examples for `tandemu.json`, `settings.json`, and `.mcp.json` match the actual format. Good.

### 3. Token expiry is wrong
> "If your token expires (24 hours)"

Actual JWT expiry is 30 days, not 24 hours.

### 4. Plugin vs install script differences
The page says "Both methods produce the same result" — this is accurate. No issues.

## Rewriting Recommendations

Good reference page. Developers actually need this — config files, what each does.

1. **Add a "Verify your connection" section** — after setup, how to confirm it worked
2. **Add a "Multiple machines" section** — can you use the same account on multiple machines?
3. **Expand troubleshooting** — memory server not responding, skills not found after install, wrong organization
