// Acceptance tests for the gated edit tool (wave 1, slice 1.3).
//
// Drives the host's edit `execute` — the spec's single unit seam — against a
// real temp-dir filesystem, with the grammar seam faked (no WASM, no CDN).
// Pins W1-AC2 (blocked fuzzy edit), W1-AC3 (applied fuzzy edit, BOM/CRLF),
// and the US-1/2/3/6/7/9/10 contracts: parity blocking with the exact
// message, parity success shape, zero side effects on block, never-block
// pass-through, and unchanged non-syntax error behavior (pse as oracle).

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createRobustEditTool } from "pi-semantic-edit/src/pi/tool";

import { createGatedEditTool } from "../src/gated-edit";
import {
  brokenGrammar,
  captureBlock,
  cleanGrammar,
  unavailableGrammar,
  withSandboxPair,
  withTempDir,
} from "./helpers";

// The wave's canonical fixture: a two-line TS file. The drift edit's oldText
// carries 4 leading spaces the file lacks, so it matches only via a fuzzy pass.
const ORIGINAL_TS = "const x = 1;\nconsole.log(x);\n";
const POST_APPLY_BROKEN = "const x = ;\nconsole.log(x);\n";
const DRIFT_BROKEN_EDIT = {
  oldText: "    const x = 1;",
  newText: "const x = ;",
};
const DRIFT_VALID_EDIT = {
  oldText: "    const x = 1;",
  newText: "const x = 2;",
};

// The block message is validated against the model's own (raw) path.
const BLOCKED_MESSAGE =
  "Syntax check failed for a.ts: 1 error(s) detected by tree-sitter.\n" +
  "Fix and re-submit. (This is a pre-write guard — the file was NOT modified.)\n" +
  "  Unexpected `;` at line 1:11\n" +
  "    |\n" +
  "    1 | const x = ;\n" +
  "    |           ^";

// The success contract (US-10): pse's exact shape, no more and no less.
interface EditSuccess {
  content: { type: string; text: string }[];
  details: {
    diff: string;
    patch: string;
    firstChangedLine: number;
    matchPasses: string[];
  };
}

async function oracleExecute(
  dir: string,
  input: { path: string; edits: { oldText: string; newText: string }[] },
) {
  // The unmodified pse tool is the reference for every non-syntax behavior.
  const tool = createRobustEditTool(dir, {} as ExtensionAPI);
  return tool.execute("oracle", input, undefined, undefined, { cwd: dir });
}

describe("gated edit: applying", () => {
  test("applies a valid exact-match edit and writes the post-apply content", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "a.ts"), ORIGINAL_TS);
      const tool = createGatedEditTool(dir, {
        grammar: cleanGrammar().grammar,
      });
      const result = (await tool.execute(
        "call-1",
        {
          path: "a.ts",
          edits: [{ oldText: "const x = 1;", newText: "const x = 2;" }],
        },
        undefined,
        undefined,
        { cwd: dir },
      )) as EditSuccess;
      expect(result.content[0].text).toBe(
        "Successfully replaced 1 replacement across 1 edit(s) in a.ts.",
      );
      expect(result.details.matchPasses).toEqual(["simple"]);
      expect(result.details.firstChangedLine).toBe(1);
      expect(result.details.diff).toContain("-const x = 1;");
      expect(result.details.diff).toContain("+const x = 2;");
      expect(result.details.patch).toContain("+const x = 2;");
      expect(await readFile(join(dir, "a.ts"), "utf-8")).toBe(
        "const x = 2;\nconsole.log(x);\n",
      );
    });
  });

  test("applies a fuzzy-only edit and reports the non-simple match pass", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "a.ts"), ORIGINAL_TS);
      const tool = createGatedEditTool(dir, {
        grammar: cleanGrammar().grammar,
      });
      const result = (await tool.execute(
        "call-2",
        { path: "a.ts", edits: [DRIFT_VALID_EDIT] },
        undefined,
        undefined,
        { cwd: dir },
      )) as EditSuccess;
      expect(result.content[0].text).toBe(
        "Successfully replaced 1 replacement across 1 edit(s) in a.ts.\nMatch passes: line_trimmed",
      );
      expect(result.details.matchPasses).toEqual(["line_trimmed"]);
      expect(await readFile(join(dir, "a.ts"), "utf-8")).toBe(
        "const x = 2;\nconsole.log(x);\n",
      );
    });
  });

  test("keeps the BOM and CRLF line endings on a successful edit", async () => {
    await withTempDir(async (dir) => {
      await writeFile(
        join(dir, "crlf.ts"),
        "\uFEFFconst z = 1;\r\nconsole.log(z);\r\n",
      );
      const tool = createGatedEditTool(dir, {
        grammar: cleanGrammar().grammar,
      });
      await tool.execute(
        "call-3",
        {
          path: "crlf.ts",
          edits: [{ oldText: "const z = 1;", newText: "const z = 10;" }],
        },
        undefined,
        undefined,
        {
          cwd: dir,
        },
      );
      expect(await readFile(join(dir, "crlf.ts"), "utf-8")).toBe(
        "\uFEFFconst z = 10;\r\nconsole.log(z);\r\n",
      );
    });
  });

  test("resolves the path against the session cwd, not the factory cwd", async () => {
    await withTempDir(async (sessionDir) => {
      await writeFile(join(sessionDir, "a.ts"), ORIGINAL_TS);
      await withTempDir(async (factoryDir) => {
        const tool = createGatedEditTool(factoryDir, {
          grammar: cleanGrammar().grammar,
        });
        const result = (await tool.execute(
          "call-4",
          { path: "a.ts", edits: [DRIFT_VALID_EDIT] },
          undefined,
          undefined,
          { cwd: sessionDir },
        )) as EditSuccess;
        expect(result.content[0].text).toContain("Successfully replaced");
        expect(await readFile(join(sessionDir, "a.ts"), "utf-8")).toBe(
          "const x = 2;\nconsole.log(x);\n",
        );
        expect(await readdir(factoryDir)).toEqual([]);
      });
    });
  });
});

