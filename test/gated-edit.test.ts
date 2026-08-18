// Acceptance tests for the gated edit tool (wave 1, slice 1.3).
//
// Drives `createEditPort().execute` against a real temp-dir filesystem
// with fake parse trees. No WASM, no CDN, no cache in unit tests.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createRobustEditTool } from "pi-semantic-edit/src/pi/tool";

import { createEditPort } from "../src/ports/edit";
import {
  captureBlock,
  makeFakeTree,
  recordingGrammar,
  STRAY_SEMICOLON_NODE,
  withTempDir,
} from "./helpers";

// ── Fixture content ────────────────────────────────────────────────────

// Fuzzy-only match: the file content has no leading spaces on line 1;
// oldText has 4 leading spaces — the 10-pass fuzzy chain tolerates the drift.
const FILE_TS = "const x = 1;\nconsole.log(x);\n";
// After the fuzzy match, the entire line is replaced by newText.
// So disk content equals newText + "\n" + rest of file.
const FUZZY_OLD_TEXT = "    const x = 1;";
const FUZZY_NEW_TEXT_VALID = "    const x = 2;";
const FUZZY_NEW_TEXT_BROKEN = "    const x = ;";
// Write-form bytes after applying the fuzzy broken edit (with 4-space indent)
const WRITE_FORM_BROKEN = "    const x = ;\nconsole.log(x);\n";

function makeFakeBrokenTree() {
  return makeFakeTree([STRAY_SEMICOLON_NODE]);
}

function makeFakeCleanTree() {
  return makeFakeTree([]);
}

// ── Helpers ────────────────────────────────────────────────────────────

function createTool(
  cwd: string,
  grammarFn: ReturnType<typeof recordingGrammar>["grammar"],
) {
  const stub = {} as unknown as ExtensionAPI;
  const base = createRobustEditTool(cwd, stub);
  const { execute: _baseExec, ...surface } = base;
  return {
    ...surface,
    execute: createEditPort(cwd, { grammar: grammarFn }).execute,
  };
}

function fakeCtx(cwd: string) {
  return { cwd } as { cwd: string };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("gated edit: fuzzy-only valid edit applies", () => {
  test("success shape matches pse's exactly (content + details fields); disk equals post-apply", async () => {
    await withTempDir(async (dir) => {
      const { writeFile } = await import("node:fs/promises");
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, FILE_TS);

      const { grammar, calls } = recordingGrammar({
        available: true,
        tree: makeFakeCleanTree(),
      });
      const tool = createTool(dir, grammar);

      const result = await tool.execute(
        "call-1",
        {
          path: "a.ts",
          edits: [{ oldText: FUZZY_OLD_TEXT, newText: FUZZY_NEW_TEXT_VALID }],
        },
        undefined,
        undefined,
        fakeCtx(dir),
      );

      // Success shape: content array with text + details
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(typeof result.content[0].text).toBe("string");
      expect(result.content[0].text).toContain("Successfully replaced");
      expect(result.content[0].text).toContain("Match passes:");

      // Details: diff, patch, firstChangedLine, matchPasses
      expect(result.details).toBeDefined();
      expect(typeof result.details.diff).toBe("string");
      expect(typeof result.details.patch).toBe("string");
      expect(typeof result.details.firstChangedLine).toBe("number");
      expect(Array.isArray(result.details.matchPasses)).toBe(true);
      expect(result.details.matchPasses.length).toBeGreaterThan(0);

      // Grammar seam was consulted (gate checked the file)
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0].ext).toBe(".ts");

      // Disk equals post-apply content (replacement text has 4-space indent)
      const diskContent = await readFile(filePath, "utf-8");
      expect(diskContent).toBe(FUZZY_NEW_TEXT_VALID + "\nconsole.log(x);\n");
    });
  });
});

