# pi-tool-ports

Hub/interception point for pi tool extensions.

## Install

```bash
pi install npm:pi-tool-ports
```

`pi` loads exactly one extension: this one. It owns the tool registrations — `edit` and `write` today, `read`/`grep` later — and gates every write behind syntax validation.

Other extensions are never loaded into `pi`. Instead they are consumed as plain libraries (deep-imported modules, entry-point factories never invoked), which lets this host compose the best of each without forking them and without duplicate tool registrations or hooks:

- `pi-semantic-edit` → the `edit` tool surface and its matcher/applier pipeline (fuzzy passes, diff/patch, success contract)
- `pi-tree-sitter` → pre-write syntax validation (WASM grammars, delimiter-balance double-confirmation)

A blocked call (broken post-edit syntax, broken `write` content) fails with precise line/column diagnostics and never touches the file on disk.

## Configuration

Optional JSON config files. Project overrides global.

- **Global:** `~/.pi/agent/pi-tool-ports.json`
- **Project:** `.pi/pi-tool-ports.json`

```json
{
  "exclude": {
    "patterns": ["indentation jump"]
  },
  "ports": {
    "edit": { "adapters": ["semantic-edit", "tree-sitter"] },
    "write": { "adapters": ["semantic-edit", "tree-sitter"] }
  }
}
```

- `exclude.patterns`: substring matches against warnings. Default: `[]`.
- `ports.*.adapters`: which adapter libraries a port uses. Default: both.

## Licensing

This project is dual-licensed:

- **Our code** (`src/adapters/registry.ts`, `src/config/`, `src/ports/`, etc.): MIT (see `LICENSE`)
- **Vendored adapter code** (`src/adapters/*/vendor/`): licensed under their original terms:
  - `pi-semantic-edit`: MIT (copyright K2, see `src/adapters/semantic-edit/vendor/LICENSE`)
  - `pi-tree-sitter`: EPL-2.0 (copyright Marko Kocic, see `src/adapters/tree-sitter/vendor/LICENSE`)

Vendored files may be modified minimally (add exports, remove unused imports, cleanup). Logic and behavior are unchanged.

## Toolchain

- Tests: `npm run test` (vitest)
- Type check: `npm run typecheck` (`tsc --noEmit`)
- Format: `npm run format` / `npm run format:check` (prettier)
