# Changelog

## [Unreleased]

- Config file support: `~/.pi/agent/pi-tool-ports.json` (global) and `.pi/pi-tool-ports.json` (project override).
- Warning exclusion: `exclude.patterns` filters warnings by substring match (default: no filtering).
- Initial scaffold: package metadata, CONTEXT.md, ADRs, LICENSE.
- Extension factory: registers exactly one `edit` and one `write` tool with surfaces captured from pse and the built-in write (execute stubbed).
- Syntax-validation gate: reimplemented byte-for-byte from pi-tree-sitter's private validateContent with injectable grammar seam.
- Gated edit tool: read, normalize, apply via pse fuzzy chain, validate write-form bytes, atomic write on clean; parity error on block.
- Gated write tool: validates content against the path's extension before any I/O; blocked calls throw with parity diagnostics and zero filesystem side effects; clean calls delegate to the built-in write unchanged.
- Gate: unknown extensions short-circuit before consulting the grammar seam (AC4 fix).
- Gate: added delimiter-only extension tests and full decision-table matrix test (AC5, AC7).
- Tests: wave 2 acceptance tests — multi-file edit parity (R15: first-seen order, blocked file byte-identical, earlier files already written, per-file gate pass, no-match parity) and load failure (US-12: zero registrations when either tool construction fails, unresolvable deep import rejects at load before the module body runs).