describe("gated edit: fuzzy-only broken edit blocks", () => {
  test("parity block message with line:col; file byte-identical to pre-call", async () => {
    await withTempDir(async (dir) => {
      const { writeFile } = await import("node:fs/promises");
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, FILE_TS);

      const originalBytes = await readFile(filePath);

      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeBrokenTree(),
      });
      const tool = createTool(dir, grammar);

      const err = await captureBlock(
        tool.execute(
          "call-1",
          {
            path: "a.ts",
            edits: [
              { oldText: FUZZY_OLD_TEXT, newText: FUZZY_NEW_TEXT_BROKEN },
            ],
          },
          undefined,
          undefined,
          fakeCtx(dir),
        ),
      );

      // Parity error message: based on write-form bytes (4-space indented content).
      // The stray `;` in `    const x = ;` is at byte offset 14, which is
      // line 1 column 15 (1-based). The snippet at that offset is `x` (the
      // character before the stray token), but the gate's `formatError` uses
      // the node's start position, which tree-sitter reports on the actual
      // error location. The parity message matches the gate.test.ts fixture.
      expect(err.message).toContain("Syntax check failed for a.ts:");
      expect(err.message).toContain("error(s) detected by tree-sitter");
      expect(err.message).toContain("pre-write guard");
      expect(err.message).toContain("NOT modified");
      expect(err.editError).toBeDefined();
      expect(err.editError!.kind).toBe("syntax");
      expect(err.editError!.message).toBe(err.message);

      // File byte-identical
      const afterBytes = await readFile(filePath);
      expect(Buffer.compare(originalBytes, afterBytes)).toBe(0);
    });
  });
});

describe("gated edit: exact-match parity", () => {
  test("valid exact edit applies with pse success shape", async () => {
    await withTempDir(async (dir) => {
      const { writeFile } = await import("node:fs/promises");
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, FILE_TS);

      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeCleanTree(),
      });
      const tool = createTool(dir, grammar);

      const result = await tool.execute(
        "call-1",
        {
          path: "a.ts",
          edits: [{ oldText: "const x = 1;", newText: "const x = 2;" }],
        },
        undefined,
        undefined,
        fakeCtx(dir),
      );

      expect(result.content[0].text).toContain("Successfully replaced");
      expect(result.details).toBeDefined();
      expect(result.details.matchPasses).toContain("simple");

      const diskContent = await readFile(filePath, "utf-8");
      expect(diskContent).toBe("const x = 2;\nconsole.log(x);\n");
    });
  });

  test("broken exact edit blocks; file untouched", async () => {
    await withTempDir(async (dir) => {
      const { writeFile } = await import("node:fs/promises");
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, FILE_TS);

      const originalBytes = await readFile(filePath);

      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeBrokenTree(),
      });
      const tool = createTool(dir, grammar);

      const err = await captureBlock(
        tool.execute(
          "call-1",
          {
            path: "a.ts",
            edits: [{ oldText: "const x = 1;", newText: "const x = ;" }],
          },
          undefined,
          undefined,
          fakeCtx(dir),
        ),
      );

      expect(err.message).toContain("Syntax check failed");
      expect(err.editError!.kind).toBe("syntax");

      const afterBytes = await readFile(filePath);
      expect(Buffer.compare(originalBytes, afterBytes)).toBe(0);
    });
  });
});

describe("gated edit: BOM and CRLF preservation", () => {
  test("BOM prefix and CRLF line endings preserved through a successful edit", async () => {
    await withTempDir(async (dir) => {
      const { writeFile: wf } = await import("node:fs/promises");
      const filePath = join(dir, "bom.ts");
      // BOM (EF BB BF) + content with CRLF
      // \uFEFF is the actual BOM character; Buffer.from encodes it as EF BB BF in UTF-8
      const bomCrlfContent = "\uFEFFconst z = 1;\r\nconsole.log(z);\r\n";
      await wf(filePath, Buffer.from(bomCrlfContent, "utf-8"));

      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeCleanTree(),
      });
      const tool = createTool(dir, grammar);

      await tool.execute(
        "call-1",
        {
          path: "bom.ts",
          edits: [{ oldText: "const z = 1;", newText: "const z = 10;" }],
        },
        undefined,
        undefined,
        fakeCtx(dir),
      );

      // Read raw bytes
      const afterBuf = await readFile(filePath);

      // BOM preserved
      expect(afterBuf[0]).toBe(0xef);
      expect(afterBuf[1]).toBe(0xbb);
      expect(afterBuf[2]).toBe(0xbf);

      // CRLF preserved — check for \r\n in the content
      const text = afterBuf.toString("utf-8");
      expect(text).toContain("\r\n");
      expect(text).not.toMatch(/[^\r]\n/); // no bare \n

      // Content updated
      expect(text).toContain("const z = 10;");
    });
  });
});

