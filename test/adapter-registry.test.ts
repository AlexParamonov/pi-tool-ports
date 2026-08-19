// Adapter registry tests — verify ports work with dynamically loaded adapters.
//
// Testing strategy: test from port perspective (public interface), not adapter
// internals. Generic tests work with any adapter implementation. Test all
// shipped adapters (don't swap, test what we ship).

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { loadAdapter, type AdapterName } from "../src/adapters/registry";
import { createEditPort } from "../src/ports/edit";
import { createWritePort } from "../src/ports/write";
import { validateSyntax } from "../src/gates/syntax";
import {
  recordingGrammar,
  makeFakeTree,
  STRAY_SEMICOLON_NODE,
  withTempDir,
  captureBlock,
} from "./helpers";

// ── Adapter loading ──────────────────────────────────────────────────

describe("adapter registry: loadAdapter", () => {
  test("loading unknown adapter throws", async () => {
    await expect(loadAdapter("nonexistent" as AdapterName)).rejects.toThrow(
      /unknown adapter/i,
    );
  });
});

// ── Port-level tests with real adapters ──────────────────────────────
// These test the port's public interface: apply edits, validate syntax,
// return correct shape. They use the real shipped adapters (no swapping).

describe("port-level: edit port with real adapters", () => {
  test("applies valid edit and returns success shape", async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, "const x = 1;\n");

      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeTree([]),
      });
      const port = createEditPort(dir, { grammar });

      const result = await port.execute(
        "call-1",
        {
          path: "a.ts",
          edits: [{ oldText: "const x = 1;", newText: "const x = 2;" }],
        },
        undefined,
        undefined,
        { cwd: dir } as ExtensionContext,
      );

      expect(result.content[0]).toHaveProperty("text");
      expect((result.content[0] as { text: string }).text).toContain(
        "Successfully replaced",
      );
      expect(result.details).toBeDefined();
      expect(typeof result.details.diff).toBe("string");
      expect(await readFile(filePath, "utf-8")).toBe("const x = 2;\n");
    });
  });

  test("blocks edit with syntax error", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "a.ts"), "const x = 1;\n");

      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeTree([STRAY_SEMICOLON_NODE]),
      });
      const port = createEditPort(dir, { grammar });

      const err = await captureBlock(
        port.execute(
          "call-1",
          {
            path: "a.ts",
            edits: [{ oldText: "const x = 1;", newText: "const x = ;" }],
          },
          undefined,
          undefined,
          { cwd: dir } as ExtensionContext,
        ),
      );

      expect(err.message).toContain("Syntax check failed");
      expect(err.editError?.kind).toBe("syntax");
    });
  });
});

describe("port-level: write port with real adapters", () => {
  test("writes valid content and returns success shape", async () => {
    await withTempDir(async (dir) => {
      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeTree([]),
      });
      const port = createWritePort(dir, { grammar });

      const result = await port.execute(
        "call-1",
        { path: "a.ts", content: "const x = 1;\n" },
        undefined,
        undefined,
        { cwd: dir } as ExtensionContext,
      );

      expect(result.content[0]).toHaveProperty("text");
      expect((result.content[0] as { text: string }).text).toContain(
        "Successfully wrote",
      );
      expect(await readFile(join(dir, "a.ts"), "utf-8")).toBe("const x = 1;\n");
    });
  });

  test("blocks write with syntax error", async () => {
    await withTempDir(async (dir) => {
      const { grammar } = recordingGrammar({
        available: true,
        tree: makeFakeTree([STRAY_SEMICOLON_NODE]),
      });
      const port = createWritePort(dir, { grammar });

      const err = await captureBlock(
        port.execute(
          "call-1",
          { path: "a.ts", content: "const x = ;\n" },
          undefined,
          undefined,
          { cwd: dir } as ExtensionContext,
        ),
      );

      expect(err.message).toContain("Syntax check failed");
      expect(err.editError?.kind).toBe("syntax");
    });
  });
});

describe("port-level: gate with real adapters", () => {
  test("passes clean content", async () => {
    const { grammar } = recordingGrammar({
      available: true,
      tree: makeFakeTree([]),
    });
    const result = await validateSyntax("a.ts", "const x = 1;\n", grammar);
    expect(result).toBeNull();
  });

  test("blocks content with syntax error", async () => {
    const { grammar } = recordingGrammar({
      available: true,
      tree: makeFakeTree([STRAY_SEMICOLON_NODE]),
    });
    const result = await validateSyntax("a.ts", "const x = ;\n", grammar);
    expect(result).toContain("Syntax check failed");
  });
});
