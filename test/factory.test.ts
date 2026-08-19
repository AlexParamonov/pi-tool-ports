// Acceptance tests for the extension factory (wave 1, slice 1.1).
//
// The factory is the outermost driving port: pi calls it once at load. Tests
// pin W1-AC1 (exactly one edit and one write owned by the extension, nothing
// else registered) and US-13 (the model-facing tool surfaces are captured
// unchanged from the libraries).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createWriteToolDefinition } from "@earendil-works/pi-coding-agent";
import { createRobustEditTool } from "pi-semantic-edit/src/pi/tool";

import extensionFactory from "../src/index";
import {
  expectSameToolSurface,
  recordingExtensionApi,
  withTempDir,
} from "./helpers";

// Every input form the edit tool accepts (edits[], replaceAll, JSON-string
// edits, legacy top-level oldText/newText, deprecated SEARCH/REPLACE patch).
const PREPARE_ARGUMENT_INPUTS: unknown[] = [
  { path: "a.ts", edits: [{ oldText: "x", newText: "y" }] },
  { path: "a.ts", edits: [{ oldText: "x", newText: "y", replaceAll: true }] },
  { path: "a.ts", edits: JSON.stringify([{ oldText: "x", newText: "y" }]) },
  { path: "a.ts", oldText: "x", newText: "y" },
  {
    path: "a.ts",
    patch: "a.ts\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE",
  },
  { path: "a.ts", patch: "no SEARCH/REPLACE markers here" },
  { path: "a.ts" },
  null,
];

async function loadExtension() {
  const { api, calls, registered } = recordingExtensionApi();
  await extensionFactory(api);
  return { calls, registered };
}

test("registers exactly one edit and one write tool and nothing else", async () => {
  const { calls, registered } = await loadExtension();
  expect(calls).toEqual(["registerTool", "registerTool"]);
  expect(registered.map((tool) => tool.name).sort()).toEqual(["edit", "write"]);
});

test("registers an edit tool whose surface is unchanged from pse", async () => {
  const { registered } = await loadExtension();
  const actual = registered.find((tool) => tool.name === "edit") as Record<
    string,
    unknown
  >;
  expect(actual, "edit tool registered").toBeDefined();
  const reference = createRobustEditTool(
    process.cwd(),
    {} as unknown as ExtensionAPI,
  ) as Record<string, unknown>;
  expectSameToolSurface(actual, reference);
  expect(typeof actual.execute).toBe("function");
  expect(actual.execute).not.toBe(reference.execute);
});

test("edit prepareArguments normalizes every accepted input form like pse", async () => {
  const { registered } = await loadExtension();
  const actual = registered.find((tool) => tool.name === "edit") as {
    prepareArguments: (input: unknown) => unknown;
  };
  const reference = createRobustEditTool(
    process.cwd(),
    {} as unknown as ExtensionAPI,
  ) as { prepareArguments: (input: unknown) => unknown };
  for (const input of PREPARE_ARGUMENT_INPUTS) {
    expect(
      actual.prepareArguments(input),
      `prepareArguments(${JSON.stringify(input)})`,
    ).toEqual(reference.prepareArguments(input));
  }
});

test("registered edit tool executes the gated implementation, not a stub", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "a.ts");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, "const x = 1;\n");

    const { registered } = await loadExtension();
    const editTool = registered.find((tool) => tool.name === "edit") as {
      execute: (
        toolCallId: string,
        input: unknown,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: { cwd?: string } | undefined,
      ) => Promise<unknown>;
    };
    expect(editTool, "edit tool registered").toBeDefined();

    const result = await editTool.execute(
      "call-1",
      {
        path: filePath,
        edits: [{ oldText: "const x = 1;", newText: "const x = 2;" }],
      },
      undefined,
      undefined,
      { cwd: dir },
    );

    // The gated edit tool returns content + details on success.
    const response = result as {
      content: { type: string; text: string }[];
      details: { diff: string };
    };
    expect(response.content[0].text).toContain("Successfully replaced");
    expect(response.details.diff).toContain("const x = 2;");

    // File was actually modified on disk.
    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("const x = 2;\n");
  });
});

test("registers a write tool whose surface is unchanged from the built-in", async () => {
  const { registered } = await loadExtension();
  const actual = registered.find((tool) => tool.name === "write") as Record<
    string,
    unknown
  >;
  expect(actual, "write tool registered").toBeDefined();
  const reference = createWriteToolDefinition(
    process.cwd(),
  ) as unknown as Record<string, unknown>;
  expectSameToolSurface(actual, reference);
  expect(typeof actual.execute).toBe("function");
  expect(actual.execute).not.toBe(reference.execute);
});
