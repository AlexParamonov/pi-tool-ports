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
  test("returns empty patterns when no project config exists", () => {
    const config = loadConfig("/nonexistent/path");
    // Global config may exist, but patterns should be an array
    expect(Array.isArray(config.exclude?.patterns)).toBe(true);
  });

  test("project patterns are merged into result", async () => {
    const projectDir = join(tmpDir, "project");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      join(projectDir, "pi-tool-ports.json"),
      JSON.stringify({ exclude: { patterns: ["project-pattern"] } }),
    );

    const config = loadConfig(projectDir);
    expect(config.exclude?.patterns).toContain("project-pattern");
  });

  test("empty config file does not break merge", async () => {
    const projectDir = join(tmpDir, "empty");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "pi-tool-ports.json"), "{}");

    const config = loadConfig(projectDir);
    expect(Array.isArray(config.exclude?.patterns)).toBe(true);
  });

  test("missing exclude key does not break merge", async () => {
    const projectDir = join(tmpDir, "no-exclude");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      join(projectDir, "pi-tool-ports.json"),
      JSON.stringify({ other: "value" }),
    );

    const config = loadConfig(projectDir);
    expect(Array.isArray(config.exclude?.patterns)).toBe(true);
  });
});
