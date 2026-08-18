/**
 * Tree-sitter adapter internals — accesses non-exported symbols from pi-tree-sitter.
 *
 * This file contains the "hack" to access functions that pi-tree-sitter doesn't export.
 * When pi-tree-sitter updates, only this file needs to change.
 *
 * Strategy: Hardcode all values. They're simple, stable, and unlikely to change.
 * If pi-tree-sitter updates these, we update this file.
 */

// Type declarations for symbols we expose
export type LineAtFn = (source: string, offset: number) => string;
export type FormatErrorFn = (node: unknown, source: string) => string;
export type CollectErrorsFn = (tree: unknown, source: string) => string[];

// Constants — hardcoded from pi-tree-sitter (stable values)
export const MAX_ERRORS = 10;
export const CLOSER_LABELS: Record<string, string> = {
  ")": "parenthesis",
  "]": "bracket",
  "}": "brace",
};

// Functions — hardcoded from pi-tree-sitter (stable logic)
export const lineAt: LineAtFn = (source, offset) => {
  const start = source.lastIndexOf("\n", offset - 1) + 1;
  const end = source.indexOf("\n", offset);
  return source.slice(start, end === -1 ? source.length : end);
};

export const formatError: FormatErrorFn = (node, source) => {
  const n = node as {
    type: string;
    isMissing: boolean;
    startPosition: { row: number; column: number };
    startIndex: number;
    endIndex: number;
  };
  const line = n.startPosition.row + 1;
  const col = n.startPosition.column + 1;
  const raw = source.slice(n.startIndex, Math.min(n.endIndex, source.length));
  const snippet = raw.split("\n")[0].slice(0, 80).trimEnd();

  if (n.isMissing) {
    const label = CLOSER_LABELS[n.type];
    if (label) {
      return `Missing \`${n.type}\` — unclosed ${label} at line ${line}:${col}`;
    }
    return `Missing \`${n.type}\` at line ${line}:${col}`;
  }

  const label = CLOSER_LABELS[snippet];
  if (label) {
    return `Unexpected \`${snippet}\` — extra closing ${label} at line ${line}:${col}`;
  }
  return `Unexpected \`${snippet}\` at line ${line}:${col}`;
};

export const collectErrors: CollectErrorsFn = (tree, source) => {
  const t = tree as { rootNode: unknown };
  const errors: string[] = [];
  const stack: unknown[] = [t.rootNode];

  while (stack.length > 0 && errors.length < MAX_ERRORS) {
    const node = stack.pop() as {
      type: string;
      isError: boolean;
      isMissing: boolean;
      startPosition: { row: number; column: number };
      startIndex: number;
      endIndex: number;
      childCount: number;
      child: (i: number) => unknown;
      children: unknown[];
    };
    if (node.isError || node.isMissing) {
      if (node.isError && !node.isMissing) {
        let hasSpecificChild = false;
        for (let i = 0; i < node.childCount; i++) {
          const c = node.child(i) as { isError: boolean; isMissing: boolean };
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
};
