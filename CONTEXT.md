# pi-tool-ports context

One pi extension that owns the `edit` and `write` tools, consuming pi-semantic-edit and pi-tree-sitter as plain libraries (deep imports, never as extensions) and gating every mutation on syntax validation before it reaches disk.

## Language

**Host**:
The pi-tool-ports extension itself — owns tool registration, ordering, and data flow for gated edit/write.
_Avoid_: wrapper, adapter layer

**Deep import**:
Importing a dependency's internal module file directly (e.g. `pi-semantic-edit/src/pi/tool`), bypassing its index.ts entry point, so no registration side effects run.
_Avoid_: importing the package, subpath import (when meaning entry-free)

**Entry factory**:
A package's index.ts default export — the function pi's extension loader would invoke to register tools/hooks. Never invoked for the dependency packages.
_Avoid_: extension entry, plugin init

**Tool surface**:
The model-facing definition of a tool: name, description, promptSnippet, promptGuidelines, parameters schema, prepareArguments, renderers. The host's edit tool must expose pi-semantic-edit's surface unchanged.

**Gate**:
The syntax-validation step that may reject a mutation before it is written; "blocked" is its only observable action.
_Avoid_: pre-write guard, validator (when referring to the decision step)

**Blocked call**:
A tool call that fails with an error result (isError) and leaves the filesystem completely untouched — no file modified, no file or directory created.

**Pass-through**:
An unvalidated write: unknown/no extension, or a grammar unavailable at runtime. Deliberate and permanent (never-block), not a degraded mode.
_Avoid_: skip, fallback, soft-block

**Double-confirmation**:
Blocking only when the grammar reports an error AND delimiter balance agrees (Lisp-like languages), so grammar false positives don't block clean code.

**Parity**:
Behavior identical to the baseline contract: pi-semantic-edit's success/error shapes for edit, pi-tree-sitter's gate semantics and message format for validation. "No contract regression" is the edit-side AC.

**Match passes**:
The fuzzy matching chain (whitespace, indentation, escape, Unicode-tolerance passes) pi-semantic-edit uses to resolve oldText. The gap this project closes: pi-tree-sitter's old gate simulated edits with pi's built-in matcher, which cannot see fuzzy-only matches.

**Operation injection**:
Passing custom file-I/O operations into a tool-definition factory (`createEditToolDefinition`/`createWriteToolDefinition` options). Pi's mechanism for intercepting reads/writes; rejected for the write gate because mkdir runs before writeFile.

**File-mutation queue**:
pi's per-file serialization for concurrent mutations (`withFileMutationQueue`) — the host's gated edit runs inside it.