describe("gated edit: unknown/no-extension pass-through", () => {
  test("edits to extensionless files pass through unvalidated", async () => {
    await withTempDir(async (dir) => {
      const { writeFile } = await import("node:fs/promises");
      const filePath = join(dir, "README");
      await writeFile(filePath, "hello world\n");

      const { grammar, calls } = recordingGrammar({
        available: true,
        tree: makeFakeCleanTree(),
      });
      const tool = createTool(dir, grammar);

      const result = await tool.execute(
        "call-1",
        {
          path: "README",
          edits: [{ oldText: "hello", newText: "goodbye" }],
        },
        undefined,
        undefined,
        fakeCtx(dir),
      );

      // Edit applied (pass-through, no validation)
      expect(result.content[0].text).toContain("Successfully replaced");
      const diskContent = await readFile(filePath, "utf-8");
      expect(diskContent).toBe("goodbye world\n");

      // Grammar seam was NOT consulted for extensionless files (early return in gate)
      expect(calls).toEqual([]);
    });
  });

  test("edits to files with unknown extensions pass through unvalidated", async () => {
    await withTempDir(async (dir) => {
      const { writeFile } = await import("node:fs/promises");
      const filePath = join(dir, "data.xyz");
      await writeFile(filePath, "some content\n");

      const { grammar, calls } = recordingGrammar({
        available: false,
        tree: null,
      });
      const tool = createTool(dir, grammar);

      const result = await tool.execute(
        "call-1",
        {
          path: "data.xyz",
          edits: [{ oldText: "some", newText: "other" }],
        },
        undefined,
        undefined,
        fakeCtx(dir),
      );

      expect(result.content[0].text).toContain("Successfully replaced");
      // Grammar seam was NOT consulted for unknown extensions
      expect(calls).toEqual([]);
    });
  });
});

describe("gated edit: zero side effects on block", () => {
  test("no temp file remains; target file unmodified", async () => {
    await withTempDir(async (dir) => {
      const { writeFile } = await import("node:fs/promises");
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, FILE_TS);

      const originalContent = await readFile(filePath, "utf-8");

      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeBrokenTree(),
      });
      const tool = createTool(dir, grammar);

      await captureBlock(
        tool.execute(
          "call-1",
          {
            path: "a.ts",
            edits: [
              { oldText: FUZZY_OLD_TEXT, newText: FUZZY_NEW_TEXT_BROKEN },
            ],
          },
          undefined,
          undefined,
          fakeCtx(dir),
        ),
      );

      // No stray temp files
      const files = await readdir(dir);
      expect(files).toEqual(["a.ts"]);

      // File unmodified
      const afterContent = await readFile(filePath, "utf-8");
      expect(afterContent).toBe(originalContent);
    });
  });
});

