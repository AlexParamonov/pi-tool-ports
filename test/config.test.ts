import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  createFileConfigIO,
  loadConfig,
  type ConfigIO,
} from "../src/config/config-io";
import type { ToolPortsConfig } from "../src/config/types";
import { withTempDir } from "./helpers";

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

  test("missing exclude returns empty patterns", () => {
    const io: ConfigIO = {
      load: () => ({}),
    };
    const config = loadConfig(io);
    expect(config.exclude?.patterns).toEqual([]);
  });
});

describe("createFileConfigIO", () => {
  test("preserves ports from project config file", async () => {
    await withTempDir(async (dir) => {
      await writeFile(
        join(dir, "pi-tool-ports.json"),
        JSON.stringify({
          ports: {
            edit: { adapters: ["semantic-edit"] },
            write: { adapters: ["tree-sitter"] },
          },
        }),
      );
      const io = createFileConfigIO(dir);
      const loaded = io.load();
      expect(loaded.ports?.edit?.adapters).toEqual(["semantic-edit"]);
      expect(loaded.ports?.write?.adapters).toEqual(["tree-sitter"]);
    });
  });

  test("preserves ports alongside exclude from project config", async () => {
    await withTempDir(async (dir) => {
      await writeFile(
        join(dir, "pi-tool-ports.json"),
        JSON.stringify({
          exclude: { patterns: ["node_modules"] },
          ports: {
            edit: { adapters: ["tree-sitter"] },
          },
        }),
      );
      const io = createFileConfigIO(dir);
      const loaded = io.load();
      expect(loaded.exclude?.patterns).toContain("node_modules");
      expect(loaded.ports?.edit?.adapters).toEqual(["tree-sitter"]);
      expect(loaded.ports?.write?.adapters).toBeUndefined();
    });
  });

  test("returns empty config when no files exist", () => {
    const io = createFileConfigIO("/nonexistent/path");
    const loaded = io.load();
    expect(loaded.ports).toBeUndefined();
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

  test("unknown adapter names are dropped, known names kept", () => {
    const io: ConfigIO = {
      load: () => ({
        ports: {
          write: { adapters: ["tree-sitter", "treesitter"] },
          edit: { adapters: ["bogus"] },
        },
      }),
    };
    const config = loadConfig(io);
    expect(config.ports.write.adapters).toEqual(["tree-sitter"]);
    expect(config.ports.edit.adapters).toEqual([]);
  });

  test("prototype-key names are not adapter names", () => {
    const io: ConfigIO = {
      load: () => ({
        ports: {
          write: { adapters: ["constructor"] },
          edit: { adapters: ["toString", "__proto__"] },
        },
      }),
    };
    const config = loadConfig(io);
    expect(config.ports.write.adapters).toEqual([]);
    expect(config.ports.edit.adapters).toEqual([]);
  });
});
