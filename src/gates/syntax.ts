/**
 * Syntax-validation gate — validates content before write.
 *
 * Uses tree-sitter for full AST parsing and delimiter balance checks.
 * Both the grammar seam and tree-sitter adapter are injectable: unit tests
 * use fake parse trees and the factory injects the real adapter.
 */
import type { LexRules } from "pi-tree-sitter/src/delimiter";

import type { GrammarFn, TreeSitterAdapter } from "../types";

const GUARD_MSG =
  "Fix and re-submit. (This is a pre-write guard \u2014 the file was NOT modified.)\n";

function formatErrors(errors: string[], maxErrors: number): string {
  let body = errors.join("\n");
  if (errors.length >= maxErrors) {
    body +=
      "\n  \u2026(truncated at " +
      maxErrors +
      " errors; fix the listed issues and re-check)";
  }
  return body;
}

// ── Gate decision table ────────────────────────────────────────────────

/**
 * Validate content for write/edit blocking. Returns null = clean.
 *
 * The grammar seam is injectable: unit tests inject fakes that return
 * predetermined parse trees without WASM, CDN, or cache access.
 */
export async function validateSyntax(
  path: string,
  content: string,
  grammar?: GrammarFn,
  treeSitter?: TreeSitterAdapter,
  notify?: (message: string, level: "info" | "error") => void,
): Promise<string | null> {
  const ext = path.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if (!ext) return null;

  const {
    BALANCE_RULES,
    LANGUAGE_MAP,
    checkDelimiterBalance,
    collectErrors,
    MAX_ERRORS,
  } = treeSitter ?? (await import("../adapters/tree-sitter"));

  const rules = BALANCE_RULES[ext] as LexRules | undefined;
  if (!rules && !(ext in LANGUAGE_MAP)) return null;

  if (grammar) {
    const stage = await grammar(ext, content, notify);

    if (stage.available && stage.tree && stage.tree.rootNode.hasError) {
      const errors = collectErrors(stage.tree, content);
      if (errors.length > 0) {
        let balanceErr: string | null = null;
        if (rules) {
          balanceErr = checkDelimiterBalance(path, content, rules);
          if (balanceErr === null) {
            return null;
          }
        }
        let msg =
          "Syntax check failed for " +
          path +
          ": " +
          errors.length +
          " error(s) detected by tree-sitter.\n";
        if (balanceErr) {
          msg +=
            "Delimiter balance also reports issues:\n  " + balanceErr + "\n";
        }
        msg += GUARD_MSG;
        msg += formatErrors(errors, MAX_ERRORS);
        return msg;
      }
    }
  }

  // Grammar unavailable or no grammar seam: fall through to delimiter-only
  if (rules) {
    const err = checkDelimiterBalance(path, content, rules);
    if (err) {
      let msg =
        "Syntax check failed for " + path + ": delimiters are unbalanced.\n";
      msg += GUARD_MSG;
      msg += "  " + err;
      return msg;
    }
  }

  return null;
}