describe("gated edit: blocking", () => {
  test("blocks a fuzzy-only broken edit with the parity message and leaves the file byte-identical", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "a.ts"), ORIGINAL_TS);
      const { grammar, calls } = brokenGrammar();
      const tool = createGatedEditTool(dir, { grammar });
      const error = await captureBlock(
        tool.execute(
          "call-5",
          { path: "a.ts", edits: [DRIFT_BROKEN_EDIT] },
          undefined,
          undefined,
          {
            cwd: dir,
          },
        ),
      );
      expect(error.message).toBe(BLOCKED_MESSAGE);
      expect(error.editError).toEqual({
        kind: "syntax",
        message: BLOCKED_MESSAGE,
      });
      expect(await readFile(join(dir, "a.ts"), "utf-8")).toBe(ORIGINAL_TS);
      // The gate judged exactly the write-form bytes the edit would have written.
      expect(calls).toEqual([{ ext: ".ts", content: POST_APPLY_BROKEN }]);
    });
  });

  test("blocks a broken exact-match edit and leaves the file byte-identical", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "a.ts"), ORIGINAL_TS);
      const tool = createGatedEditTool(dir, {
        grammar: brokenGrammar().grammar,
      });
      const error = await captureBlock(
        tool.execute(
          "call-6",
          {
            path: "a.ts",
            edits: [{ oldText: "const x = 1;", newText: "const x = ;" }],
          },
          undefined,
          undefined,
          {
            cwd: dir,
          },
        ),
      );
      expect(error.message).toBe(BLOCKED_MESSAGE);
      expect(await readFile(join(dir, "a.ts"), "utf-8")).toBe(ORIGINAL_TS);
    });
  });

  test("validates the write-form bytes with BOM and restored line endings", async () => {
    await withTempDir(async (dir) => {
      await writeFile(
        join(dir, "crlf.ts"),
        "\uFEFFconst z = 1;\r\nconsole.log(z);\r\n",
      );
      const { grammar, calls } = brokenGrammar();
      const tool = createGatedEditTool(dir, { grammar });
      const error = await captureBlock(
        tool.execute(
          "call-7",
          {
            path: "crlf.ts",
            edits: [{ oldText: "const z = 1;", newText: "const z = ;" }],
          },
          undefined,
          undefined,
          {
            cwd: dir,
          },
        ),
      );
      expect(error.message.startsWith("Syntax check failed for crlf.ts:")).toBe(
        true,
      );
      expect(calls).toEqual([
        { ext: ".ts", content: "\uFEFFconst z = ;\r\nconsole.log(z);\r\n" },
      ]);
      expect(await readFile(join(dir, "crlf.ts"), "utf-8")).toBe(
        "\uFEFFconst z = 1;\r\nconsole.log(z);\r\n",
      );
    });
  });

  test("leaves no stray files behind when an edit is blocked", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "a.ts"), ORIGINAL_TS);
      const tool = createGatedEditTool(dir, {
        grammar: brokenGrammar().grammar,
      });
      const before = await readdir(dir);
      await captureBlock(
        tool.execute(
          "call-8",
          { path: "a.ts", edits: [DRIFT_BROKEN_EDIT] },
          undefined,
          undefined,
          { cwd: dir },
        ),
      );
      expect(await readdir(dir)).toEqual(before);
    });
  });
});

describe("gated edit: pass-through", () => {
  test("applies an edit to an unknown-extension file without validation", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "notes.txt"), "const x = ;\n");
      const tool = createGatedEditTool(dir, {
        grammar: unavailableGrammar().grammar,
      });
      const result = (await tool.execute(
        "call-9",
        {
          path: "notes.txt",
          edits: [{ oldText: "const x = ;", newText: "still broken content" }],
        },
        undefined,
        undefined,
        { cwd: dir },
      )) as EditSuccess;
      expect(result.content[0].text).toContain("Successfully replaced");
      expect(await readFile(join(dir, "notes.txt"), "utf-8")).toBe(
        "still broken content\n",
      );
    });
  });

  test("applies an edit to an extensionless file without consulting the grammar", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "DRAFT"), "const x = ;\n");
      const { grammar, calls } = cleanGrammar();
      const tool = createGatedEditTool(dir, { grammar });
      const result = (await tool.execute(
        "call-10",
        {
          path: "DRAFT",
          edits: [
            { oldText: "const x = ;", newText: "whatever the model wants" },
          ],
        },
        undefined,
        undefined,
        { cwd: dir },
      )) as EditSuccess;
      expect(result.content[0].text).toContain("Successfully replaced");
      expect(await readFile(join(dir, "DRAFT"), "utf-8")).toBe(
        "whatever the model wants\n",
      );
      expect(calls).toEqual([]);
    });
  });
});

