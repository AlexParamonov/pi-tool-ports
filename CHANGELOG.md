# Changelog

## [Unreleased]

### Added

- **Adapter registry** — dynamic loading of vendored adapters based on configuration
- **Per-port adapter config** — `ports.edit.adapters` and `ports.write.adapters` in config
- **Build script** — `npm run build:adapters` vendors dependency source files with LICENSE files
- **Tree-sitter adapter injection** — gate receives tree-sitter adapter via dependency injection

### Changed

- Factory loads adapters dynamically based on config instead of static imports
- Gate accepts tree-sitter adapter injection (preserves existing grammar seam pattern)

## [0.0.1] — 2026-08-23

Initial release.

### Features

- **Edit tool** — fuzzy matching via pi-semantic-edit with syntax validation gate
- **Write tool** — validates content against file extension before write
- **Syntax validation** — tree-sitter WASM grammars + delimiter balance checks
- **Config files** — `~/.pi/agent/pi-tool-ports.json` (global), `.pi/pi-tool-ports.json` (project override)
- **Warning exclusion** — `exclude.patterns` filters coherence warnings by substring match
