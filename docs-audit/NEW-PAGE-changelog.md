# Suggested New Page: Changelog

**Proposed URL:** /docs/changelog

## Why This Page Is Needed

Professional docs sites (Stripe, Vercel, Linear) all have changelogs. Users need to know what's new, what changed, and what broke. This is especially important for self-hosters who need to know if an update requires migration changes.

## Suggested Structure

### Format per entry:
```
## v0.X.X — YYYY-MM-DD

### Added
- Feature description

### Changed
- Breaking change or behavior change

### Fixed
- Bug fix description

### Migration notes
- Any database migrations or config changes needed
```

### Content sources:
- Git history (conventional commits)
- CLAUDE.md changelog section (if one exists)
- Migration files (new migrations = schema changes)

### Automation:
Consider generating from git tags and conventional commit messages. Tools like `changesets` or `release-please` can automate this.
