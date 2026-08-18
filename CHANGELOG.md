# Changelog

## [Unreleased]

- Initial scaffold: package metadata, CONTEXT.md, ADRs, LICENSE.
- Extension factory: registers exactly one `edit` and one `write` tool with surfaces captured from pse and the built-in write (execute stubbed).
- Gated write tool: validates content against the path's extension before any I/O; blocked calls throw with parity diagnostics and zero filesystem side effects; clean calls delegate to the built-in write unchanged.