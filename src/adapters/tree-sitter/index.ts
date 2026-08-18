/**
 * Tree-sitter adapter — wraps pi-tree-sitter for use in gate and ports.
 *
 * This adapter encapsulates the deep imports from pi-tree-sitter,
 * providing a clean interface for syntax validation and grammar loading.
 *
 * Exported symbols come from two sources:
 * 1. Public exports from pi-tree-sitter (BALANCE_RULES, LANGUAGE_MAP, etc.)
 * 2. Internal symbols accessed via internal.ts hack (MAX_ERRORS, lineAt, etc.)
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

// Internal symbols accessed via hack
import * as internals from "./internal";

// Re-export public symbols
export {
  BALANCE_RULES,
  checkDelimiterBalance,
  LANGUAGE_MAP,
  ensureParser,
  loadGrammar,
};

// Re-export internal symbols (accessed via hack)
export const { MAX_ERRORS, CLOSER_LABELS, lineAt, formatError, collectErrors } =
  internals;

export type { NotifyFn };
