// Acceptance tests for the gated write tool (wave 1, slice 1.4).
//
// The gated write wraps the built-in write definition: validate the exact
// content before any I/O. Blocked calls throw with the parity error (zero
// filesystem side effects). Clean calls delegate to the built-in execute
// unchanged (mkdir → writeFile, verbatim content, built-in success text).
// Grammar seam is faked — no WASM, no CDN, no cache in unit tests.

import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createWriteToolDefinition } from "@earendil-works/pi-coding-agent";

import { createGatedWriteTool } from "../src/gated-write";
import {
  brokenGrammar,
  captureBlock,
  cleanGrammar,
  unavailableGrammar,
  withTempDir,
} from "./helpers";

// Minimal ExtensionContext stub — tests only need cwd from ctx.
function stubCtx(cwd: string): ExtensionContext {
  return { cwd } as ExtensionContext;
}

// Built-in success text: "Successfully wrote N bytes to {path}"
function successText(content: string, path: string) {
  return `Successfully wrote ${content.length} bytes to ${path}`;
}

function extractText(result: {
  content: Array<{ type: string; text?: string }>;
}) {
  return result.content[0] as { type: string; text: string };
}

const BROKEN_TS_CONTENT = "const x = ;\nconsole.log(x);\n";
const VALID_TS_CONTENT = "const x = 1;\nconsole.log(x);\n";

describe("gated-write: surface equality", () => {
  test("name, description, parameters match the built-in definition", () => {
    const cwd = process.cwd();
    const { surface } = createGatedWriteTool(cwd);
    const builtin = createWriteToolDefinition(cwd);

    expect(surface.name).toBe(builtin.name);
    expect(surface.description).toBe(builtin.description);
    expect(surface.parameters).toEqual(builtin.parameters);
    expect(surface.promptSnippet).toBe(builtin.promptSnippet);
  });
});

describe("gated-write: blocked writes (zero side effects)", () => {
  test("blocks broken TS content; no file and no parent directory created", async () => {
    await withTempDir(async (dir) => {
      const { grammar } = brokenGrammar();
      const { execute } = createGatedWriteTool(dir, { grammar });
      const targetPath = join(dir, "a.ts");

      const err = await captureBlock(
        execute(
          "call-1",
          { path: "a.ts", content: BROKEN_TS_CONTENT },
          undefined,
          undefined,
          stubCtx(dir),
        ),
      );

      // Error has the parity message
      expect(err.message).toContain("Syntax check failed for");
      expect(err.message).toContain("error(s) detected by tree-sitter");
      expect(err.message).toContain("NOT modified");
      expect(err.editError).toBeDefined();
      expect(err.editError!.kind).toBe("syntax");
      expect(err.editError!.message).toBe(err.message);

      // No file created
      await expect(access(targetPath)).rejects.toThrow();

      // No parent directories created beyond the existing dir
      const entries = await readdir(dir);
      expect(entries).toEqual([]);
    });
  });

  test("blocks broken content in a nested path; no file and no parent dirs created", async () => {
    await withTempDir(async (dir) => {
      const { grammar } = brokenGrammar();
      const { execute } = createGatedWriteTool(dir, { grammar });

      const err = await captureBlock(
        execute(
          "call-1",
          { path: "sub/dir/a.ts", content: BROKEN_TS_CONTENT },
          undefined,
          undefined,
          stubCtx(dir),
        ),
      );

      expect(err.message).toContain("Syntax check failed for");
      expect(err.editError).toBeDefined();
      expect(err.editError!.kind).toBe("syntax");

      // No file or nested directories created
      await expect(access(join(dir, "sub"))).rejects.toThrow();
    });
  });
});

