/**
 * Config persistence for pi-tool-ports.
 *
 * Two layers:
 * - Global: ~/.pi/agent/pi-tool-ports.json
 * - Project: .pi/pi-tool-ports.json (trusted project only)
 *
 * Project keys override global keys. Missing keys inherit from global.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExcludeConfig, ToolPortsConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

const CONFIG_FILE_NAME = "pi-tool-ports.json";
const CONFIG_DIR = getAgentDir();
const GLOBAL_CONFIG_PATH = path.join(CONFIG_DIR, CONFIG_FILE_NAME);

/** Persistence port for config loading. */
export interface ConfigIO {
  load(): ToolPortsConfig;
}

/** Default file-based ConfigIO. */
export function createFileConfigIO(projectDir?: string): ConfigIO {
  return {
    load: () => {
      const global = readJson(GLOBAL_CONFIG_PATH) ?? {};
      const project = projectDir
        ? readJson(path.join(projectDir, CONFIG_FILE_NAME))
        : null;
      return {
        exclude: {
          patterns: [
            ...((global.exclude as ExcludeConfig | undefined)?.patterns ?? []),
            ...((project?.exclude as ExcludeConfig | undefined)?.patterns ??
              []),
          ],
        },
        ports: (project?.ports ?? global?.ports) as ToolPortsConfig["ports"],
      };
    },
  };
}

/** Read config, merged with defaults. Accepts injectable ConfigIO for testing. */
export function loadConfig(io?: ConfigIO): ToolPortsConfig {
  const loaded = (io ?? createFileConfigIO()).load();
  const g: ExcludeConfig = loaded.exclude ?? {};
  return {
    exclude: {
      patterns: [
        ...(DEFAULT_CONFIG.exclude?.patterns ?? []),
        ...(g.patterns ?? []),
      ],
    },
    ports: {
      edit: {
        adapters: loaded.ports?.edit?.adapters ??
          DEFAULT_CONFIG.ports?.edit?.adapters ?? [
            "semantic-edit",
            "tree-sitter",
          ],
      },
      write: {
        adapters: loaded.ports?.write?.adapters ??
          DEFAULT_CONFIG.ports?.write?.adapters ?? [
            "semantic-edit",
            "tree-sitter",
          ],
      },
    },
  };
}

function readJson(filePath: string): ToolPortsConfig | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ToolPortsConfig;
  } catch {
    return null;
  }
}
