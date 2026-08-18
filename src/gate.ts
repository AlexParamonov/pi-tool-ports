/**
 * Syntax-validation gate — reimplemented byte-for-byte from pi-tree-sitter's
 * private validateContent/collectErrors/formatError/lineAt/CLOSER_LABELS/MAX_ERRORS.
 *
 * This is the only new logic in the host. The three message templates and
 * per-error rendering are the byte-parity contract (spec "Known Constraints
 * & Risks"). The grammar seam is injectable: unit tests use fake parse trees;
 * the default implementation calls pts's real grammar loader.
 */
import {
  BALANCE_RULES,
  checkDelimiterBalance,
} from "pi-tree-sitter/src/delimiter";
import { LANGUAGE_MAP } from "pi-tree-sitter/src/grammar";

import type { GrammarFn } from "./types";

// ── Error collection (byte-for-byte from pi-tree-sitter/index.ts) ──────

const MAX_ERRORS = 10;

/** The guard message appended to every blocked-call diagnostic. */
const GUARD_MSG =
  "Fix and re-submit. (This is a pre-write guard \u2014 the file was NOT modified.)\n";

/** Format a list of error diagnostics, capping at MAX_ERRORS. */
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

/** Return the line content that contains `offset`, for context. */
function lineAt(source: string, offset: number): string {
  const start = source.lastIndexOf("\n", offset - 1) + 1;
  const end = source.indexOf("\n", offset);
  return source.slice(start, end === -1 ? source.length : end);
}

/** Names for anonymous closing-token types that clarify the issue. */
const CLOSER_LABELS: Record<string, string> = {
  ")": "parenthesis",
  "]": "bracket",
  "}": "brace",
};

/** Produce a human-readable, context-rich error for one tree-sitter node. */
function formatError(node: NodeLike, source: string): string {
  const line = node.startPosition.row + 1;
  const col = node.startPosition.column + 1;
  const raw = source.slice(
    node.startIndex,
    Math.min(node.endIndex, source.length),
  );
  const snippet = raw.split("\n")[0].slice(0, 80).trimEnd();

  if (node.isMissing) {
    const label = CLOSER_LABELS[node.type];
    if (label) {
      return `Missing \`${node.type}\` — unclosed ${label} at line ${line}:${col}`;
    }
    return `Missing \`${node.type}\` at line ${line}:${col}`;
  }

  // Error node (unexpected token)
  const label = CLOSER_LABELS[snippet];
  if (label) {
    return `Unexpected \`${snippet}\` — extra closing ${label} at line ${line}:${col}`;
  }
  return `Unexpected \`${snippet}\` at line ${line}:${col}`;
}

/** Minimal node shape used by collectErrors and formatError. */
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

function collectErrors(tree: { rootNode: NodeLike }, source: string): string[] {
  const errors: string[] = [];
  const stack: NodeLike[] = [tree.rootNode];

  while (stack.length > 0 && errors.length < MAX_ERRORS) {
    const node = stack.pop()!;
    if (node.isError || node.isMissing) {
      // ERROR nodes can span a large region with more specific
      // error/missing children inside.  Descend to find the narrowest
      // error — the child will have a better position and snippet.
      if (node.isError && !node.isMissing) {
        let hasSpecificChild = false;
        for (let i = 0; i < node.childCount; i++) {
          const c = node.child(i);
          if (c.isError || c.isMissing) {
            hasSpecificChild = true;
            break;
          }
        }
        if (hasSpecificChild) {
          for (let i = node.childCount - 1; i >= 0; i--)
            stack.push(node.child(i));
          continue;
        }
      }
      const msg = formatError(node, source);
      const offset = node.startIndex;
      const ctxLine = lineAt(source, offset);
      const lineStart = source.lastIndexOf("\n", offset) + 1;
      const col = offset - lineStart;
      const pointer = " ".repeat(Math.max(0, col)) + "^";
      const lineNum = node.startPosition.row + 1;
      errors.push(
        "  " +
          msg +
          "\n    |\n    " +
          lineNum +
          " | " +
          ctxLine +
          "\n    | " +
          pointer,
      );
      continue;
    }
    const children = node.children;
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  return errors;
}

// ── Gate decision table ────────────────────────────────────────────────

/**
 * Validate content for write/edit blocking. Returns null = clean.
 *
 * The grammar seam is injectable: unit tests inject fakes that return
 * predetermined parse trees without WASM, CDN, or cache access.
 */
export async function validateContent(
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
