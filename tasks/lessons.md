# Lessons Learned

## honor-adapter-config - 2026-08-19

**What worked:**
- Injecting config through the existing `loadConfig(io?: ConfigIO)` seam (optional factory arg) gave factory tests full config control with no vi.mock, no env vars, no vi.resetModules
- Mutation check (hardcode `gate: true`, watch AC tests fail, revert) proved post-hoc tests pin the behavior when an implementation cycle landed ahead of its tests

**What failed:**
- Fresh build-tree worktree had an empty `node_modules/`; npm test "worked" by silently resolving from the main checkout's node_modules up the directory tree. Baseline showed 59 failures with `Cannot find module './vendor/index.js'` — the vendor dir is gitignored and must be generated. Fix: `npm ci` + `npm run build:adapters` in the worktree before trusting any test result
- First draft of the `write: ["tree-sitter"]` test assumed only the configured port registers; `loadConfig` fills the other port with defaults, so edit registered too. Config-merge semantics (per-key fallback) must be in the test author's model

**Next time:**
- In a worktree, verify `node_modules` is populated locally (non-empty) before running tests; never let resolution fall through to another checkout
- Run `npm run build:adapters` (vendor dir is gitignored, required by `src/adapters/tree-sitter/exports.js`) before the first test run

## gated-edit-write - 2025-08-18

**What worked:**
- Parallel slice execution within waves (1.1+1.2, 1.3+1.4, 2.1+2.2) significantly reduced wall-clock time
- Three-valued grammar seam (`{ available, tree }`) was load-bearing for US-8 false-positive protection — collapsing to `Tree | null` would have broken parity
- Voice-of-reason step caught the module-level vs parameter injection decision early, preventing a shared-mutable-state antipattern
- Acceptance test writer produced 44 tests before any implementation, giving builders clear red-green targets
- Manual tmux testing caught the missing grammar seam wiring that unit tests couldn't (real CDN grammars vs fakes)

**What failed:**
- Initial merge of parallel slices brought in test files for unimplemented sibling slices, breaking typecheck — needed a fix commit before proceeding
- Builder for slice 1.2 wrote a fix plan (fix-1.md) but didn't implement it; had to re-spawn with explicit "implement the fixes" instruction
- `web-tree-sitter` as transitive dep caused npm install triggers during extension load — should have been direct dep from the start per spec's own flag
- Manual test W2-AC2 recipe in wave.md was stale (wrong import path for sed target) — planner caught and corrected it

**Next time:**
- Add `web-tree-sitter` as direct dependency immediately when it's imported in source, even if spec says "transitive" — the import makes it a hard runtime requirement
- When parallel slices share test scaffolding, the acceptance test writer should note which test files belong to which slice to avoid merge conflicts
- Builder prompts should explicitly say "implement the fixes described in the plan, not just write the plan" when re-spawning after a partial fix
