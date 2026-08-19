# Changelog

## [Unreleased]

### Added

- **Adapter registry** — dynamic loading of vendored adapters based on configuration
- **Per-port adapter config** — `ports.edit.adapters` and `ports.write.adapters` in config
- **Build script** — `npm run build:adapters` vendors dependency source files with LICENSE files
- **EditAdapter interface** — ports receive semantic-edit adapter via dependency injection
- **TreeSitterAdapter interface** — gate and ports receive tree-sitter adapter via dependency injection

### Changed

- **Factory honors adapter config** — `ports.edit.adapters` and `ports.write.adapters` now control registration and the syntax gate: an explicit `[]` disables the port (tool not registered); the `edit` tool registers only when `semantic-edit` is listed (its engine); the `write` tool registers for any non-empty list; the syntax gate runs only for ports that list `tree-sitter`, with gate state kept per port on the shared tree-sitter instance. Unknown adapter names are ignored; missing config keeps the previous behavior (both tools, gate on)
- Consolidated semantic-edit adapter into `src/adapters/semantic-edit/index.ts` (single entry point); removed duplicate re-export files
- Consolidated tree-sitter adapter into `src/adapters/tree-sitter/index.ts` (single entry point); removed duplicate re-export files
- Removed semantic-edit vendor; adapter uses direct imports from `pi-semantic-edit` package
- Factory creates adapters and injects them into ports
- Edit port receives editAdapter via options instead of direct imports
- Build script copies only needed files (reduced vendor size)
- Ports no longer import concrete adapter implementations (dependency inversion)

### Fixed

- Removed direct imports from concrete adapters in edit port
- Aligned adapter interfaces with library types for type safety

## [0.0.1] — 2026-08-23

Initial release.

### Features

- **Edit tool** — fuzzy matching via pi-semantic-edit with syntax validation gate
- **Write tool** — validates content against file extension before write
- **Syntax validation** — tree-sitter WASM grammars + delimiter balance checks
- **Config files** — `~/.pi/agent/pi-tool-ports.json` (global), `.pi/pi-tool-ports.json` (project override)
- **Warning exclusion** — `exclude.patterns` filters coherence warnings by substring match
