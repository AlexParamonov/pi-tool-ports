import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Parser } from "web-tree-sitter";

import { createSemanticEditAdapter } from "./adapters/semantic-edit-adapter";
import { createTreeSitterAdapter } from "./adapters/tree-sitter";
import type { NotifyFn } from "./adapters/tree-sitter";

import { loadConfig } from "./config/config-io";
import { createEditPort } from "./ports/edit";
import { createWritePort } from "./ports/write";
import type { GrammarResult, TreeSitterAdapter } from "./types";

/**
 * Extension factory: registers exactly one `edit` and one `write` tool.
 * Captures every surface field from the libraries unchanged; only `execute`
 * is swapped for the host's gated implementation.
 *
 * Adapters are loaded dynamically based on configuration, so only enabled
 * adapters are imported at runtime.
 */
export default async function extensionFactory(
  pi: ExtensionAPI,
): Promise<void> {
  const cwd = process.cwd();
  const config = loadConfig();

  // Dynamically load adapters based on config.
  const editAdapters = config.ports?.edit?.adapters ?? [
    "semantic-edit",
    "tree-sitter",
  ];

  // Create adapters
  const editAdapter = createSemanticEditAdapter();
  const treeSitter = createTreeSitterAdapter();

  // Default grammar seam: loads tree-sitter WASM grammars.
  const defaultGrammar = async (
    ext: string,
    content: string,
    notify?: NotifyFn,
  ): Promise<GrammarResult> => {
    if (!treeSitter) return { available: false, tree: null };

    const entry = treeSitter.LANGUAGE_MAP[ext.toLowerCase()];
    if (!entry) return { available: false, tree: null };

    await treeSitter.ensureParser();
    const language = await treeSitter.loadGrammar(entry, notify);
    if (!language) return { available: false, tree: null };

    const parser = new Parser();
    parser.setLanguage(language as any);
    const tree = parser.parse(content);
    return { available: true, tree };
  };

  const editPort = createEditPort(cwd, {
    editAdapter,
    grammar: defaultGrammar,
    treeSitter,
    exclude: config.exclude,
  });
  const writePort = createWritePort(cwd, {
    grammar: defaultGrammar,
    treeSitter,
  });

  // Register ports.
  pi.registerTool({ ...editPort.surface, execute: editPort.execute } as any);
  pi.registerTool({ ...writePort.surface, execute: writePort.execute });
}
