# Lessons Learned

## Build
- Fresh worktree: run `npm ci` + `npm run build:adapters` before testing. Vendor dir is gitignored; `node_modules` may silently resolve from the main checkout.

## Config
- `loadConfig` fills defaults per key. A partial project config (e.g. only `edit`) drops the global `ports` entirely via `project?.ports ?? global?.ports` — not per-port inheritance.

## Ingest (append new lessons at EOF)

> Empty. New `## <name> (<detail>) - YYYY-MM-DD` entries land here.
