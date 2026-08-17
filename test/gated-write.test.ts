// Acceptance tests for the gated write tool (wave 1, slice 1.4).
//
// Drives the host's write `execute` against a real temp-dir filesystem, with
// the grammar seam faked. Pins W1-AC4 (blocked write: parity message, no
// file, no parent directory), W1-AC5 (valid write lands verbatim with the
// built-in success behavior), and the US-4/5/7/14 contracts: validation
// before any I/O on the exact submitted content, resolved-path diagnostics,
// and never-block pass-through.

import { existsSync, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { createGatedWriteTool } from "../src/gated-write";
import {
  brokenGrammar,
  captureBlock,
  cleanGrammar,
  unavailableGrammar,
  withTempDir,
} from "./helpers";

// A stray `;` where an operand belongs — the same ERROR node shape the real
// TS grammar reports (see helpers), at line 1, column 11 (1-based).
const BROKEN_TS = "const y = ;\n";

// The built-in success contract: raw path in the text, details undefined.
interface WriteSuccess {
  content: { type: string; text: string }[];
  details: undefined;
}

function blockedMessageFor(absolutePath: string) {
  return (
    `Syntax check failed for ${absolutePath}: 1 error(s) detected by tree-sitter.\n` +
    "Fix and re-submit. (This is a pre-write guard — the file was NOT modified.)\n" +
    "  Unexpected `;` at line 1:11\n" +
    "    |\n" +
    "    1 | const y = ;\n" +
    "    |           ^"
  );
}

describe("gated write: applying", () => {
  test("writes valid content verbatim with the built-in success text", async () => {
    await withTempDir(async (dir) => {
      const tool = createGatedWriteTool(dir, {
        grammar: cleanGrammar().grammar,
      });
      const result = (await tool.execute(
        "call-1",
        { path: "c.ts", content: "const y = 2;\n" },
        undefined,
        undefined,
        { cwd: dir },
      )) as WriteSuccess;
      expect(result.content[0].text).toBe(
        "Successfully wrote 13 bytes to c.ts",
      );
      expect(result.details).toBeUndefined();
      expect(await readFile(join(dir, "c.ts"), "utf-8")).toBe("const y = 2;\n");
    });
  });

  test("creates the parent directories for a new file", async () => {
    await withTempDir(async (dir) => {
      const tool = createGatedWriteTool(dir, {
        grammar: cleanGrammar().grammar,
      });
      const result = (await tool.execute(
        "call-2",
        { path: "sub/new.ts", content: "const y = 2;" },
        undefined,
        undefined,
        { cwd: dir },
      )) as WriteSuccess;
      expect(result.content[0].text).toBe(
        "Successfully wrote 12 bytes to sub/new.ts",
      );
      expect(await readFile(join(dir, "sub", "new.ts"), "utf-8")).toBe(
        "const y = 2;",
      );
    });
  });

  test("resolves the path against the session cwd, not the factory cwd", async () => {
    await withTempDir(async (sessionDir) => {
      await withTempDir(async (factoryDir) => {
        const tool = createGatedWriteTool(factoryDir, {
          grammar: cleanGrammar().grammar,
        });
        const result = (await tool.execute(
          "call-3",
          { path: "c.ts", content: "const y = 2;\n" },
          undefined,
          undefined,
          { cwd: sessionDir },
        )) as WriteSuccess;
        expect(result.content[0].text).toBe(
          "Successfully wrote 13 bytes to c.ts",
        );
        expect(await readFile(join(sessionDir, "c.ts"), "utf-8")).toBe(
          "const y = 2;\n",
        );
        expect(await readdir(factoryDir)).toEqual([]);
      });
    });
  });
});

describe("gated write: blocking", () => {
  test("blocks a broken TS write with the parity message for the resolved path", async () => {
    await withTempDir(async (dir) => {
      const tool = createGatedWriteTool(dir, {
        grammar: brokenGrammar().grammar,
      });
      const error = await captureBlock(
        tool.execute(
          "call-4",
          { path: "broken.ts", content: BROKEN_TS },
          undefined,
          undefined,
          { cwd: dir },
        ),
      );
      expect(error.message).toBe(blockedMessageFor(join(dir, "broken.ts")));
      expect(error.editError).toEqual({
        kind: "syntax",
        message: error.message,
      });
    });
  });

  test("creates neither the file nor the parent directory when blocked", async () => {
    await withTempDir(async (dir) => {
      const tool = createGatedWriteTool(dir, {
        grammar: brokenGrammar().grammar,
      });
      await captureBlock(
        tool.execute(
          "call-5",
          { path: "newdir/broken.ts", content: BROKEN_TS },
          undefined,
          undefined,
          { cwd: dir },
        ),
      );
      expect(await existsSync(join(dir, "newdir", "broken.ts"))).toBe(false);
      expect(await existsSync(join(dir, "newdir"))).toBe(false);
    });
  });

  test("leaves an existing file untouched when the write is blocked", async () => {
    await withTempDir(async (dir) => {
      const existing = "const ok = 1;\n";
      await writeFile(join(dir, "existing.ts"), existing);
      const tool = createGatedWriteTool(dir, {
        grammar: brokenGrammar().grammar,
      });
      await captureBlock(
        tool.execute(
          "call-6",
          { path: "existing.ts", content: BROKEN_TS },
          undefined,
          undefined,
          { cwd: dir },
        ),
      );
      expect(await readFile(join(dir, "existing.ts"), "utf-8")).toBe(existing);
    });
  });

  test("validates the exact content submitted, untransformed", async () => {
    await withTempDir(async (dir) => {
      const { grammar, calls } = brokenGrammar();
      const tool = createGatedWriteTool(dir, { grammar });
      await captureBlock(
        tool.execute(
          "call-7",
          { path: "c.ts", content: BROKEN_TS },
          undefined,
          undefined,
          { cwd: dir },
        ),
      );
      expect(calls).toEqual([{ ext: ".ts", content: BROKEN_TS }]);
    });
  });
});

describe("gated write: pass-through", () => {
  test("writes an unknown-extension file verbatim without validation", async () => {
    await withTempDir(async (dir) => {
      const tool = createGatedWriteTool(dir, {
        grammar: unavailableGrammar().grammar,
      });
      const result = (await tool.execute(
        "call-8",
        { path: "notes.txt", content: BROKEN_TS },
        undefined,
        undefined,
        {
          cwd: dir,
        },
      )) as WriteSuccess;
      expect(result.content[0].text).toBe(
        "Successfully wrote 12 bytes to notes.txt",
      );
      expect(await readFile(join(dir, "notes.txt"), "utf-8")).toBe(BROKEN_TS);
    });
  });

  test("writes an extensionless file verbatim without consulting the grammar", async () => {
    await withTempDir(async (dir) => {
      const content = "const y = ; broken {{{\n";
      const { grammar, calls } = cleanGrammar();
      const tool = createGatedWriteTool(dir, { grammar });
      const result = (await tool.execute(
        "call-9",
        { path: "DRAFT", content },
        undefined,
        undefined,
        {
          cwd: dir,
        },
      )) as WriteSuccess;
      expect(result.content[0].text).toBe(
        `Successfully wrote ${content.length} bytes to DRAFT`,
      );
      expect(await readFile(join(dir, "DRAFT"), "utf-8")).toBe(content);
      expect(calls).toEqual([]);
    });
  });

  test("writes a known-extension file verbatim when the grammar is unavailable", async () => {
    await withTempDir(async (dir) => {
      const tool = createGatedWriteTool(dir, {
        grammar: unavailableGrammar().grammar,
      });
      const result = (await tool.execute(
        "call-10",
        { path: "ok.ts", content: BROKEN_TS },
        undefined,
        undefined,
        {
          cwd: dir,
        },
      )) as WriteSuccess;
      expect(result.content[0].text).toBe(
        "Successfully wrote 12 bytes to ok.ts",
      );
      expect(await readFile(join(dir, "ok.ts"), "utf-8")).toBe(BROKEN_TS);
    });
  });
});
