import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { loadConfig } from "../src/config/config-io";
import { DEFAULT_CONFIG } from "../src/config/types";

// ── Helpers ────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(await createTempDir(), "config-test");
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  // Cleanup handled by OS temp dir cleanup
});

async function createTempDir(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  return mkdtemp(join(tmpdir(), "pi-tool-ports-test-"));
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("loadConfig", () => {
  test("returns empty patterns when no config files exist", () => {
    const config = loadConfig("/nonexistent/project", "/nonexistent/global");
    expect(config.exclude?.patterns).toEqual([]);
  });

  test("loads global config patterns", async () => {
    const globalDir = join(tmpDir, "global");
    await mkdir(globalDir, { recursive: true });
    await writeFile(
      join(globalDir, "pi-tool-ports.json"),
      JSON.stringify({ exclude: { patterns: ["global-pattern"] } }),
    );

    const config = loadConfig("/nonexistent/project", globalDir);
    expect(config.exclude?.patterns).toContain("global-pattern");
  });

  test("project patterns are merged with global", async () => {
    const globalDir = join(tmpDir, "global-merge");
    await mkdir(globalDir, { recursive: true });
    await writeFile(
      join(globalDir, "pi-tool-ports.json"),
      JSON.stringify({ exclude: { patterns: ["global-pattern"] } }),
    );

    const projectDir = join(tmpDir, "project-merge");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      join(projectDir, "pi-tool-ports.json"),
      JSON.stringify({ exclude: { patterns: ["project-pattern"] } }),
    );

    const config = loadConfig(projectDir, globalDir);
    expect(config.exclude?.patterns).toContain("global-pattern");
    expect(config.exclude?.patterns).toContain("project-pattern");
  });

  test("empty config file does not break merge", async () => {
    const globalDir = join(tmpDir, "global-empty");
    await mkdir(globalDir, { recursive: true });
    await writeFile(
      join(globalDir, "pi-tool-ports.json"),
      JSON.stringify({ exclude: { patterns: ["global-pattern"] } }),
    );

    const projectDir = join(tmpDir, "project-empty");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "pi-tool-ports.json"), "{}");

    const config = loadConfig(projectDir, globalDir);
    expect(config.exclude?.patterns).toContain("global-pattern");
  });

  test("missing exclude key does not break merge", async () => {
    const globalDir = join(tmpDir, "global-no-exclude");
    await mkdir(globalDir, { recursive: true });
    await writeFile(
      join(globalDir, "pi-tool-ports.json"),
      JSON.stringify({ exclude: { patterns: ["global-pattern"] } }),
    );

    const projectDir = join(tmpDir, "project-no-exclude");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      join(projectDir, "pi-tool-ports.json"),
      JSON.stringify({ other: "value" }),
    );

    const config = loadConfig(projectDir, globalDir);
    expect(config.exclude?.patterns).toContain("global-pattern");
  });
});
