# Changelog

## [Unreleased]

## [0.0.1] — 2026-08-23

Initial release.

### Features

- **Edit tool** — fuzzy matching via pi-semantic-edit with syntax validation gate
- **Write tool** — validates content against file extension before write
- **Syntax validation** — tree-sitter WASM grammars + delimiter balance checks
- **Config files** — `~/.pi/agent/pi-tool-ports.json` (global), `.pi/pi-tool-ports.json` (project override)
- **Warning exclusion** — `exclude.patterns` filters coherence warnings by substring match
