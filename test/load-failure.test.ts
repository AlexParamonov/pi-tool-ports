// Acceptance tests for load failure (wave 2, slice 2.2).
//
// Two unit-level pins of the US-12 / W2-AC2 load-failure contract:
//
// 1. Construction order — both tool definitions are fully constructed
//    before any pi.registerTool call. A construction failure therefore
//    propagates out of the factory with zero registrations: the loader
//    drops the extension wholesale and the built-in edit/write remain.
//    The fault is injected at the tool-constructor boundary (the factory's
//    own collaborators) via vi.hoisted flag + vi.mock passthrough, scoped
//    to this file so factory.test.ts keeps real construction.
//
// 2. Static ESM load failure — an unresolvable deep import rejects at
//    module load, before any module body (and therefore before the
//    factory) runs. Verified with a throwaway entry at the repo root (not
//    /tmp: resolution roots at the entry's location, which has
//    node_modules).
//
// The pi-side surface — jiti's visible diagnostic, the -ne hint, and the
// built-in edit/write fallback in a live session — is verified exclusively
// by the manual tmux run per the corrected W2-AC2 recipe in wave.md
// (throwaway copy of src/ with a mangled deep import; built-ins proven by
// file bytes, not a model reply).

import { randomUUID } from "node:crypto";
import { access, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

import extensionFactory from "../src/index";
import { recordingExtensionApi } from "./helpers";

// Fault-injection flags, hoisted because vi.mock factories run before
// imports. The mocks delegate to the real constructors unless a flag says
// throw, so this file pins both the edit- and write-construction failures.
const construction = vi.hoisted(() => ({
  failEdit: false,
  failWrite: false,
}));

vi.mock("../src/gated-edit", async (importOriginal) => {
  const original =
    (await importOriginal()) as typeof import("../src/gated-edit");
  const realCreate = original.createGatedEditTool;
  return {
    ...original,
    createGatedEditTool: (...args: Parameters<typeof realCreate>) => {
      if (construction.failEdit) {
        throw new Error("simulated edit construction failure");
      }
      return realCreate(...args);
    },
  };
});

vi.mock("../src/gated-write", async (importOriginal) => {
  const original =
    (await importOriginal()) as typeof import("../src/gated-write");
  const realCreate = original.createGatedWriteTool;
  return {
    ...original,
    createGatedWriteTool: (...args: Parameters<typeof realCreate>) => {
      if (construction.failWrite) {
        throw new Error("simulated write construction failure");
      }
      return realCreate(...args);
    },
  };
});

// ── Construction order: nothing is registered before construction ends ─

async function runFactoryExpectingThrow(): Promise<{
  err: unknown;
  calls: string[];
  registered: Record<string, unknown>[];
}> {
  const { api, calls, registered } = recordingExtensionApi();
  let err: unknown;
  try {
    await extensionFactory(api);
  } catch (e) {
    err = e;
  }
  return { err, calls, registered };
}

test("a failing edit construction rejects the factory with zero registrations", async () => {
  construction.failEdit = true;
  try {
    const { err, calls, registered } = await runFactoryExpectingThrow();

    // The construction error propagates unchanged (the loader sees it)
    expect(
      err,
      "factory must reject when edit construction fails",
    ).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("simulated edit construction failure");

    // No API method touched, no partial registration
    expect(calls).toEqual([]);
    expect(registered).toEqual([]);
  } finally {
    construction.failEdit = false;
  }
});

test("a failing write construction rejects the factory with zero registrations", async () => {
  // The edit construction succeeds (passthrough to the real constructor);
  // the write construction throws. Even so: zero registrations — if the
  // factory registered the edit before constructing the write, this test
  // would catch the partial registration.
  construction.failWrite = true;
  try {
    const { err, calls, registered } = await runFactoryExpectingThrow();

    expect(
      err,
      "factory must reject when write construction fails",
    ).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("simulated write construction failure");

    expect(calls).toEqual([]);
    expect(registered).toEqual([]);
  } finally {
    construction.failWrite = false;
  }
});

// ── Static ESM load failure: reject at load, body never runs ───────────

// Repo root: module resolution for the throwaway entry must root where
// node_modules lives (mirrors the shipped entry's resolution context).
const REPO_ROOT = process.cwd();

test("an unresolvable deep import rejects at load before the module body runs", async () => {
  const id = randomUUID();
  const entryPath = join(REPO_ROOT, `load-fail-entry-${id}.ts`);
  const markerPath = join(tmpdir(), `load-fail-marker-${id}`);
  try {
    // Throwaway entry: a broken deep import, a top-level marker write
    // (the "module body ran" sentinel), and a default-exported factory.
    await writeFile(
      entryPath,
      [
        'import "pi-semantic-edit/src/pi/tool-nonexistent";',
        'import { writeFile } from "node:fs/promises";',
        `await writeFile(${JSON.stringify(markerPath)}, "module body ran");`,
        "export default async function factory() {}",
        "",
      ].join("\n"),
    );

    let err: unknown;
    try {
      await import(/* @vite-ignore */ `file://${entryPath}`);
    } catch (e) {
      err = e;
    }

    // Module load rejects, naming the missing module. The loader's exact
    // wording is not pinned here (jiti's wording is the tmux run's job).
    expect(err, "module load must reject").toBeDefined();
    expect(String((err as Error).message)).toContain(
      "pi-semantic-edit/src/pi/tool-nonexistent",
    );

    // The module body never ran: no marker file was created, so the
    // factory was never even defined.
    await expect(access(markerPath)).rejects.toThrow();
  } finally {
    await rm(entryPath, { force: true });
    await rm(markerPath, { force: true });
  }
});
