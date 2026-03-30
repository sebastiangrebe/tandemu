# Suggested New Page: Security

**Proposed URL:** /docs/security

## Why This Page Is Needed

Tandemu collects developer telemetry — this is inherently sensitive. Engineering leads evaluating Tandemu need a clear security page before approving deployment. Every serious developer tool has one (GitHub, GitLab, Snyk, etc.).

## Suggested Structure

### Data Collection Principles
- What is collected (session metadata, line counts, file paths, friction events)
- What is NOT collected (prompt content, keystrokes, screen recordings, source code)
- Developer transparency — same data visible to developers and leads

### Authentication & Authorization
- JWT-based authentication with configurable expiry
- Role-based access control (Owner, Admin, Member)
- Row-Level Security (RLS) in PostgreSQL for tenant isolation
- CLI OAuth flow for device authorization

### Data Encryption
- API tokens encrypted at rest (AES-256-GCM)
- Transit encryption (HTTPS recommended for production)
- JWT signing with configurable secret

### Data Residency
- Self-hosted: all data on your infrastructure
- Cloud: data location and retention policies
- No third-party analytics or tracking in the product

### Integration Security
- Ticket system tokens encrypted at rest
- Minimal permissions required (read tasks, update status)
- No source code access through integrations
- Real-time API proxying (no task data stored)

### Memory Privacy
- Per-user memory isolation via MCP URL scoping
- Personal memories private to individual developers
- Organization memories go through draft-to-published gating
- No secrets, tokens, or passwords stored in memory
- Memory stored in Qdrant (self-hosted) or managed infrastructure (cloud)

### Infrastructure (Self-Hosted)
- Docker Compose with no external dependencies
- All services run on private network
- Production hardening checklist:
  - Change JWT_SECRET
  - Enable HTTPS via reverse proxy
  - Restrict CORS origin
  - Firewall rules for service ports
  - Regular backups

### Vulnerability Reporting
- Contact email for security reports
- Responsible disclosure policy
