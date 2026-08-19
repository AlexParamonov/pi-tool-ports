// Acceptance tests for honoring `ports.<port>.adapters` (standalone issue).
//
// The factory must honor per-port adapter lists:
// - an explicit `[]` disables the port (its tool is not registered);
// - missing config / full lists behave exactly as before (both tools, gate on);
// - the syntax gate runs only for ports whose list contains `tree-sitter`,
//   and per-port gate state must not leak across the shared tree-sitter
//   instance.
//
// Config is injected through the factory's ConfigIO seam (no vi.mock, no
// env vars); gate behavior is observed through the registered tool's
// execute — a gated call throws, a gated-off call writes. The grammar
// seam is injected with a recording fake (brokenGrammar) so the gate-on
// direction never touches the real WASM grammars (no CDN, no disk cache):
// the fake's `calls` proves which port consulted the grammar.

import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { ConfigIO } from "../src/config/config-io";
import type { ToolPortsConfig } from "../src/config/types";
import extensionFactory from "../src/index";
import { createEditPort } from "../src/ports/edit";
import { createWritePort } from "../src/ports/write";
import type { GrammarFn } from "../src/types";
import {
  brokenGrammar,
  makeEditAdapter,
  recordingExtensionApi,
  withTempDir,
} from "./helpers";

const BROKEN_TS = "const x = ;\nconsole.log(x);\n";

function stubCtx(cwd: string): ExtensionContext {
  return { cwd } as ExtensionContext;
}

/** ConfigIO stub: the factory's config seam for tests. */
function configIO(ports: ToolPortsConfig["ports"]): ConfigIO {
  return { load: () => ({ ports }) };
}

async function runFactory(
  ports: ToolPortsConfig["ports"],
  grammar?: GrammarFn,
) {
  const { api, calls, registered } = recordingExtensionApi();
  await extensionFactory(api, configIO(ports), grammar);
  return { calls, registered };
}

function toolNames(registered: Record<string, unknown>[]): string[] {
  return registered.map((tool) => tool.name as string).sort();
}

type EditExecute = ReturnType<typeof createEditPort>["execute"];
type WriteExecute = ReturnType<typeof createWritePort>["execute"];

function editExecuteOf(registered: Record<string, unknown>[]): EditExecute {
  const tool = registered.find((t) => t.name === "edit");
  expect(tool, "edit tool registered").toBeDefined();
  return (tool as unknown as { execute: EditExecute }).execute;
}

function writeExecuteOf(registered: Record<string, unknown>[]): WriteExecute {
  const tool = registered.find((t) => t.name === "write");
  expect(tool, "write tool registered").toBeDefined();
  return (tool as unknown as { execute: WriteExecute }).execute;
}

/** Text of a write tool result's first content block (fails if not text). */
function writeResultText(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  const block = result.content[0];
  expect(block.type).toBe("text");
  return block.text ?? "";
}