describe("gated-write: valid writes", () => {
  test("writes valid content verbatim with built-in success text", async () => {
    await withTempDir(async (dir) => {
      const { grammar } = cleanGrammar();
      const { execute } = createGatedWriteTool(dir, { grammar });
      const targetPath = join(dir, "b.ts");

      const result = await execute(
        "call-1",
        { path: "b.ts", content: VALID_TS_CONTENT },
        undefined,
        undefined,
        stubCtx(dir),
      );

      expect(extractText(result).text).toBe(
        successText(VALID_TS_CONTENT, "b.ts"),
      );

      const written = await readFile(targetPath, "utf-8");
      expect(written).toBe(VALID_TS_CONTENT);
    });
  });

  test("creates parent directories as needed", async () => {
    await withTempDir(async (dir) => {
      const { grammar } = cleanGrammar();
      const { execute } = createGatedWriteTool(dir, { grammar });

      const result = await execute(
        "call-1",
        { path: "nested/deep/file.ts", content: VALID_TS_CONTENT },
        undefined,
        undefined,
        stubCtx(dir),
      );

      expect(extractText(result).text).toBe(
        successText(VALID_TS_CONTENT, "nested/deep/file.ts"),
      );
      const written = await readFile(join(dir, "nested/deep/file.ts"), "utf-8");
      expect(written).toBe(VALID_TS_CONTENT);
    });
  });
});

describe("gated-write: pass-through rules", () => {
  test("passes writes to extensionless paths without validation", async () => {
    await withTempDir(async (dir) => {
      const { grammar, calls } = brokenGrammar(); // grammar would block if consulted
      const { execute } = createGatedWriteTool(dir, { grammar });
      const content = "readme content";

      const result = await execute(
        "call-1",
        { path: "README", content },
        undefined,
        undefined,
        stubCtx(dir),
      );

      // Grammar was never consulted (extensionless path)
      expect(calls).toEqual([]);
      expect(extractText(result).text).toBe(successText(content, "README"));
      const written = await readFile(join(dir, "README"), "utf-8");
      expect(written).toBe(content);
    });
  });

  test("passes writes when grammar is unavailable (seam returns null)", async () => {
    await withTempDir(async (dir) => {
      const { grammar } = unavailableGrammar();
      const { execute } = createGatedWriteTool(dir, { grammar });
      const content = "const x = ;\n"; // broken, but grammar unavailable → pass-through

      const result = await execute(
        "call-1",
        { path: "a.ts", content },
        undefined,
        undefined,
        stubCtx(dir),
      );

      expect(extractText(result).text).toBe(successText(content, "a.ts"));
      const written = await readFile(join(dir, "a.ts"), "utf-8");
      expect(written).toBe(content);
    });
  });
});

describe("gated-write: cwd-quirk pin", () => {
  test("session ctx.cwd takes precedence over factory closure cwd", async () => {
    await withTempDir(async (dirA) => {
      await withTempDir(async (dirB) => {
        const { grammar } = cleanGrammar();
        const { execute } = createGatedWriteTool(dirB, { grammar });
        const content = "const z = 1;\n";

        const result = await execute(
          "call-1",
          { path: "session.ts", content },
          undefined,
          undefined,
          stubCtx(dirA),
        );

        expect(extractText(result).text).toBe(
          successText(content, "session.ts"),
        );
        const written = await readFile(join(dirA, "session.ts"), "utf-8");
        expect(written).toBe(content);

        await expect(access(join(dirB, "session.ts"))).rejects.toThrow();
      });
    });
  });

  test("extension detected from session-cwd-resolved path, not raw path", async () => {
    await withTempDir(async (dirA) => {
      await withTempDir(async (dirB) => {
        const { grammar } = brokenGrammar(); // would block .ts content
        const { execute } = createGatedWriteTool(dirB, { grammar });
        const content = BROKEN_TS_CONTENT;

        const err = await captureBlock(
          execute(
            "call-1",
            { path: "target.ts", content },
            undefined,
            undefined,
            stubCtx(dirA),
          ),
        );

        expect(err.message).toContain("Syntax check failed for");
        expect(err.editError!.kind).toBe("syntax");
        await expect(access(join(dirA, "target.ts"))).rejects.toThrow();
        await expect(access(join(dirB, "target.ts"))).rejects.toThrow();
      });
    });
  });
});
