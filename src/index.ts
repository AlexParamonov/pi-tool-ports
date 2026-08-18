import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Parser } from "web-tree-sitter";

import { loadAdapter } from "./adapters/registry";
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
  const writeAdapters = config.ports?.write?.adapters ?? [
    "semantic-edit",
    "tree-sitter",
  ];

  // Load tree-sitter adapter (needed for grammar seam and gate)
  let treeSitter: TreeSitterAdapter | undefined;
  if (
    editAdapters.includes("tree-sitter") ||
    writeAdapters.includes("tree-sitter")
  ) {
    treeSitter = (await loadAdapter(
      "tree-sitter",
    )) as unknown as TreeSitterAdapter;
  }

  // Default grammar seam: loads tree-sitter WASM grammars.
  // Uses the tree-sitter adapter's functions via dynamic import.
  const defaultGrammar = async (
    ext: string,
    content: string,
    notify?: NotifyFn,
  ): Promise<GrammarResult> => {
    if (!treeSitter) return { available: false, tree: null };

    const entry = treeSitter.LANGUAGE_MAP[ext.toLowerCase()];
    if (!entry) return { available: false, tree: null };

    const tsAdapter = (await loadAdapter("tree-sitter")) as {
      ensureParser: () => Promise<void>;
      loadGrammar: (entry: unknown, notify?: NotifyFn) => Promise<unknown>;
    };

    await tsAdapter.ensureParser();
    const language = await tsAdapter.loadGrammar(entry, notify);
    if (!language) return { available: false, tree: null };

    const parser = new Parser();
    parser.setLanguage(language as any);
    const tree = parser.parse(content);
    return { available: true, tree };
  };

  const editPort = createEditPort(cwd, {
    grammar: defaultGrammar,
    treeSitter,
    exclude: config.exclude,
  });
  const writePort = createWritePort(cwd, {
    grammar: defaultGrammar,
    treeSitter,
  });

  // Register ports.
  pi.registerTool({ ...editPort.surface, execute: editPort.execute });
  pi.registerTool({ ...writePort.surface, execute: writePort.execute });
}
