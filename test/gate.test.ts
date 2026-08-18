// Acceptance tests for the validator (wave 1, slice 1.2).
//
// `validateContent` is the driving port of the gate: tests pin the full
// decision table and the byte-parity message contract (the three templates
// and per-error rendering from the spec, byte-for-byte from pi-tree-sitter).
// The grammar seam is faked — no WASM, no CDN, no cache in unit tests.

import { describe, expect, test } from "vitest";

import { validateContent } from "../src/gate";
import type { GrammarFn } from "../src/types";
import {
  cleanFakeTree,
  makeFakeTree,
  recordingGrammar,
  STRAY_SEMICOLON_NODE,
} from "./helpers";

// A stray `;` where an operand belongs — the tree-sitter ERROR node lands on
// the `;` at line 1, column 11 (1-based).
const BROKEN_TS = "const x = ;\nconsole.log(x);\n";
const BROKEN_NODE = STRAY_SEMICOLON_NODE;

const SINGLE_ERROR_MESSAGE =
  "Syntax check failed for a.ts: 1 error(s) detected by tree-sitter.\n" +
  "Fix and re-submit. (This is a pre-write guard — the file was NOT modified.)\n" +
  "  Unexpected `;` at line 1:11\n" +
  "    |\n" +
  "    1 | const x = ;\n" +
  "    |           ^";

