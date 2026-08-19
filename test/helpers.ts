// Shared test helpers: fake parse trees, a recording grammar seam, and
// temp-dir factories. No gate/message logic lives here — expected values
// are pinned as literals in the test files (the byte-parity contract).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createSemanticEditAdapter } from "../src/adapters/semantic-edit-adapter";
import type { EditAdapter } from "../src/adapters/types";
import type { GrammarFn } from "../src/types";

// ── Real adapter for tests ─────────────────────────────────────────────

/** Create a real semantic-edit adapter for tests. */
export function makeEditAdapter(): EditAdapter {
  return createSemanticEditAdapter();
}

// ── Fake web-tree-sitter trees ──────────────────────────────────────────
// The fake nodes expose only the fields the validator reads (rootNode.hasError,
// isError/isMissing, childCount/child, children, startPosition/startIndex/
// endIndex, type). No WASM runtime, no network.

export interface FakePosition {
  row: number;
  column: number;
}

export interface FakeNodeSpec {
  type?: string;
  isError?: boolean;
  isMissing?: boolean;
  children?: FakeNodeSpec[];
  position?: FakePosition;
  start?: number;
  end?: number;
}

export interface FakeNode {
  type: string;
  isError: boolean;
  isMissing: boolean;
  hasError: boolean;
  startPosition: FakePosition;
  startIndex: number;
  endIndex: number;
  childCount: number;
  child: (i: number) => FakeNode;
  children: FakeNode[];
}

export interface FakeTree {
  rootNode: FakeNode;
}

function buildNode(spec: FakeNodeSpec): FakeNode {
  const children = (spec.children ?? []).map(buildNode);
  const hasError =
    !!spec.isError || !!spec.isMissing || children.some((c) => c.hasError);
  return {
    type: spec.type ?? "source_file",
    isError: !!spec.isError,
    isMissing: !!spec.isMissing,
    hasError,
    startPosition: spec.position ?? { row: 0, column: 0 },
    startIndex: spec.start ?? 0,
    endIndex: spec.end ?? 0,
    childCount: children.length,
    child: (i: number) => children[i],
    children,
  };
}

/** A tree with a clean (error-free) root. */
export function cleanFakeTree(): FakeTree {
  return { rootNode: buildNode({}) };
}

/** A tree whose root contains the given problem nodes (errors/missing). */
export function makeFakeTree(problems: FakeNodeSpec[]): FakeTree {
  return { rootNode: buildNode({ children: problems }) };
}

// ── Grammar seam fakes ──────────────────────────────────────────────
// Stands in for the real parser seam (CDN grammars). Records every
// (ext, content) the validator hands across the boundary.

type GrammarCalls = { ext: string; content: string }[];

export type FakeGrammarResult = { available: boolean; tree: FakeTree | null };

export function recordingGrammar(
  result:
    FakeGrammarResult | ((ext: string, content: string) => FakeGrammarResult),
) {
  const calls: GrammarCalls = [];
  const grammar = async (
    ext: string,
    content: string,
  ): Promise<FakeGrammarResult> => {
    calls.push({ ext, content });
    return typeof result === "function" ? result(ext, content) : result;
  };
  return { grammar: grammar as unknown as GrammarFn, calls };
}

/** The ERROR node the real TS grammar reports for `const x = ;` — the stray
 *  `;` at line 1, column 11 (1-based). */
export const STRAY_SEMICOLON_NODE: FakeNodeSpec = {
  type: "ERROR",
  isError: true,
  position: { row: 0, column: 10 },
  start: 10,
  end: 11,
};

export function cleanGrammar() {
  return recordingGrammar({ available: true, tree: cleanFakeTree() });
}

export function unavailableGrammar() {
  return recordingGrammar({ available: false, tree: null });
}

export function brokenGrammar() {
  return recordingGrammar({
    available: true,
    tree: makeFakeTree([STRAY_SEMICOLON_NODE]),
  });
}

// ── Temp-dir factories ──────────────────────────────────────────────────

export async function withTempDir<T>(
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "gated-w1-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ── Error capture

/** The structured error a blocked tool call carries (for renderers/debugging). */
export interface ToolError extends Error {
  editError?: { kind: string; message: string; [key: string]: unknown };
}

/** Await a tool call that must be blocked; return the thrown error. */
export async function captureBlock(
  promise: Promise<unknown>,
): Promise<ToolError> {
  try {
    await promise;
  } catch (err) {
    return err as ToolError;
  }
  throw new Error("expected the tool call to be blocked, but it succeeded");
}

// ── Tool surface comparison ─────────────────────────────────────────────

/**
 * Assert the registered tool's model-facing surface matches the reference
 * definition field for field — every field except `execute`, which the host
 * swaps for the gated implementation (checked by the callers).
 */
export function expectSameToolSurface(
  actual: Record<string, unknown>,
  reference: Record<string, unknown>,
) {
  const referenceKeys = Object.keys(reference).filter(
    (key) => key !== "execute",
  );
  const actualKeys = Object.keys(actual).filter((key) => key !== "execute");
  expect(actualKeys.sort()).toEqual(referenceKeys.sort());
  for (const key of referenceKeys) {
    const referenceValue = reference[key];
    const actualValue = actual[key];
    if (typeof referenceValue === "function") {
      expect(typeof actualValue, `${key} should stay a function`).toBe(
        "function",
      );
    } else if (referenceValue !== null && typeof referenceValue === "object") {
      expect(actualValue, `${key} should match the reference`).toEqual(
        referenceValue,
      );
    } else {
      expect(
        actualValue,
        `${key} should be ${JSON.stringify(referenceValue)}`,
      ).toBe(referenceValue);
    }
  }
}

// ── Recording ExtensionAPI ──────────────────────────────────────────────

/**
 * Records every ExtensionAPI method the extension factory touches. Any
 * method beyond registerTool fails the "exactly two tools, nothing else"
 * contract.
 */
export function recordingExtensionApi() {
  const calls: string[] = [];
  const registered: Record<string, unknown>[] = [];
  const api = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "symbol") return undefined;
        calls.push(prop);
        if (prop === "registerTool") {
          return (tool: Record<string, unknown>) => {
            registered.push(tool);
          };
        }
        return () => undefined;
      },
    },
  ) as unknown as ExtensionAPI;
  return { api, calls, registered };
}