describe("factory: honors ports.<port>.adapters registration", () => {
  test("ports.edit.adapters: [] disables the edit tool only", async () => {
    const { calls, registered } = await runFactory({
      edit: { adapters: [] },
    });
    expect(toolNames(registered)).toEqual(["write"]);
    expect(calls).toEqual(["registerTool"]);
  });

  test("ports.write.adapters: [] disables the write tool only", async () => {
    const { calls, registered } = await runFactory({
      write: { adapters: [] },
    });
    expect(toolNames(registered)).toEqual(["edit"]);
    expect(calls).toEqual(["registerTool"]);
  });

  test("both adapter lists empty registers nothing", async () => {
    const { calls, registered } = await runFactory({
      edit: { adapters: [] },
      write: { adapters: [] },
    });
    expect(registered).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("config without ports registers both tools (default behavior)", async () => {
    const { calls, registered } = await runFactory({});
    expect(toolNames(registered)).toEqual(["edit", "write"]);
    expect(calls).toEqual(["registerTool", "registerTool"]);
  });

  test("config with both adapters listed registers both tools", async () => {
    const { registered } = await runFactory({
      edit: { adapters: ["semantic-edit", "tree-sitter"] },
      write: { adapters: ["semantic-edit", "tree-sitter"] },
    });
    expect(toolNames(registered)).toEqual(["edit", "write"]);
  });

  test("edit list without the semantic-edit engine disables the edit tool", async () => {
    const { registered } = await runFactory({
      edit: { adapters: ["tree-sitter"] },
    });
    expect(toolNames(registered)).toEqual(["write"]);
  });

  test("write list with only unknown adapter names disables the write tool", async () => {
    const { calls, registered } = await runFactory({
      write: { adapters: ["treesitter"] },
    });
    expect(toolNames(registered)).toEqual(["edit"]);
    expect(calls).toEqual(["registerTool"]);
  });

  test("write list with an unknown name alongside tree-sitter keeps the gate on", async () => {
    await withTempDir(async (dir) => {
      const { grammar, calls } = brokenGrammar();
      const { registered } = await runFactory(
        {
          edit: { adapters: [] },
          write: { adapters: ["tree-sitter", "treesitter"] },
        },
        grammar,
      );
      expect(toolNames(registered)).toEqual(["write"]);

      await expect(
        writeExecuteOf(registered)(
          "call-1",
          { path: "a.ts", content: BROKEN_TS },
          undefined,
          undefined,
          stubCtx(dir),
        ),
      ).rejects.toThrow("Syntax check failed");
      expect(calls).toEqual([{ ext: ".ts", content: BROKEN_TS }]);
    });
  });
});

describe("factory: per-port gate state (shared tree-sitter)", () => {
  test("disabling tree-sitter for edit leaves the write gate on", async () => {
    await withTempDir(async (dir) => {
      const { grammar, calls } = brokenGrammar();
      const { registered } = await runFactory(
        {
          edit: { adapters: ["semantic-edit"] },
          write: { adapters: ["semantic-edit", "tree-sitter"] },
        },
        grammar,
      );
      expect(toolNames(registered)).toEqual(["edit", "write"]);

      // edit gate off: the broken edit lands without consulting the seam
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, "const x = 1;\n");
      const result = await editExecuteOf(registered)(
        "call-1",
        {
          path: "a.ts",
          edits: [{ oldText: "const x = 1;", newText: "const x = ;" }],
        },
        undefined,
        undefined,
        stubCtx(dir),
      );
      expect(result.content[0].text).toContain("Successfully replaced");
      expect(await readFile(filePath, "utf-8")).toBe("const x = ;\n");
      expect(calls).toEqual([]);

      // write gate still on: the shared tree-sitter is unaffected
      await expect(
        writeExecuteOf(registered)(
          "call-2",
          { path: "b.ts", content: BROKEN_TS },
          undefined,
          undefined,
          stubCtx(dir),
        ),
      ).rejects.toThrow("Syntax check failed");
      await expect(access(join(dir, "b.ts"))).rejects.toThrow();
      expect(calls).toEqual([{ ext: ".ts", content: BROKEN_TS }]);
    });
  });

  test("disabling tree-sitter for write leaves the edit gate on", async () => {
    await withTempDir(async (dir) => {
      const { grammar, calls } = brokenGrammar();
      const { registered } = await runFactory(
        {
          edit: { adapters: ["semantic-edit", "tree-sitter"] },
          write: { adapters: ["semantic-edit"] },
        },
        grammar,
      );
      expect(toolNames(registered)).toEqual(["edit", "write"]);

      // write gate off: the broken write lands without consulting the seam
      const result = await writeExecuteOf(registered)(
        "call-1",
        { path: "b.ts", content: BROKEN_TS },
        undefined,
        undefined,
        stubCtx(dir),
      );
      expect(writeResultText(result)).toBe(
        `Successfully wrote ${BROKEN_TS.length} bytes to b.ts`,
      );
      expect(await readFile(join(dir, "b.ts"), "utf-8")).toBe(BROKEN_TS);
      expect(calls).toEqual([]);

      // edit gate still on: the broken edit is blocked, file untouched
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, "const x = 1;\n");
      const original = await readFile(filePath);
      await expect(
        editExecuteOf(registered)(
          "call-2",
          {
            path: "a.ts",
            edits: [{ oldText: "const x = 1;", newText: "const x = ;" }],
          },
          undefined,
          undefined,
          stubCtx(dir),
        ),
      ).rejects.toThrow("Syntax check failed");
      expect(Buffer.compare(original, await readFile(filePath))).toBe(0);
      expect(calls).toEqual([{ ext: ".ts", content: "const x = ;\n" }]);
    });
  });

  test("write list with only tree-sitter registers write with the gate on", async () => {
    await withTempDir(async (dir) => {
      const { grammar, calls } = brokenGrammar();
      const { registered } = await runFactory(
        {
          edit: { adapters: [] },
          write: { adapters: ["tree-sitter"] },
        },
        grammar,
      );
      expect(toolNames(registered)).toEqual(["write"]);

      await expect(
        writeExecuteOf(registered)(
          "call-1",
          { path: "a.ts", content: BROKEN_TS },
          undefined,
          undefined,
          stubCtx(dir),
        ),
      ).rejects.toThrow("Syntax check failed");
      await expect(access(join(dir, "a.ts"))).rejects.toThrow();
      expect(calls).toEqual([{ ext: ".ts", content: BROKEN_TS }]);
    });
  });
});

describe("write port: gate: false", () => {
  test("writes broken content without consulting the grammar", async () => {
    await withTempDir(async (dir) => {
      const { grammar, calls } = brokenGrammar();
      const { execute } = createWritePort(dir, { grammar, gate: false });

      const result = await execute(
        "call-1",
        { path: "a.ts", content: BROKEN_TS },
        undefined,
        undefined,
        stubCtx(dir),
      );

      expect(writeResultText(result)).toBe(
        `Successfully wrote ${BROKEN_TS.length} bytes to a.ts`,
      );
      expect(await readFile(join(dir, "a.ts"), "utf-8")).toBe(BROKEN_TS);
      expect(calls).toEqual([]);
    });
  });
});

describe("edit port: gate: false", () => {
  test("applies a broken edit without consulting the grammar", async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, "a.ts");
      await writeFile(filePath, "const x = 1;\n");

      const { grammar, calls } = brokenGrammar();
      const port = createEditPort(dir, {
        grammar,
        editAdapter: makeEditAdapter(),
        gate: false,
      });

      const result = await port.execute(
        "call-1",
        {
          path: "a.ts",
          edits: [{ oldText: "const x = 1;", newText: "const x = ;" }],
        },
        undefined,
        undefined,
        stubCtx(dir),
      );

      expect(result.content[0].text).toContain("Successfully replaced");
      expect(await readFile(filePath, "utf-8")).toBe("const x = ;\n");
      expect(calls).toEqual([]);
    });
  });
});
