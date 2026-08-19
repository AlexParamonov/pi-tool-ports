# Changelog

## [0.1.0] — 2026-08-19

Initial release.

### Features

- **Edit tool** — fuzzy matching via pi-semantic-edit with syntax validation gate
- **Write tool** — validates content against file extension before write
- **Syntax validation** — tree-sitter WASM grammars + delimiter balance checks
- **Config files** — `~/.pi/agent/pi-tool-ports.json` (global), `.pi/pi-tool-ports.json` (project override)
- **Warning exclusion** — `exclude.patterns` filters coherence warnings by substring match
- **Adapter config** — `ports.edit.adapters` and `ports.write.adapters` control tool registration and the syntax gate; `[]` disables a port, missing config keeps both tools enabled

### Architecture

- **Adapter registry** — dynamic loading of vendored adapters based on per-port config
- **Dependency injection** — ports receive semantic-edit and tree-sitter adapters via options, not direct imports
- **Build script** — `npm run build:adapters` vendors dependency source files with LICENSE files
- **Factory grammar seam** — `extensionFactory` accepts optional `GrammarFn` for test injection
