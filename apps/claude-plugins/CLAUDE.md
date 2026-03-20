# CLAUDE.md — Tandem AI Teammate Constitution

## Project Overview

You are an AI Teammate integrated with the Tandem platform. Tandem is a monorepo that provides an AI-powered development assistant combining a NestJS backend, a React frontend, an MCP (Model Context Protocol) memory server, and this Claude plugins system. Your role is to assist developers by automating workflows, reviewing code, managing branches, and maintaining project context through memory.

## Monorepo Structure

```
tandem/
  apps/
    backend/        — NestJS API server
    frontend/       — React web application
    mcp-server/     — MCP memory server (Mem0-based)
    claude-plugins/ — Claude Code plugin system (you are here)
  packages/         — Shared libraries
```

## Code Style Guidelines

- **Language**: TypeScript (strict mode enabled)
- **Module system**: ESM (`"type": "module"` in package.json)
- **Framework patterns**: Follow NestJS conventions for the backend (modules, controllers, services, DTOs)
- **Formatting**: Use Prettier defaults — 2-space indentation, single quotes, trailing commas
- **Linting**: Follow ESLint rules defined at the repo root
- **Naming**:
  - Files: `kebab-case.ts`
  - Classes: `PascalCase`
  - Functions and variables: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Interfaces: `PascalCase`, no `I` prefix
- **Imports**: Prefer named imports; avoid `import *`
- **Error handling**: Always use typed errors; never swallow exceptions silently
- **Types**: Avoid `any`; prefer `unknown` when the type is genuinely unknown

## Git Workflow

- **Branch naming**: `feat/<ticket-id>-<short-description>`, `fix/<ticket-id>-<short-description>`, `chore/<description>`
- **Commit messages**: Follow Conventional Commits:
  - `feat: add user authentication flow`
  - `fix: resolve memory leak in session handler`
  - `chore: update dependencies`
  - `docs: add API endpoint documentation`
  - `test: add unit tests for review skill`
- **Pull requests**:
  - Title matches the primary conventional commit type
  - Description includes: Summary, Changes, Test Plan, and any relevant screenshots
  - Always target `main` unless working on a release branch
- **Branching**: Always branch from an up-to-date `main`

## Testing Requirements

- Write unit tests for all new utility functions and services
- Use `vitest` or `jest` as the test runner (check the repo root config)
- Aim for meaningful coverage, not 100% line coverage — focus on edge cases and critical paths
- Integration tests should use test fixtures, not live services
- Run `npm test` before creating a PR

## Architecture Notes

- The backend uses NestJS with a modular architecture. Each domain has its own module.
- The MCP server exposes memory tools (store, recall, search) over the Model Context Protocol.
- The frontend communicates with the backend via REST and WebSocket APIs.
- Claude plugins (skills, hooks, config) extend the AI Teammate's capabilities within Claude Code sessions.

## Memory Usage Guidelines

- Use MCP memory tools to persist context across sessions:
  - `memory_store` — Save important decisions, architectural context, or user preferences
  - `memory_recall` — Retrieve previously stored context before starting a task
  - `memory_search` — Search for relevant memories when context is unclear
- Store memories for:
  - Architectural decisions and their rationale
  - User preferences for code style or workflow
  - Recurring patterns or issues in the codebase
  - Task context that spans multiple sessions
- Keep memories concise and tagged with relevant keywords for easy retrieval
- Do not store secrets, tokens, or credentials in memory

## Plugin System

This directory contains the Claude Code plugin system:

- **skills/** — Markdown skill definitions that extend Claude Code with domain-specific workflows
- **hooks/** — Shell scripts that run at lifecycle events (pre-session, post-commit, post-task)
- **tandem-config.example.json** — Configuration template for connecting to the Tandem platform
- **mcp-config.example.json** — MCP server configuration for memory integration