describe("gated edit: non-syntax pse error contract", () => {
  test("no-match throws not-found error (same message as pse)", async () => {
    await withTempDir(async (dir) => {
      const { writeFile } = await import("node:fs/promises");
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, FILE_TS);

      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeCleanTree(),
      });

      // Run the oracle (pse's own execute) for comparison
      const stub = {} as unknown as ExtensionAPI;
      const oracle = createRobustEditTool(dir, stub);
      const host = createEditPort(dir, { grammar });

      const input = {
        path: "a.ts",
        edits: [{ oldText: "nonexistent text", newText: "replaced" }],
      };

      let oracleErr: Error | undefined;
      try {
        await oracle.execute("c", input as never, undefined, undefined, {
          cwd: dir,
        });
      } catch (e) {
        oracleErr = e as Error;
      }

      let hostErr: Error | undefined;
      try {
        await host.execute("c", input as never, undefined, undefined, {
          cwd: dir,
        });
      } catch (e) {
        hostErr = e as Error;
      }

      expect(oracleErr).toBeDefined();
      expect(hostErr).toBeDefined();
      expect(hostErr!.message).toBe(oracleErr!.message);
      expect(hostErr!.message).toContain("Text not found");
    });
  });

  test("host matches pse behavior for any edit (success or error)", async () => {
    await withTempDir(async (dir) => {
      const { writeFile } = await import("node:fs/promises");
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, "const x = 1;\nconst x = 1;\n");

      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeCleanTree(),
      });

      const stub = {} as unknown as ExtensionAPI;
      const oracle = createRobustEditTool(dir, stub);
      const host = createEditPort(dir, { grammar });

      const input = {
        path: "a.ts",
        edits: [{ oldText: "const x = 1;", newText: "const x = 2;" }],
      };

      let oracleErr: Error | undefined;
      let oracleResult: unknown;
      try {
        oracleResult = await oracle.execute(
          "c",
          input as never,
          undefined,
          undefined,
          {
            cwd: dir,
          },
        );
      } catch (e) {
        oracleErr = e as Error;
      }

      let hostErr: Error | undefined;
      let hostResult: unknown;
      try {
        hostResult = await host.execute(
          "c",
          input as never,
          undefined,
          undefined,
          {
            cwd: dir,
          },
        );
      } catch (e) {
        hostErr = e as Error;
      }

      // Both should behave identically: either both succeed or both fail with the same message
      if (oracleErr) {
        expect(hostErr).toBeDefined();
        expect(hostErr!.message).toBe(oracleErr.message);
      } else {
        expect(hostErr).toBeUndefined();
        expect(hostResult).toBeDefined();
      }
    });
  });

  test("missing file throws file-not-found error (same message as pse)", async () => {
    await withTempDir(async (dir) => {
      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeCleanTree(),
      });

      const stub = {} as unknown as ExtensionAPI;
      const oracle = createRobustEditTool(dir, stub);
      const host = createEditPort(dir, { grammar });

      const input = {
        path: "nonexistent.ts",
        edits: [{ oldText: "foo", newText: "bar" }],
      };

      let oracleErr: Error | undefined;
      try {
        await oracle.execute("c", input as never, undefined, undefined, {
          cwd: dir,
        });
      } catch (e) {
        oracleErr = e as Error;
      }

      let hostErr: Error | undefined;
      try {
        await host.execute("c", input as never, undefined, undefined, {
          cwd: dir,
        });
      } catch (e) {
        hostErr = e as Error;
      }

      expect(oracleErr).toBeDefined();
      expect(hostErr).toBeDefined();
      expect(hostErr!.message).toBe(oracleErr!.message);
      expect(hostErr!.message).toContain("File not found");
    });
  });
});

// ── Multi-file parity (R15) ────────────────────────────────────────────
//
// The deprecated aider patch string is the ONLY multi-file input: every
// other accepted shape stamps the single top-level path onto all blocks.
// execute is driven directly with raw { patch } — prepareArguments is the
// agent loop's job. Per-file sequential semantics: each file completes
// (read → apply → gate → write) before the next; a blocked file is
// untouched; earlier siblings may already be written (parity with pse).

const MF_F1 = "const a = 1;\n";
const MF_F1_APPLIED = "const a = 10;\n";
const MF_F2 = "const c = 2;\n";
const MF_F2_APPLIED_VALID = "const c = 20;\n";
const MF_F2_APPLIED_BROKEN = "const c = ;\n";

/** Build an aider patch with one SEARCH/REPLACE block per file, each
 *  preceded by its path header (first-seen order = header order). */
function multiFilePatch(
  files: [name: string, oldText: string, newText: string][],
): string {
  return files
    .flatMap(([name, oldText, newText]) => [
      name,
      "<<<<<<< SEARCH",
      oldText,
      "=======",
      newText,
      ">>>>>>> REPLACE",
    ])
    .join("\n");
}