describe("gate: passing content", () => {
  test("passes clean content when the grammar is available", async () => {
    const { grammar } = recordingGrammar({
      available: true,
      tree: cleanFakeTree(),
    });
    const result = await validateContent("a.ts", "const x = 1;\n", grammar);
    expect(result).toBeNull();
  });

  test("passes content when the grammar is unavailable and the extension has no delimiter rules", async () => {
    const { grammar } = recordingGrammar({ available: false, tree: null });
    const result = await validateContent("a.ts", BROKEN_TS, grammar);
    expect(result).toBeNull();
  });

  test("passes content when the grammar is available but the parse produced no tree", async () => {
    const { grammar } = recordingGrammar({ available: true, tree: null });
    const result = await validateContent("a.ts", BROKEN_TS, grammar);
    expect(result).toBeNull();
  });

  test("passes extensionless content without consulting the grammar", async () => {
    const { grammar, calls } = recordingGrammar({
      available: true,
      tree: cleanFakeTree(),
    });
    const result = await validateContent("README", "const x = ;\n", grammar);
    expect(result).toBeNull();
    expect(calls).toEqual([]);
  });

  test("passes content with an unknown extension without consulting the parser", async () => {
    const { grammar, calls } = recordingGrammar({
      available: false,
      tree: null,
    });
    const result = await validateContent("data.xyz", "const x = ;\n", grammar);
    expect(result).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("gate: blocking on grammar errors (no delimiter rules)", () => {
  test("blocks a single grammar error with the byte-exact parity message", async () => {
    const { grammar } = recordingGrammar({
      available: true,
      tree: makeFakeTree([BROKEN_NODE]),
    });
    const result = await validateContent("a.ts", BROKEN_TS, grammar);
    expect(result).toBe(SINGLE_ERROR_MESSAGE);
  });

  test("labels a missing closing brace as an unclosed brace", async () => {
    const content = "function f() {\n  return 1\n";
    // The grammar reports the missing `}` at the end of the file.
    const missingBrace = {
      type: "}",
      isMissing: true,
      position: { row: 2, column: 10 },
      start: 25,
      end: 25,
    };
    const { grammar } = recordingGrammar({
      available: true,
      tree: makeFakeTree([missingBrace]),
    });
    const result = await validateContent("a.ts", content, grammar);
    const expected =
      "Syntax check failed for a.ts: 1 error(s) detected by tree-sitter.\n" +
      "Fix and re-submit. (This is a pre-write guard — the file was NOT modified.)\n" +
      "  Missing `}` — unclosed brace at line 3:11\n" +
      "    |\n" +
      "    3 |   return 1\n" +
      "    | ^";
    expect(result).toBe(expected);
  });

  test("labels an extra closing parenthesis as an extra closing parenthesis", async () => {
    const content = "const x = 1\n)\n";
    // The stray `)` is reported as an ERROR node whose snippet is `)`.
    const strayCloser = {
      type: "ERROR",
      isError: true,
      position: { row: 1, column: 0 },
      start: 12,
      end: 13,
    };
    const { grammar } = recordingGrammar({
      available: true,
      tree: makeFakeTree([strayCloser]),
    });
    const result = await validateContent("a.ts", content, grammar);
    const expected =
      "Syntax check failed for a.ts: 1 error(s) detected by tree-sitter.\n" +
      "Fix and re-submit. (This is a pre-write guard — the file was NOT modified.)\n" +
      "  Unexpected `)` — extra closing parenthesis at line 2:1\n" +
      "    |\n" +
      "    2 | )\n" +
      "    | ^";
    expect(result).toBe(expected);
  });

  test("reports the narrowest error node for a nested error", async () => {
    const content = "let x = ;\nlet y = 1;\n";
    // A broad ERROR node spanning line 1 contains the specific `;` error.
    const nested = [
      {
        type: "ERROR",
        isError: true,
        position: { row: 0, column: 0 },
        start: 0,
        end: 8,
        children: [
          {
            type: "ERROR",
            isError: true,
            position: { row: 0, column: 8 },
            start: 8,
            end: 9,
          },
        ],
      },
    ];
    const { grammar } = recordingGrammar({
      available: true,
      tree: makeFakeTree(nested),
    });
    const result = await validateContent("a.ts", content, grammar);
    const expected =
      "Syntax check failed for a.ts: 1 error(s) detected by tree-sitter.\n" +
      "Fix and re-submit. (This is a pre-write guard — the file was NOT modified.)\n" +
      "  Unexpected `;` at line 1:9\n" +
      "    |\n" +
      "    1 | let x = ;\n" +
      "    |         ^";
    expect(result).toBe(expected);
  });

  test("caps diagnostics at 10 errors with the truncation line", async () => {
    // 12 identical broken lines — only the first 10 may be reported.
    const content = Array.from({ length: 12 }, () => "const a = ;\n").join("");
    const nodes = Array.from({ length: 12 }, (_, i) => ({
      type: "ERROR",
      isError: true,
      position: { row: i, column: 10 },
      start: 12 * i + 10,
      end: 12 * i + 11,
    }));
    const { grammar } = recordingGrammar({
      available: true,
      tree: makeFakeTree(nodes),
    });
    const result = await validateContent("a.ts", content, grammar);
    const blocks = Array.from({ length: 10 }, (_, i) => {
      const line = i + 1;
      return (
        `  Unexpected \`;\` at line ${line}:11\n` +
        "    |\n" +
        `    ${line} | const a = ;\n` +
        "    |           ^"
      );
    }).join("\n");
    const expected =
      "Syntax check failed for a.ts: 10 error(s) detected by tree-sitter.\n" +
      "Fix and re-submit. (This is a pre-write guard — the file was NOT modified.)\n" +
      blocks +
      "\n  …(truncated at 10 errors; fix the listed issues and re-check)";
    expect(result).toBe(expected);
  });
});

describe("gate: Lisp-like double confirmation", () => {
  // (def x 1) is balanced; (def x 1 leaves one `(` unclosed.
  const BALANCED_CLJ = "(def x 1)\n";
  const UNBALANCED_CLJ = "(def x 1";
  // A grammar error on the balanced content (false-positive shape).
  const CLJ_ERROR_NODE = {
    type: "ERROR",
    isError: true,
    position: { row: 0, column: 5 },
    start: 5,
    end: 6,
  };
  // The missing `)` at the end of the unbalanced content.
  const CLJ_MISSING_NODE = {
    type: ")",
    isMissing: true,
    position: { row: 0, column: 8 },
    start: 8,
    end: 8,
  };
  const BALANCE_ERROR =
    "a.clj: 1 unclosed `(` — the one at line 1 is never closed; add 1 matching `)`";

  test("passes when the grammar errors but delimiters balance", async () => {
    const { grammar } = recordingGrammar({
      available: true,
      tree: makeFakeTree([CLJ_ERROR_NODE]),
    });
    const result = await validateContent("a.clj", BALANCED_CLJ, grammar);
    expect(result).toBeNull();
  });

  test("blocks when the grammar errors and delimiters are unbalanced", async () => {
    const { grammar } = recordingGrammar({
      available: true,
      tree: makeFakeTree([CLJ_MISSING_NODE]),
    });
    const result = await validateContent("a.clj", UNBALANCED_CLJ, grammar);
    const expected =
      "Syntax check failed for a.clj: 1 error(s) detected by tree-sitter.\n" +
      "Delimiter balance also reports issues:\n" +
      `  ${BALANCE_ERROR}\n` +
      "Fix and re-submit. (This is a pre-write guard — the file was NOT modified.)\n" +
      "  Missing `)` — unclosed parenthesis at line 1:9\n" +
      "    |\n" +
      "    1 | (def x 1\n" +
      "    |         ^";
    expect(result).toBe(expected);
  });

  test("blocks on delimiter imbalance alone when the grammar is unavailable", async () => {
    const { grammar } = recordingGrammar({ available: false, tree: null });
    const result = await validateContent("a.clj", UNBALANCED_CLJ, grammar);
    const expected =
      "Syntax check failed for a.clj: delimiters are unbalanced.\n" +
      "Fix and re-submit. (This is a pre-write guard — the file was NOT modified.)\n" +
      `  ${BALANCE_ERROR}`;
    expect(result).toBe(expected);
  });

  test("passes when the grammar is unavailable and delimiters balance", async () => {
    const { grammar } = recordingGrammar({ available: false, tree: null });
    const result = await validateContent("a.clj", BALANCED_CLJ, grammar);
    expect(result).toBeNull();
  });
});

describe("gate: delimiter-only extensions", () => {
  const UNBALANCED_EDN = "(def x 1";
  const BALANCED_EDN = "(def x 1)\n";
  const EDN_BALANCE_ERROR =
    "a.edn: 1 unclosed `(` — the one at line 1 is never closed; add 1 matching `)`";

  test("blocks unbalanced content when grammar is unavailable", async () => {
    const { grammar } = recordingGrammar({ available: false, tree: null });
    const result = await validateContent("a.edn", UNBALANCED_EDN, grammar);
    const expected =
      "Syntax check failed for a.edn: delimiters are unbalanced.\n" +
      "Fix and re-submit. (This is a pre-write guard — the file was NOT modified.)\n" +
      `  ${EDN_BALANCE_ERROR}`;
    expect(result).toBe(expected);
  });

  test("passes balanced content when grammar is unavailable", async () => {
    const { grammar } = recordingGrammar({ available: false, tree: null });
    const result = await validateContent("a.edn", BALANCED_EDN, grammar);
    expect(result).toBeNull();
  });

  test("passes balanced .fnl content when grammar is unavailable", async () => {
    const { grammar } = recordingGrammar({ available: false, tree: null });
    const result = await validateContent("a.fnl", "(print 1)\n", grammar);
    expect(result).toBeNull();
  });

  test("blocks unbalanced .fnl content when grammar is unavailable", async () => {
    const { grammar } = recordingGrammar({ available: false, tree: null });
    const result = await validateContent("a.fnl", "(print 1", grammar);
    expect(result).toContain("delimiters are unbalanced");
    expect(result).toContain("NOT modified");
  });
});

describe("gate: decision-table matrix", () => {
  const BALANCED_CLJ = "(def x 1)\n";
  const UNBALANCED_CLJ = "(def x 1";
  const CLEAN_TS = "const x = 1;\n";
  const BROKEN_TS = "const x = ;\nconsole.log(x);\n";

  const CLJ_ERROR_NODE = {
    type: "ERROR",
    isError: true,
    position: { row: 0, column: 5 },
    start: 5,
    end: 6,
  };
  const TS_ERROR_NODE = {
    type: "ERROR",
    isError: true,
    position: { row: 0, column: 10 },
    start: 10,
    end: 11,
  };

  type GrammarState =
    "available-clean" | "available-error" | "unavailable" | "none";

  function grammarFor(state: GrammarState, ext: string) {
    switch (state) {
      case "available-clean":
        return recordingGrammar({ available: true, tree: cleanFakeTree() })
          .grammar;
      case "available-error": {
        const node = ext.endsWith(".clj") ? CLJ_ERROR_NODE : TS_ERROR_NODE;
        return recordingGrammar({ available: true, tree: makeFakeTree([node]) })
          .grammar;
      }
      case "unavailable":
        return recordingGrammar({ available: false, tree: null }).grammar;
      case "none":
        return undefined as unknown as GrammarFn;
    }
  }

  const cases: Array<{
    label: string;
    ext: string;
    grammarState: GrammarState;
    content: string;
    expected: "pass" | "block";
  }> = [
    // Extensionless → always pass
    {
      label: "no ext, any grammar, any content",
      ext: "README",
      grammarState: "available-error",
      content: BROKEN_TS,
      expected: "pass",
    },

    // Unknown extension (.xyz) → always pass, never consult parser
    {
      label: "unknown ext (.xyz), any grammar, any content",
      ext: "data.xyz",
      grammarState: "available-error",
      content: BROKEN_TS,
      expected: "pass",
    },

    // .ts (grammar only, no delimiter rules)
    {
      label: ".ts, clean grammar, clean content",
      ext: "a.ts",
      grammarState: "available-clean",
      content: CLEAN_TS,
      expected: "pass",
    },
    {
      label: ".ts, error grammar, broken content",
      ext: "a.ts",
      grammarState: "available-error",
      content: BROKEN_TS,
      expected: "block",
    },
    {
      label: ".ts, unavailable grammar, broken content",
      ext: "a.ts",
      grammarState: "unavailable",
      content: BROKEN_TS,
      expected: "pass",
    },

    // .clj (grammar + delimiter rules — double confirmation)
    {
      label: ".clj, clean grammar, balanced content",
      ext: "a.clj",
      grammarState: "available-clean",
      content: BALANCED_CLJ,
      expected: "pass",
    },
    {
      label: ".clj, error grammar, balanced content (false-positive)",
      ext: "a.clj",
      grammarState: "available-error",
      content: BALANCED_CLJ,
      expected: "pass",
    },
    {
      label: ".clj, error grammar, unbalanced content (combined block)",
      ext: "a.clj",
      grammarState: "available-error",
      content: UNBALANCED_CLJ,
      expected: "block",
    },
    {
      label:
        ".clj, unavailable grammar, unbalanced content (delimiter-only block)",
      ext: "a.clj",
      grammarState: "unavailable",
      content: UNBALANCED_CLJ,
      expected: "block",
    },
    {
      label: ".clj, unavailable grammar, balanced content",
      ext: "a.clj",
      grammarState: "unavailable",
      content: BALANCED_CLJ,
      expected: "pass",
    },

    // .edn (grammar available + delimiter rules — grammar unavailable → delimiter check runs)
    {
      label: ".edn, unavailable grammar, unbalanced (delimiter block)",
      ext: "a.edn",
      grammarState: "unavailable",
      content: UNBALANCED_CLJ,
      expected: "block",
    },
    {
      label: ".edn, unavailable grammar, balanced",
      ext: "a.edn",
      grammarState: "unavailable",
      content: BALANCED_CLJ,
      expected: "pass",
    },

    // No grammar seam provided
    {
      label: ".ts, no seam, any content",
      ext: "a.ts",
      grammarState: "none",
      content: BROKEN_TS,
      expected: "pass",
    },
    {
      label: ".clj, no seam, unbalanced",
      ext: "a.clj",
      grammarState: "none",
      content: UNBALANCED_CLJ,
      expected: "block",
    },

    // .fnl (delimiter-only — not in LANGUAGE_MAP, only in BALANCE_RULES)
    {
      label: ".fnl, unavailable grammar, unbalanced (delimiter block)",
      ext: "a.fnl",
      grammarState: "unavailable",
      content: "(print 1",
      expected: "block",
    },
    {
      label: ".fnl, unavailable grammar, balanced",
      ext: "a.fnl",
      grammarState: "unavailable",
      content: "(print 1)\n",
      expected: "pass",
    },
  ];

  for (const c of cases) {
    test(c.label, async () => {
      const grammar = grammarFor(c.grammarState, c.ext);
      const result = await validateContent(c.ext, c.content, grammar);
      if (c.expected === "pass") {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result).toContain("NOT modified");
      }
    });
  }

  test("unknown extension never consults the grammar seam", async () => {
    const { grammar, calls } = recordingGrammar({
      available: true,
      tree: makeFakeTree([TS_ERROR_NODE]),
    });
    const result = await validateContent("data.xyz", BROKEN_TS, grammar);
    expect(result).toBeNull();
    expect(calls).toEqual([]);
  });

  test("extensionless never consults the grammar seam", async () => {
    const { grammar, calls } = recordingGrammar({
      available: true,
      tree: makeFakeTree([TS_ERROR_NODE]),
    });
    const result = await validateContent("README", BROKEN_TS, grammar);
    expect(result).toBeNull();
    expect(calls).toEqual([]);
  });
});
