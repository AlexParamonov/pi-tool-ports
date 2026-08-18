import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createGatedEditTool } from "./gated-edit";
import { createGatedWriteTool } from "./gated-write";

/**
 * Extension factory: registers exactly one `edit` and one `write` tool.
 * Captures every surface field from the libraries unchanged; only `execute`
 * is swapped for the host's gated implementation.
 */
export default async function extensionFactory(
  pi: ExtensionAPI,
): Promise<void> {
  const cwd = process.cwd();

  const { surface: editSurface, execute: editExecute } =
    createGatedEditTool(cwd);

  const { surface: writeSurface, execute: writeExecute } =
    createGatedWriteTool(cwd);

  // Register after both definitions are fully constructed.
  pi.registerTool({
    ...editSurface,
    execute: editExecute,
  } as never);

  pi.registerTool({
    ...writeSurface,
    execute: writeExecute,
  } as never);
}
