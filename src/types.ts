/**
 * Injectable grammar seam — the validator's only external dependency.
 *
 * The default implementation (gate.ts) calls pts's real grammar loader.
 * Unit tests inject fakes that return predetermined parse trees without
 * WASM, CDN, or cache access.
 */

export interface GrammarResult {
  available: boolean;
  tree: { rootNode: { hasError: boolean } } | null;
}

export type GrammarFn = (
  ext: string,
  content: string,
  notify?: (message: string, level: "info" | "error") => void,
) => Promise<GrammarResult>;