describe("gated edit: contract parity with pse", () => {
  test("returns a success result identical to pse's own for the same edit", async () => {
    await withSandboxPair("a.ts", ORIGINAL_TS, async (hostDir, oracleDir) => {
      const tool = createGatedEditTool(hostDir, {
        grammar: cleanGrammar().grammar,
      });
      const input = { path: "a.ts", edits: [DRIFT_VALID_EDIT] };
      const hostResult = await tool.execute(
        "call-11",
        input,
        undefined,
        undefined,
        { cwd: hostDir },
      );
      const oracleResult = await oracleExecute(oracleDir, input);
      expect(hostResult).toEqual(oracleResult);
    });
  });

  test("fails with pse's own error when the text is not found", async () => {
    await withSandboxPair("a.ts", ORIGINAL_TS, async (hostDir, oracleDir) => {
      const tool = createGatedEditTool(hostDir, {
        grammar: cleanGrammar().grammar,
      });
      const input = {
        path: "a.ts",
        edits: [{ oldText: "THIS IS NOT IN THE FILE", newText: "y" }],
      };
      const hostError = await captureBlock(
        tool.execute("call-12", input, undefined, undefined, { cwd: hostDir }),
      );
      const oracleError = await captureBlock(oracleExecute(oracleDir, input));
      expect(hostError.message).toBe(
        "Text not found in a.ts. The 10-pass fuzzy matcher found no match.\n" +
          "No similar text found either. Re-read the file to see its current content, then retry with the exact text to replace.",
      );
      expect(hostError.message).toBe(oracleError.message);
      expect(hostError.editError).toEqual(oracleError.editError);
    });
  });

  test("fails with pse's own error when the text matches in multiple places", async () => {
    await withSandboxPair(
      "amb.ts",
      "let v = 1;\nlet v = 1;\n",
      async (hostDir, oracleDir) => {
        const tool = createGatedEditTool(hostDir, {
          grammar: cleanGrammar().grammar,
        });
        const input = {
          path: "amb.ts",
          edits: [{ oldText: "let v = 1;", newText: "let v = 2;" }],
        };
        const hostError = await captureBlock(
          tool.execute("call-13", input, undefined, undefined, {
            cwd: hostDir,
          }),
        );
        const oracleError = await captureBlock(oracleExecute(oracleDir, input));
        expect(hostError.editError?.kind).toBe("ambiguous");
        expect(hostError.message).toBe(
          "Text found 2 times at line 1, line 2 in amb.ts. " +
            "Provide more surrounding context to make the match unique, or set replaceAll: true to replace every occurrence.",
        );
        expect(hostError.message).toBe(oracleError.message);
        expect(hostError.editError).toEqual(oracleError.editError);
      },
    );
  });

  test("fails with pse's own error when the file is missing", async () => {
    await withSandboxPair("a.ts", ORIGINAL_TS, async (hostDir, oracleDir) => {
      const tool = createGatedEditTool(hostDir, {
        grammar: cleanGrammar().grammar,
      });
      const input = {
        path: "nope.ts",
        edits: [{ oldText: "a", newText: "b" }],
      };
      const hostError = await captureBlock(
        tool.execute("call-14", input, undefined, undefined, { cwd: hostDir }),
      );
      const oracleError = await captureBlock(oracleExecute(oracleDir, input));
      expect(hostError.message).toBe(
        "File not found: nope.ts (ENOENT). Check the path, or use write to create the file, then retry the edit.",
      );
      expect(hostError.message).toBe(oracleError.message);
      expect(hostError.editError).toEqual(oracleError.editError);
    });
  });

  test("fails with pse's own error when the edit changes nothing", async () => {
    await withSandboxPair("a.ts", ORIGINAL_TS, async (hostDir, oracleDir) => {
      const tool = createGatedEditTool(hostDir, {
        grammar: cleanGrammar().grammar,
      });
      const input = {
        path: "a.ts",
        edits: [{ oldText: "const x = 1;", newText: "const x = 1;" }],
      };
      const hostError = await captureBlock(
        tool.execute("call-15", input, undefined, undefined, { cwd: hostDir }),
      );
      const oracleError = await captureBlock(oracleExecute(oracleDir, input));
      expect(hostError.message).toBe(
        "oldText and newText are identical; this edit does nothing.",
      );
      expect(hostError.message).toBe(oracleError.message);
      expect(hostError.editError).toEqual(oracleError.editError);
    });
  });
});
