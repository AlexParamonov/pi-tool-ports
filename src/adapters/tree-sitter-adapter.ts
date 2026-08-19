/**
 * Tree-sitter adapter implementation.
 *
 * Wraps pi-tree-sitter to implement the TreeSitterAdapter interface.
 * This adapter is injected into the gate at runtime.
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

import { collectErrors, MAX_ERRORS } from "./tree-sitter/exports.js";

import type { TreeSitterAdapter } from "./types";

/**
 * Create the tree-sitter adapter.
 *
 * This adapter wraps pi-tree-sitter functions to implement the TreeSitterAdapter interface.
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
