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
import type { ToolPortsConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

const CONFIG_FILE_NAME = "pi-tool-ports.json";
const CONFIG_DIR = getAgentDir();
const GLOBAL_CONFIG_PATH = path.join(CONFIG_DIR, CONFIG_FILE_NAME);

/** Read config from disk, merged with defaults. */
export function loadConfig(projectDir?: string): ToolPortsConfig {
  const global = readJson(GLOBAL_CONFIG_PATH) ?? {};
  const project = projectDir ? readJson(path.join(projectDir, CONFIG_FILE_NAME)) : null;
  return {
    exclude: {
      patterns: [
        ...(DEFAULT_CONFIG.exclude?.patterns ?? []),
        ...(global.exclude?.patterns ?? []),
        ...(project?.exclude?.patterns ?? []),
      ],
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
