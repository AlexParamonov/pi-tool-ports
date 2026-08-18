/**
 * Syntax-validation gate \u2014 validates content before write.
 *
 * Uses tree-sitter for full AST parsing and delimiter balance checks.
 * The grammar seam is injectable: unit tests use fake parse trees.
 */
import {
  BALANCE_RULES,
  checkDelimiterBalance,
  LANGUAGE_MAP,
} from "../adapters/tree-sitter";
import {
  MAX_ERRORS,
  lineAt,
  formatError,
  collectErrors,
} from "../adapters/tree-sitter/internal";

import type { GrammarFn } from "../types";

const GUARD_MSG =
  "Fix and re-submit. (This is a pre-write guard \u2014 the file was NOT modified.)\n";

function formatErrors(errors: string[]): string {
  let body = errors.join("\n");
  if (errors.length >= MAX_ERRORS) {
    body +=
      "\n  \u2026(truncated at " +
      MAX_ERRORS +
      " errors; fix the listed issues and re-check)";
  }
  return body;
}

interface NodeLike {
  type: string;
  isError: boolean;
  isMissing: boolean;
  startPosition: { row: number; column: number };
  startIndex: number;
  endIndex: number;
  childCount: number;
  child: (i: number) => NodeLike;
  children: NodeLike[];
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
  notify?: (message: string, level: "info" | "error") => void,
): Promise<string | null> {
  const ext = path.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if (!ext) return null;

  const rules = BALANCE_RULES[ext];
  if (!rules && !(ext in LANGUAGE_MAP)) return null;

  if (grammar) {
    const stage = await grammar(ext, content, notify);

    if (stage.available && stage.tree && stage.tree.rootNode.hasError) {
      const errors = collectErrors(
        stage.tree as unknown as { rootNode: NodeLike },
        content,
      );
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
        msg += formatErrors(errors);
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
