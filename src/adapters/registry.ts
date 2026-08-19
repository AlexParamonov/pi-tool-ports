/**
 * Adapter registry — maps adapter names to dynamic import loaders.
 *
 * Each adapter wraps vendored dependency code. Dynamic import ensures only
 * enabled adapters are loaded at runtime, keeping the dependency tree clean
 * and respecting vendored code licenses.
 */

export type AdapterName = "semantic-edit" | "tree-sitter";

/** Available adapter names. */
const ADAPTERS: Record<AdapterName, () => Promise<Record<string, unknown>>> = {
  "semantic-edit": () =>
    import("./semantic-edit.js") as Promise<Record<string, unknown>>,
  "tree-sitter": () =>
    import("./tree-sitter.js") as Promise<Record<string, unknown>>,
};

/**
 * Load an adapter by name. Returns the adapter module's runtime exports.
 *
 * @throws {Error} if the adapter name is unknown.
 */
export async function loadAdapter(
  name: AdapterName,
): Promise<Record<string, unknown>> {
  const loader = ADAPTERS[name];
  if (!loader) {
    throw new Error(`Unknown adapter: ${name}`);
  }
  return loader();
}
