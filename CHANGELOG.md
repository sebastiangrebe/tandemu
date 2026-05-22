# Changelog

## [0.5.0](https://github.com/sebastiangrebe/tandemu/compare/v0.4.1...v0.5.0) (2026-05-22)

### Features

* **billing:** generic resource caps for Lifetime Deal tiers ([58029ea](https://github.com/sebastiangrebe/tandemu/commit/58029ea0bb96ef511b384e324fd436052d6f13ae))
* **frontend:** AppSumo license redemption on settings ([2db7938](https://github.com/sebastiangrebe/tandemu/commit/2db7938f3e77a7bf62ad216c784a022b01bbd7f4))
* **frontend:** gate AppSumo redeem UI behind NEXT_PUBLIC_APPSUMO_REDEEM_ENABLED ([15c9179](https://github.com/sebastiangrebe/tandemu/commit/15c917959eb1ff4fa23f8c37eeebcd45509eee9b))
* **install,mcp:** add Cursor/Copilot/Codex targets via MCP-first model ([307770f](https://github.com/sebastiangrebe/tandemu/commit/307770fbd4606cc1244391880578388a74648b3c))

### Bug Fixes

* **install,skills:** drop /setup from Cursor/Codex success echo, harden pause OTEL fallback ([796decd](https://github.com/sebastiangrebe/tandemu/commit/796decd5cee12db96e53eab77b132c158e19b7de))
* **install,skills:** exclude setup from Cursor/Codex, route OTEL via env loader ([e2bfd91](https://github.com/sebastiangrebe/tandemu/commit/e2bfd91b4326d169d98f3bca14164dc5c53a6c9f))
* **install:** bake token into opencode mcp headers, disable oauth ([cf7eb94](https://github.com/sebastiangrebe/tandemu/commit/cf7eb940f2d6961cc33c295204d5af8a044d20cd))
* **install:** single source of truth for env loader across plugin + install.sh ([db472ae](https://github.com/sebastiangrebe/tandemu/commit/db472ae7aed2144daba801f8efd6bf7f40a4d62d))
* **memory,opencode:** add GET /mcp 405 + drop legacy plugin name ([1d7caa0](https://github.com/sebastiangrebe/tandemu/commit/1d7caa0ec5d1bf703fae79d31c7e3cee2a82c905))
* **memory:** return SSE stream on GET /mcp instead of 405 ([818072d](https://github.com/sebastiangrebe/tandemu/commit/818072da8d09b89a12cb87d4e5ff3ab4075d7ce0))

## [0.4.1](https://github.com/sebastiangrebe/tandemu/compare/v0.4.0...v0.4.1) (2026-05-01)

### Bug Fixes

* **opencode-plugin:** rename to @sebastiangrebe/opencode-plugin ([d0898a4](https://github.com/sebastiangrebe/tandemu/commit/d0898a4b20b53cbbfef546d82abcb64de8ab4690))
* **release:** drop unsupported bumper out-object, write VERSION.ts in bump script ([7f0f233](https://github.com/sebastiangrebe/tandemu/commit/7f0f2335f4a35abfd1a3c862da54b02f7600032e))

All notable changes to this project will be documented in this file.
