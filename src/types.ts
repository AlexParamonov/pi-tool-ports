import type { Tree } from "web-tree-sitter";
import type { NotifyFn } from "pi-tree-sitter/src/grammar";

/**
 * Injectable grammar seam — the validator's only external dependency.
 *
 * The default implementation (gate.ts) calls pts's real grammar loader.
 * Unit tests inject fakes that return predetermined parse trees without
 * WASM, CDN, or cache access.
 *
 * `available` distinguishes "grammar loaded but tree is null/clean"
 * (unconditional pass) from "grammar unavailable" (delimiter-only
 * rules may apply).
 */
export interface GrammarResult {
  available: boolean;
  tree: Tree | null;
}

/**
 * Parser seam: given a file extension and content, returns whether a
 * grammar was loaded and the parsed tree. Unit tests inject fakes here;
 * the default seam downloads WASM grammars from CDN.
 */
export type GrammarFn = (
  ext: string,
  content: string,
  notify?: NotifyFn,
) => Promise<GrammarResult>;
