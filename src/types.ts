import type { Tree } from "web-tree-sitter";

import type { NotifyFn } from "./adapters/tree-sitter";
import type { ExcludeConfig } from "./config/types.js";

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

export type GrammarFn = (
  ext: string,
  content: string,
  notify?: NotifyFn,
) => Promise<GrammarResult>;

// ── Gated tool options ──────────────────────────────────────────────

/** Options shared by both gated edit and gated write tools. */
export interface GatedToolOptions {
  grammar?: GrammarFn;
  exclude?: ExcludeConfig;
}

// ── Gate error contract ─────────────────────────────────────────────

/** Structured error a blocked tool call carries (for renderers/debugging). */
export class GateBlockError extends Error {
  editError: { kind: "syntax"; message: string };

  constructor(message: string) {
    super(message);
    this.name = "GateBlockError";
    this.editError = { kind: "syntax", message };
  }
}

export function gateBlockError(message: string): GateBlockError {
  return new GateBlockError(message);
}
