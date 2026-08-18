# Lessons Learned

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
