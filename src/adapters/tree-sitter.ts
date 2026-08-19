/**
 * Tree-sitter adapter — wraps pi-tree-sitter for use in gate and ports.
 *
 * This adapter encapsulates the deep imports from pi-tree-sitter,
 * providing a clean interface for syntax validation and grammar loading.
 */
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
  lineAt,
  formatError,
  collectErrors,
  MAX_ERRORS,
} from "./tree-sitter/exports.js";

// Re-export everything used by gate.ts and index.ts
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
};

export type { NotifyFn };
