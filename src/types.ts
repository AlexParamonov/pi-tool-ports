import type { Tree } from "web-tree-sitter";

/** Structured result from the grammar seam. `available` distinguishes
 *  "grammar loaded but tree is null/clean" (unconditional pass) from
 *  "grammar unavailable" (delimiter-only rules may apply). */
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
) => Promise<GrammarResult>;
