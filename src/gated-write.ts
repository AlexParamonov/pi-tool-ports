/**
 * Gated write tool: validate before any I/O, zero side effects on block,
 * clean calls delegate to the built-in write unchanged.
 */

import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentToolUpdateCallback,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createWriteToolDefinition } from "@earendil-works/pi-coding-agent";

import { validateContent } from "./gate";
import { gateBlockError, type GatedToolOptions } from "./types";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

function normalizeInput(input: string): string {
  let normalized = input.replace(UNICODE_SPACES, " ");
  if (normalized.startsWith("@")) {
    normalized = normalized.slice(1);
  }
  // Tilde expansion
  const home = homedir();
  if (normalized === "~") return home;
  if (normalized.startsWith("~/")) {
    return join(home, normalized.slice(2));
  }
  // file:// URL
  if (/^file:\/\//.test(normalized)) {
    return fileURLToPath(normalized);
  }
  return normalized;
}

function builtinResolveToCwd(filePath: string, cwd: string): string {
  const normalized = normalizeInput(filePath);
  return isAbsolute(normalized)
    ? resolve(normalized)
    : resolve(cwd, normalized);
}

// ── Gated write tool factory ──────────────────────────────────────────

export type GatedWriteToolOptions = GatedToolOptions;

export function createGatedWriteTool(
  cwd: string,
  options?: GatedWriteToolOptions,
) {
  const grammar = options?.grammar;
  const builtinDef = createWriteToolDefinition(cwd);
  const { ...surface } = builtinDef;

  const execute = async (
    toolCallId: string,
    { path, content }: { path: string; content: string },
    signal: AbortSignal | undefined,
    onUpdate: AgentToolUpdateCallback | undefined,
    ctx: ExtensionContext,
  ) => {
    const baseCwd = ctx?.cwd ?? cwd;
    const absolutePath = builtinResolveToCwd(path, baseCwd);

    // GATE before any I/O: validate the exact content against the resolved path
    const blockMessage = await validateContent(absolutePath, content, grammar);
    if (blockMessage !== null) {
      throw gateBlockError(blockMessage);
    }

    // Clean: delegate to the built-in execute with the same baseCwd
    // so validation and write share one resolution by construction.
    return createWriteToolDefinition(baseCwd).execute(
      toolCallId,
      { path, content },
      signal,
      onUpdate,
      ctx,
    );
  };

  return { surface, execute };
}
