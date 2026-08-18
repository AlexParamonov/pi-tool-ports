/**
 * Gated write tool — wraps the built-in write definition.
 *
 * Validates the exact content against the path's extension through the
 * injectable grammar seam before any I/O. Blocked calls throw the parity
 * error with zero filesystem side effects (no file, no parent directories).
 * Clean calls delegate to the built-in execute unchanged (mkdir, direct
 * writeFile, content verbatim, built-in success text).
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
import { gateBlockError, type GrammarFn } from "./types";

// ── Path resolution (ported from pi-coding-agent's path-utils) ────────
// pi-coding-agent's exports map blocks deep imports. This is a minimal
// port of `resolveToCwd` that matches the built-in behavior: unicode-space
// normalization, @-prefix strip, tilde expand, file:// URLs, then
// isAbsolute → resolve, else resolve(baseDir, input).

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

export interface GatedWriteToolOptions {
  grammar?: GrammarFn;
}

/**
 * Create a gated write execute function that validates content before
 * any I/O, then delegates to the built-in write execute unchanged.
 *
 * Returns the gated execute alongside the captured surface (everything
 * except execute from the built-in definition) for registration.
 */
export function createGatedWriteTool(
  cwd: string,
  options?: GatedWriteToolOptions,
) {
  const grammar = options?.grammar;
  const builtinDef = createWriteToolDefinition(cwd);
  const { execute: _builtinExecute, ...surface } = builtinDef;

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
