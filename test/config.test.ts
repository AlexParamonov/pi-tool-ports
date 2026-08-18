import { describe, expect, test } from "vitest";

import { loadConfig, type ConfigIO } from "../src/config/config-io";
import { DEFAULT_CONFIG, type ToolPortsConfig } from "../src/config/types";

// ── Helpers ────────────────────────────────────────────────────────────

function memIO(patterns: string[] = []): ConfigIO {
  return {
    load: () => ({
      exclude: { patterns },
    }),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("loadConfig", () => {
  test("returns empty patterns when no config files exist", () => {
    const config = loadConfig(memIO());
    expect(config.exclude?.patterns).toEqual([]);
  });

  test("loads config patterns", () => {
    const config = loadConfig(memIO(["test-pattern"]));
    expect(config.exclude?.patterns).toContain("test-pattern");
  });

  test("merges with defaults", () => {
    const config = loadConfig(memIO(["custom-pattern"]));
    // Should have default patterns + custom
    expect(config.exclude?.patterns).toContain("custom-pattern");
  });

  test("missing exclude returns empty patterns", () => {
    const io: ConfigIO = {
      load: () => ({}),
    };
    const config = loadConfig(io);
    expect(config.exclude?.patterns).toEqual([]);
  });
});

describe("adapter config", () => {
  test("default config has all adapters enabled for all ports", () => {
    const config = loadConfig(memIO());
    expect(config.ports?.edit?.adapters).toEqual([
      "semantic-edit",
      "tree-sitter",
    ]);
    expect(config.ports?.write?.adapters).toEqual([
      "semantic-edit",
      "tree-sitter",
    ]);
  });

  test("config with custom port adapters overrides defaults", () => {
    const customConfig: ToolPortsConfig = {
      ports: {
        edit: { adapters: ["semantic-edit"] },
        write: { adapters: ["tree-sitter"] },
      },
    };
    const io: ConfigIO = {
      load: () => customConfig,
    };
    const config = loadConfig(io);
    expect(config.ports?.edit?.adapters).toEqual(["semantic-edit"]);
    expect(config.ports?.write?.adapters).toEqual(["tree-sitter"]);
  });

  test("config without ports gets default adapter selection", () => {
    const io: ConfigIO = {
      load: () => ({}),
    };
    const config = loadConfig(io);
    expect(config.ports?.edit?.adapters).toEqual([
      "semantic-edit",
      "tree-sitter",
    ]);
    expect(config.ports?.write?.adapters).toEqual([
      "semantic-edit",
      "tree-sitter",
    ]);
  });
});
