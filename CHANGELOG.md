# Changelog

## [Unreleased]

- Initial scaffold: package metadata, CONTEXT.md, ADRs, LICENSE.
- Extension factory: registers exactly one `edit` and one `write` tool with surfaces captured from pse and the built-in write (execute stubbed).
- Syntax-validation gate: reimplemented byte-for-byte from pi-tree-sitter's private validateContent with injectable grammar seam.
- Gated edit tool: read, normalize, apply via pse fuzzy chain, validate write-form bytes, atomic write on clean; parity error on block.
- Gated write tool: validates content against the path's extension before any I/O; blocked calls throw with parity diagnostics and zero filesystem side effects; clean calls delegate to the built-in write unchanged.
- Gate: unknown extensions short-circuit before consulting the grammar seam (AC4 fix).
- Gate: added delimiter-only extension tests and full decision-table matrix test (AC5, AC7).
