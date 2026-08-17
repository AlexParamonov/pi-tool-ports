// Acceptance tests for the extension factory (wave 1, slice 1.1).
//
// The factory is the outermost driving port: pi calls it once at load. Tests
// pin W1-AC1 (exactly one edit and one write owned by the extension, nothing
// else registered) and US-13 (the model-facing tool surfaces are captured
// unchanged from the libraries), plus the R14 deep-import surface smoke.

import { expect, test } from "vitest";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createWriteToolDefinition } from "@earendil-works/pi-coding-agent";
import { createRobustEditTool } from "pi-semantic-edit/src/pi/tool";

import extensionFactory from "../src/index";
import { expectSameToolSurface, recordingExtensionApi } from "./helpers";

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

test("deep-imported dependency modules load side-effect-free with their expected exports", async () => {
  const [
    pseTool,
    pseNormalize,
    pseSchema,
    pseEditor,
    pseCoherence,
    pseErrors,
    pseParser,
    pseUtils,
    ptsGrammar,
    ptsDelimiter,
    agent,
  ] = await Promise.all([
    import("pi-semantic-edit/src/pi/tool"),
    import("pi-semantic-edit/src/pi/normalize"),
    import("pi-semantic-edit/src/pi/schema"),
    import("pi-semantic-edit/src/domain/editor"),
    import("pi-semantic-edit/src/domain/coherence"),
    import("pi-semantic-edit/src/domain/errors"),
    import("pi-semantic-edit/src/domain/parser"),
    import("pi-semantic-edit/src/domain/utils"),
    import("pi-tree-sitter/src/grammar"),
    import("pi-tree-sitter/src/delimiter"),
    import("@earendil-works/pi-coding-agent"),
  ]);
  const functions: [string, unknown][] = [
    [
      "pi-semantic-edit/src/pi/tool createRobustEditTool",
      pseTool.createRobustEditTool,
    ],
    [
      "pi-semantic-edit/src/pi/normalize normalizeEditArgs",
      pseNormalize.normalizeEditArgs,
    ],
    ["pi-semantic-edit/src/domain/editor applyBlocks", pseEditor.applyBlocks],
    [
      "pi-semantic-edit/src/domain/coherence coherenceCheck",
      pseCoherence.coherenceCheck,
    ],
    [
      "pi-semantic-edit/src/domain/errors fileNotFoundError",
      pseErrors.fileNotFoundError,
    ],
    [
      "pi-semantic-edit/src/domain/errors malformedPatchError",
      pseErrors.malformedPatchError,
    ],
    [
      "pi-semantic-edit/src/domain/errors missingPathError",
      pseErrors.missingPathError,
    ],
    [
      "pi-semantic-edit/src/domain/errors validationError",
      pseErrors.validationError,
    ],
    ["pi-semantic-edit/src/domain/utils stripBom", pseUtils.stripBom],
    [
      "pi-semantic-edit/src/domain/utils detectLineEnding",
      pseUtils.detectLineEnding,
    ],
    [
      "pi-semantic-edit/src/domain/utils normalizeNewlines",
      pseUtils.normalizeNewlines,
    ],
    [
      "pi-semantic-edit/src/domain/utils restoreLineEndings",
      pseUtils.restoreLineEndings,
    ],
    ["pi-semantic-edit/src/domain/utils resolveToCwd", pseUtils.resolveToCwd],
    ["pi-tree-sitter/src/grammar ensureParser", ptsGrammar.ensureParser],
    ["pi-tree-sitter/src/grammar loadGrammar", ptsGrammar.loadGrammar],
    [
      "pi-tree-sitter/src/delimiter checkDelimiterBalance",
      ptsDelimiter.checkDelimiterBalance,
    ],
    [
      "pi-coding-agent createWriteToolDefinition",
      agent.createWriteToolDefinition,
    ],
    ["pi-coding-agent generateDiffString", agent.generateDiffString],
    ["pi-coding-agent generateUnifiedPatch", agent.generateUnifiedPatch],
    ["pi-coding-agent withFileMutationQueue", agent.withFileMutationQueue],
  ];
  for (const [name, fn] of functions) {
    expect(typeof fn, name).toBe("function");
  }
  expect(pseParser.MalformedPatchError).toBeTypeOf("function");
  expect(pseSchema.editToolSchema).toBeTypeOf("object");
  expect(ptsGrammar.LANGUAGE_MAP[".ts"]).toBeDefined();
  expect(ptsDelimiter.BALANCE_RULES[".clj"]).toBeDefined();
});
