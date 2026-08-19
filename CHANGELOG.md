# Changelog

## [Unreleased]

### Added

- **Factory grammar seam** — `extensionFactory` accepts an optional `GrammarFn` so tests inject fake parse trees; the default stays the real WASM grammars

### Changed

- **Factory honors adapter config** — `ports.edit.adapters` and `ports.write.adapters` now control registration and the syntax gate: an explicit `[]` disables the port (tool not registered); the `edit` tool registers only when `semantic-edit` is listed (its engine); the `write` tool registers when its list contains at least one known adapter name; the syntax gate runs only for ports that list `tree-sitter`, with gate state kept per port on the shared tree-sitter instance. Unknown adapter names are ignored, so a list of only unknown names disables the port; missing config keeps the previous behavior (both tools, gate on)

## [0.0.1] — 2026-08-23

Initial release.

### Features

- **Edit tool** — fuzzy matching via pi-semantic-edit with syntax validation gate
- **Write tool** — validates content against file extension before write
- **Syntax validation** — tree-sitter WASM grammars + delimiter balance checks
- **Config files** — `~/.pi/agent/pi-tool-ports.json` (global), `.pi/pi-tool-ports.json` (project override)
- **Warning exclusion** — `exclude.patterns` filters coherence warnings by substring match

### Architecture

- **Adapter registry** — dynamic loading of vendored adapters based on per-port config
- **Dependency injection** — ports receive semantic-edit and tree-sitter adapters via options, not direct imports
- **Build script** — `npm run build:adapters` vendors dependency source files with LICENSE files
