import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  LANGUAGE_MAP,
  ensureParser,
  loadGrammar,
} from "pi-tree-sitter/src/grammar";
import type { NotifyFn } from "pi-tree-sitter/src/grammar";
import { Parser } from "web-tree-sitter";

import { loadConfig } from "./config/config-io";
import { createGatedEditTool } from "./gated-edit";
import { createGatedWriteTool } from "./gated-write";
import type { GrammarResult } from "./types";

/**
 * Extension factory: registers exactly one `edit` and one `write` tool.
 * Captures every surface field from the libraries unchanged; only `execute`
 * is swapped for the host's gated implementation.
 */
export default async function extensionFactory(
  pi: ExtensionAPI,
): Promise<void> {
  const cwd = process.cwd();
  const config = loadConfig();

  // Default grammar seam: loads tree-sitter WASM grammars via pts.
  // Lazy — no prefetch; CDN download on first validated call per language.
  const defaultGrammar = async (
    ext: string,
    content: string,
    notify?: NotifyFn,
  ): Promise<GrammarResult> => {
    const entry = LANGUAGE_MAP[ext.toLowerCase()];
    if (!entry) return { available: false, tree: null };

    await ensureParser();
    const language = await loadGrammar(entry, notify);
    if (!language) return { available: false, tree: null };

    const parser = new Parser();
    parser.setLanguage(language);
    const tree = parser.parse(content);
    return { available: true, tree };
  };

  const { surface: editSurface, execute: editExecute } = createGatedEditTool(
    cwd,
    { grammar: defaultGrammar, exclude: config.exclude },
  );

  const { surface: writeSurface, execute: writeExecute } = createGatedWriteTool(
    cwd,
    { grammar: defaultGrammar },
  );

  // Register after both definitions are fully constructed.
  pi.registerTool({
    ...editSurface,
    execute: editExecute,
  });

  pi.registerTool({
    ...writeSurface,
    execute: writeExecute,
  });
}
