import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Parser } from "web-tree-sitter";

import { createSemanticEditAdapter } from "./adapters/semantic-edit";
import { createTreeSitterAdapter } from "./adapters/tree-sitter";

import { loadConfig } from "./config/config-io";
import type { ConfigIO } from "./config/config-io";
import { createEditPort } from "./ports/edit";
import { createWritePort } from "./ports/write";
import type { GrammarFn } from "./types";

/**
 * Extension factory: registers the `edit` and `write` tools, capturing
 * every surface field from the libraries unchanged; only `execute` is
 * swapped for the host's gated implementation.
 *
 * Per-port adapter lists (`ports.<port>.adapters`) select behavior:
 * - a port registers only when its resolved list is non-empty; edit
 *   additionally needs its engine `semantic-edit`. Unknown names are
 *   dropped at config resolution, so an explicit `[]` — or a list of
 *   only unknown names — disables the port.
 * - the syntax gate runs only when the list contains `tree-sitter`.
 *   Gate state is per port; the shared tree-sitter adapter is never
 *   modified, so one port's gate state cannot affect the other.
 *
 * @param pi host extension API
 * @param io config source (injected in tests; defaults to the file-based config)
 * @param grammar parse seam (injected in tests with fake trees; defaults to
 *   the real tree-sitter WASM grammars, fetched from CDN with a disk cache)
 */
export default async function extensionFactory(
  pi: ExtensionAPI,
  io?: ConfigIO,
  grammar?: GrammarFn,
): Promise<void> {
  const cwd = process.cwd();
  const config = loadConfig(io);

  const editAdapters = config.ports.edit.adapters;
  const writeAdapters = config.ports.write.adapters;

  const editEnabled = editAdapters.includes("semantic-edit");
  // Resolved lists contain only known adapter names (config resolution
  // drops unknowns), so non-empty means the user enabled the port.
  const writeEnabled = writeAdapters.length > 0;
  const editGateOn = editAdapters.includes("tree-sitter");
  const writeGateOn = writeAdapters.includes("tree-sitter");

  // One shared tree-sitter adapter for both ports' gates.
  const treeSitter = createTreeSitterAdapter();

  // Default grammar seam: loads tree-sitter WASM grammars (CDN with disk
  // cache). Tests inject a fake seam to stay off the network.
  const defaultGrammar: GrammarFn = async (ext, content, notify) => {
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
  const grammarFn = grammar ?? defaultGrammar;

  // Construct every enabled port before any registration, so a
  // construction failure propagates with zero registrations.
  const editPort = editEnabled
    ? createEditPort(cwd, {
        editAdapter: createSemanticEditAdapter(),
        grammar: grammarFn,
        treeSitter,
        gate: editGateOn,
        exclude: config.exclude,
      })
    : null;
  const writePort = writeEnabled
    ? createWritePort(cwd, {
        grammar: grammarFn,
        treeSitter,
        gate: writeGateOn,
      })
    : null;

  if (editPort) {
    pi.registerTool({ ...editPort.surface, execute: editPort.execute } as any);
  }
  if (writePort) {
    pi.registerTool({ ...writePort.surface, execute: writePort.execute });
  }
}
