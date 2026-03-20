---
name: tandem
description: Connect to the Tandem platform. Sets up authentication via browser-based OAuth flow and saves config to ~/.claude/tandem.json so it works across all repos. Use when first setting up Tandem or reconnecting.
allowed-tools:
  - Bash
  - Read
  - WebFetch
  - AskUserQuestion
---

Connect the developer to the Tandem platform. Config is stored globally at `~/.claude/tandem.json` so it works in every project.

## Steps

### 1. Check for existing config

```bash
cat ~/.claude/tandem.json 2>/dev/null
```

If `~/.claude/tandem.json` already exists with a valid token, verify the token still works:

```bash
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/auth/me"
```

If valid, use AskUserQuestion to ask:
- Question: "You're already connected to Tandem as <name> (<email>). What would you like to do?"
- Options: "Keep current config", "Reconfigure"

If they choose to keep, stop. If reconfigure or token is invalid, continue.

### 2. Ask for deployment type

Use AskUserQuestion:
- Question: "How are you running Tandem?"
- Header: "Deployment"
- Options:
  - Label: "Tandem Cloud (Recommended)", Description: "Connect to the hosted Tandem platform at https://app.tandem.dev"
  - Label: "Self-hosted", Description: "Connect to your own Tandem instance — you'll provide the URL"

If **Cloud**: set `API_URL=https://app.tandem.dev`
If **Self-hosted**: ask the developer for the URL, then validate:

```bash
curl -sf "<URL>/api/health"
```

If the health check fails, tell the developer the URL isn't reachable and ask them to check.

### 3. Initiate CLI auth

```bash
RESPONSE=$(curl -sf -X POST "<API_URL>/api/auth/cli/initiate" -H "Content-Type: application/json")
```

Extract `code` and `url` from the JSON response (nested under `data`).

### 4. Open browser for authorization

Tell the developer:

```
Opening your browser to authorize...

If the browser doesn't open, visit this URL:
  <url>
```

```bash
open "<url>"       # macOS
xdg-open "<url>"   # Linux
```

### 5. Poll for authorization

Poll every 2 seconds, up to 5 minutes:

```bash
curl -sf "<API_URL>/api/auth/cli/status?code=<code>"
```

Check `data.status` in the response. While `pending`, keep polling with message: "Waiting for you to authorize in the browser..."

If `expired`, tell the developer and offer to retry. If `authorized`, extract `data.accessToken`, `data.organizationId`, and `data.user`.

### 6. Select organization

```bash
curl -sf -H "Authorization: Bearer <token>" "<API_URL>/api/organizations"
```

If **multiple orgs**, use AskUserQuestion:
- Question: "Which organization do you want to use?"
- Header: "Organization"
- Options: one per org, label is the org name, description is the slug

If **one org**, use it automatically and tell the developer.

If **no orgs**: "You don't have an organization yet. Go to <FRONTEND_URL>/setup to create one, then run /tandem again." Then stop.

### 7. Select team

```bash
curl -sf -H "Authorization: Bearer <token>" "<API_URL>/api/organizations/<orgId>/teams"
```

If **multiple teams**, use AskUserQuestion:
- Question: "Which team are you on?"
- Header: "Team"
- Options: one per team, label is team name, description is team description (or member count)

If **one team**, use it automatically. If **no teams**, skip.

### 8. Write global config

```bash
mkdir -p ~/.claude
```

Write `~/.claude/tandem.json`:

```json
{
  "auth": {
    "token": "<accessToken>"
  },
  "user": {
    "id": "<user.id>",
    "email": "<user.email>",
    "name": "<user.name>"
  },
  "organization": {
    "id": "<orgId>",
    "name": "<orgName>"
  },
  "team": {
    "id": "<teamId or empty string>",
    "name": "<teamName or empty string>"
  },
  "api": {
    "url": "<API_URL>"
  }
}
```

### 9. Confirm

```
Tandem connected!

  Account: <name> (<email>)
  Organization: <org name>
  Team: <team name or "None">
  API: <API_URL>
  Config: ~/.claude/tandem.json

You can now use these skills in any repo:
  /morning   — Start your day, pick a task
  /standup   — Team standup report
  /blockers  — Show team friction & blockers
  /finish    — Wrap up current task
```
