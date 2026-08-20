# Pi tool ports

Pi extension that lets you combine incompatible tool extensions as pluggable adapters fitting into defined ports.

## Install

```bash
pi install npm:pi-tool-ports
```

## Architecture

`pi` loads only this extension. The user picks which ports and adapters to use in config.

This keeps conflicting extensions from stepping on each other and avoids system prompt pollution.

**Ports** own tool registrations and execution flow. Currently `edit` and `write` are supported.

**Adapters** are extensions consumed as deep-imported libraries, not as pi extensions. The entry factories never run. This lets the host combine features without forking code or registering tools twice:

- `pi-semantic-edit`: edit tool surface with fuzzy matching
- `pi-tree-sitter`: pre-write syntax validation (WASM grammars + delimiter balance)

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
    "write": { "adapters": ["tree-sitter"] }
  }
}
```

- `ports.<port>.adapters`: which adapters each port uses
  - `["semantic-edit", "tree-sitter"]`: default
  - `[]`: disables the port
  - Missing `tree-sitter`: disables syntax gate for that port
  - Unknown adapter names are ignored
- `exclude.patterns`: substring matches against tool result warnings (default: `[]`)

## Known issues

We install all adapters as npm dependencies but only activate selected ones.

Selective installation is planned if needed.

## Licensing

- **Our code**: MIT (see `LICENSE`)
- **Vendored adapter code** (`src/adapters/*/vendor/`): licensed under their original terms:
  - `pi-semantic-edit`: MIT (copyright K2, see `src/adapters/semantic-edit/vendor/LICENSE`)
  - `pi-tree-sitter`: EPL-2.0 (copyright Marko Kocic, see `src/adapters/tree-sitter/vendor/LICENSE`)

Vendored files may be modified minimally (add exports, remove unused imports, cleanup).

## Development

```bash
npm run test          # vitest
npm run typecheck     # tsc --noEmit
npm run format        # prettier
npm run format:check  # prettier check
```
