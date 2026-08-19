/**
 * Tree-sitter adapter — wraps pi-tree-sitter for use in gate and ports.
 *
 * Single entry point for the adapter: re-exports the vendored helpers
 * (via exports.js) and the pi-tree-sitter functions, and provides the
 * TreeSitterAdapter factory injected into the gate at runtime.
 */
import type { LexRules } from "pi-tree-sitter/src/delimiter";
import {
  BALANCE_RULES,
  checkDelimiterBalance,
} from "pi-tree-sitter/src/delimiter";
import {
  LANGUAGE_MAP,
  ensureParser,
  loadGrammar,
} from "pi-tree-sitter/src/grammar";
import type { NotifyFn } from "pi-tree-sitter/src/grammar";

import {
  CLOSER_LABELS,
  MAX_ERRORS,
  collectErrors,
  formatError,
  lineAt,
} from "./exports.js";

import type { TreeSitterAdapter } from "../types";

// Re-export everything used by gate.ts, index.ts and the adapter registry
export {
  BALANCE_RULES,
  checkDelimiterBalance,
  LANGUAGE_MAP,
  ensureParser,
  loadGrammar,
  lineAt,
  formatError,
  collectErrors,
  MAX_ERRORS,
  CLOSER_LABELS,
};

export type { NotifyFn };

/**
 * Create the tree-sitter adapter.
 *
 * Wraps pi-tree-sitter functions to implement the TreeSitterAdapter interface.
 */
export function createTreeSitterAdapter(): TreeSitterAdapter {
  return {
    BALANCE_RULES: BALANCE_RULES as Record<string, LexRules>,
    LANGUAGE_MAP: LANGUAGE_MAP as Record<string, unknown>,
    ensureParser,
    loadGrammar: loadGrammar as TreeSitterAdapter["loadGrammar"],
    checkDelimiterBalance,
    collectErrors: collectErrors as TreeSitterAdapter["collectErrors"],
    MAX_ERRORS,
  };
}
