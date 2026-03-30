# Suggested New Page: FAQ

**Proposed URL:** /docs/faq

## Why This Page Is Needed

FAQs catch the questions that don't fit neatly into other pages. They're also great for SEO and reduce support burden.

## Suggested Questions

### General
- **What is Tandemu?** — One-paragraph answer linking to Introduction
- **Is Tandemu open source?** — Yes, same codebase for OSS and SaaS
- **Does Tandemu work with editors other than Claude Code?** — Currently Claude Code only
- **What ticket systems are supported?** — Jira, Linear, ClickUp, GitHub Issues
- **Can I use Tandemu without a ticket system?** — Yes, but /morning won't show tasks

### Privacy & Security
- **Does Tandemu read my code?** — No. It captures metadata (file paths, line counts), not source code or prompts
- **Can my manager see what I'm typing?** — No. No keystroke logging, no screen capture, no prompt content
- **Is the data the same for developers and leads?** — Yes, same dashboard, same data
- **Where is my data stored?** — Self-hosted: your infrastructure. Cloud: [location TBD]

### Developer Workflow
- **What if I forget to run /morning?** — You can run it anytime. Telemetry only captures from /morning to /finish
- **Can I work on multiple tasks?** — Yes, each in its own worktree
- **What if I don't use /finish?** — No telemetry is captured for that session
- **Does Tandemu slow down Claude Code?** — No measurable impact. Skills are on-demand, telemetry is async

### Memory
- **Can I see what Claude remembers about me?** — Yes, ask "What do you remember about me?" or browse /memory
- **Can I delete memories?** — Yes, via the dashboard or by asking Claude
- **Are my memories visible to my team?** — Personal memories are private. Organization memories are shared after review

### Self-Hosting
- **What are the hardware requirements?** — 4GB RAM minimum, 8GB recommended
- **How do I update?** — git pull && docker compose up --build -d
- **Is there a managed cloud option?** — Yes, at tandemu.dev
- **Can I migrate from self-hosted to cloud (or vice versa)?** — [Document migration path]

### Billing (SaaS)
- **Is there a free tier?** — [Document pricing]
- **What happens when I exceed limits?** — [Document behavior]
- **Can I cancel anytime?** — [Document cancellation]
