import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createRobustEditTool } from "pi-semantic-edit/src/pi/tool";

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
  const stub = {} as unknown as ExtensionAPI;

  const editDef = createRobustEditTool(cwd, stub);
  const { execute: _editExecute, ...editSurface } = editDef;

  const { surface: writeSurface, execute: writeExecute } =
    createGatedWriteTool(cwd);

  // Register after both definitions are fully constructed.
  pi.registerTool({
    ...editSurface,
    execute: async () => {
      throw new Error("stub: gated edit not yet implemented");
    },
  } as never);

  pi.registerTool({
    ...writeSurface,
    execute: writeExecute,
  } as never);
}