describe("gated edit: multi-file parity (R15)", () => {
  test("applies every file when all post-apply content is valid", async () => {
    await withTempDir(async (dir) => {
      const f1 = join(dir, "f1.ts");
      const f2 = join(dir, "f2.ts");
      await writeFile(f1, MF_F1);
      await writeFile(f2, MF_F2);

      const { grammar, calls } = recordingGrammar({
        available: true,
        tree: makeFakeCleanTree(),
      });
      const tool = createTool(dir, grammar);

      const result = await tool.execute(
        "call-1",
        {
          patch: multiFilePatch([
            ["f1.ts", "const a = 1;", "const a = 10;"],
            ["f2.ts", "const c = 2;", "const c = 20;"],
          ]),
        },
        undefined,
        undefined,
        fakeCtx(dir),
      );

      // Both per-file summaries, one line each
      expect(result.content[0].text).toContain(
        "Successfully replaced 1 replacement across 1 edit(s) in f1.ts.",
      );
      expect(result.content[0].text).toContain(
        "Successfully replaced 1 replacement across 1 edit(s) in f2.ts.",
      );

      // Success details present (primary file carries diff/patch)
      expect(result.details).toBeDefined();
      expect(typeof result.details.diff).toBe("string");
      expect(typeof result.details.patch).toBe("string");
      expect(typeof result.details.firstChangedLine).toBe("number");
      expect(Array.isArray(result.details.matchPasses)).toBe(true);

      // Gate consulted once per file
      expect(calls).toHaveLength(2);
      expect(calls.map((c) => c.ext)).toEqual([".ts", ".ts"]);

      // Both files on disk equal their post-apply content
      expect(await readFile(f1, "utf-8")).toBe(MF_F1_APPLIED);
      expect(await readFile(f2, "utf-8")).toBe(MF_F2_APPLIED_VALID);
    });
  });

  test("consults the grammar in first-seen patch order", async () => {
    await withTempDir(async (dir) => {
      const f1 = join(dir, "f1.ts");
      const f2 = join(dir, "f2.ts");
      await writeFile(f1, MF_F1);
      await writeFile(f2, MF_F2);

      const { grammar, calls } = recordingGrammar({
        available: true,
        tree: makeFakeCleanTree(),
      });
      const tool = createTool(dir, grammar);

      // f2's header comes FIRST in the patch
      await tool.execute(
        "call-1",
        {
          patch: multiFilePatch([
            ["f2.ts", "const c = 2;", "const c = 20;"],
            ["f1.ts", "const a = 1;", "const a = 10;"],
          ]),
        },
        undefined,
        undefined,
        fakeCtx(dir),
      );

      expect(calls.map((c) => c.content)).toEqual([
        MF_F2_APPLIED_VALID,
        MF_F1_APPLIED,
      ]);
    });
  });

  test("multiple edits to one file take a single gate pass", async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, "const a = 1;\nconst b = 2;\n");

      const { grammar, calls } = recordingGrammar({
        available: true,
        tree: makeFakeCleanTree(),
      });
      const tool = createTool(dir, grammar);

      const result = await tool.execute(
        "call-1",
        {
          path: "a.ts",
          edits: [
            { oldText: "const a = 1;", newText: "const a = 10;" },
            { oldText: "const b = 2;", newText: "const b = 20;" },
          ],
        },
        undefined,
        undefined,
        fakeCtx(dir),
      );

      expect(result.content[0].text).toContain(
        "Successfully replaced 2 replacements across 2 edit(s) in a.ts.",
      );

      // One file → one group → one validation
      expect(calls).toHaveLength(1);

      const diskContent = await readFile(filePath, "utf-8");
      expect(diskContent).toBe("const a = 10;\nconst b = 20;\n");
    });
  });

  test("a broken second file blocks the call after the first file lands", async () => {
    await withTempDir(async (dir) => {
      const f1 = join(dir, "f1.ts");
      const f2 = join(dir, "f2.ts");
      await writeFile(f1, MF_F1);
      await writeFile(f2, MF_F2);

      const f2Original = await readFile(f2);

      // Broken parse tree only for f2's write-form content
      const { grammar, calls } = recordingGrammar((_ext, content) =>
        content === MF_F2_APPLIED_BROKEN
          ? { available: true, tree: makeFakeBrokenTree() }
          : { available: true, tree: makeFakeCleanTree() },
      );
      const tool = createTool(dir, grammar);

      const err = await captureBlock(
        tool.execute(
          "call-1",
          {
            patch: multiFilePatch([
              ["f1.ts", "const a = 1;", "const a = 10;"],
              ["f2.ts", "const c = 2;", "const c = ;"],
            ]),
          },
          undefined,
          undefined,
          fakeCtx(dir),
        ),
      );

      // First file already landed (sequential per-file completion)
      expect(await readFile(f1, "utf-8")).toBe(MF_F1_APPLIED);

      // Second file byte-identical to pre-call
      expect(Buffer.compare(f2Original, await readFile(f2))).toBe(0);

      // Parity block message names the blocked file (raw path from the
      // patch header, as pse reports paths)
      expect(err.message).toContain("Syntax check failed for f2.ts:");
      expect(err.message).toContain("error(s) detected by tree-sitter");
      expect(err.message).toContain("NOT modified");

      // Error contract: structured editError mirrors the message
      expect(err.editError).toBeDefined();
      expect(err.editError!.kind).toBe("syntax");
      expect(err.editError!.message).toBe(err.message);

      // Gate consulted once per file, in order; the loop stopped at the block
      expect(calls.map((c) => c.content)).toEqual([
        MF_F1_APPLIED,
        MF_F2_APPLIED_BROKEN,
      ]);

      // No stray temp files from either file
      const files = (await readdir(dir)).sort();
      expect(files).toEqual(["f1.ts", "f2.ts"]);
    });
  });

  test("a blocked first file leaves later files untouched", async () => {
    await withTempDir(async (dir) => {
      const f1 = join(dir, "f1.ts");
      const f2 = join(dir, "f2.ts");
      await writeFile(f1, MF_F1);
      await writeFile(f2, MF_F2);

      const f1Original = await readFile(f1);

      const { grammar, calls } = recordingGrammar((_ext, content) =>
        content === MF_F2_APPLIED_BROKEN
          ? { available: true, tree: makeFakeBrokenTree() }
          : { available: true, tree: makeFakeCleanTree() },
      );
      const tool = createTool(dir, grammar);

      // f2 (broken) FIRST, f1 (valid) second
      const err = await captureBlock(
        tool.execute(
          "call-1",
          {
            patch: multiFilePatch([
              ["f2.ts", "const c = 2;", "const c = ;"],
              ["f1.ts", "const a = 1;", "const a = 10;"],
            ]),
          },
          undefined,
          undefined,
          fakeCtx(dir),
        ),
      );

      expect(err.message).toContain("Syntax check failed for f2.ts:");

      // Loop stopped at the first block: later file never even gated
      expect(calls).toHaveLength(1);
      expect(calls[0].content).toBe(MF_F2_APPLIED_BROKEN);

      // Later file byte-identical; blocked file byte-identical
      expect(Buffer.compare(f1Original, await readFile(f1))).toBe(0);
      expect(await readFile(f2, "utf-8")).toBe(MF_F2);
    });
  });

  test("a no-match on the second file leaves the first file written", async () => {
    await withTempDir(async (dir) => {
      const f1 = join(dir, "f1.ts");
      const f2 = join(dir, "f2.ts");
      await writeFile(f1, MF_F1);
      await writeFile(f2, MF_F2);

      const f2Original = await readFile(f2);

      const { grammar, calls } = recordingGrammar({
        available: true,
        tree: makeFakeCleanTree(),
      });
      const tool = createTool(dir, grammar);

      // f2's oldText does not exist in f2.ts
      const err = await captureBlock(
        tool.execute(
          "call-1",
          {
            patch: multiFilePatch([
              ["f1.ts", "const a = 1;", "const a = 10;"],
              ["f2.ts", "absent text", "replaced"],
            ]),
          },
          undefined,
          undefined,
          fakeCtx(dir),
        ),
      );

      // First file already landed before the second file failed
      expect(await readFile(f1, "utf-8")).toBe(MF_F1_APPLIED);

      // Second file byte-identical (apply failed before any write)
      expect(Buffer.compare(f2Original, await readFile(f2))).toBe(0);

      // pse's not-found error, naming the failed file (raw path)
      expect(err.message).toContain("Text not found in f2.ts");
      expect(err.editError).toBeDefined();
      expect(err.editError!.kind).toBe("not-found");

      // Gate consulted only for the first file
      expect(calls).toHaveLength(1);
      expect(calls[0].content).toBe(MF_F1_APPLIED);
    });
  });
});
