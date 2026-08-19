/**
 * Edit port — fuzzy matching via pi-semantic-edit with syntax validation gate.
 *
 * Tool surface captured from createRobustEditTool; only execute is swapped.
 */
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access as fsAccess,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  generateDiffString,
  generateUnifiedPatch,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type {
  EditAdapter,
  EditError,
  EditRequest,
  EditRequestLike,
} from "../adapters/types";

import { runSyntaxGate } from "../gates/syntax";
import type { GatedToolOptions } from "../types";

// --- Throw an Error carrying a structured EditError (for renderers/debugging) ---
function toolError(error: EditError): Error {
  return Object.assign(new Error(error.message), { editError: error });
}

function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return `${(err as { code?: unknown }).code}`;
  }
  return String(err);
}

interface FileGroup {
  path: string;
  blocks: EditRequestLike[];
}

// --- Group requests by path, preserving first-seen order ---
function groupByPath(blocks: EditRequestLike[]): FileGroup[] {
  const groups: FileGroup[] = [];
  const index = new Map<string, number>();
  for (const block of blocks) {
    const existing = index.get(block.path);
    if (existing !== undefined) {
      groups[existing].blocks.push(block);
    } else {
      index.set(block.path, groups.length);
      groups.push({ path: block.path, blocks: [block] });
    }
  }
  return groups;
}

/**
 * Create the edit port. Captures every surface field from pse's
 * createRobustEditTool unchanged; only execute is swapped for the gated
 * implementation.
 */
export function createEditPort(
  cwd: string,
  opts: GatedToolOptions & { editAdapter: EditAdapter },
) {
  const { editAdapter, grammar, treeSitter, exclude, gate } = opts;
  const gateOn = gate !== false;
  const stub = {} as unknown as ExtensionAPI;
  const base = editAdapter.createRobustEditTool(cwd, stub);
  const { execute: _baseExecute, ...surface } = base as Record<string, unknown>;
  const excludePatterns = exclude?.patterns ?? [];

  const execute = async (
    _toolCallId: string,
    input: unknown,
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    ctx: { cwd?: string } | undefined,
  ) => {
    const throwIfAborted = () => {
      if (signal?.aborted) throw new Error("Operation aborted");
    };

    // Session cwd, not the extension-load cwd
    const baseCwd = ctx?.cwd ?? cwd;

    let blocks: EditRequestLike[] | null;
    try {
      blocks = editAdapter.normalizeEditArgs(input);
    } catch (err) {
      if (err instanceof Error && err.name === "MalformedPatchError") {
        throw toolError(
          editAdapter.malformedPatchError(err.message, (err as any).index),
        );
      }
      throw toolError(err as EditError);
    }
    if (!blocks || blocks.length === 0) {
      throw toolError(
        editAdapter.validationError(
          "No edits found. Provide path and edits[] with oldText/newText pairs.",
        ),
      );
    }
    if (blocks.some((b) => !b.path)) {
      throw toolError(editAdapter.missingPathError());
    }

    const summaries: string[] = [];
    const matchPasses: string[] = [];
    let primaryDiff = "";
    let primaryPatch = "";
    let primaryFirstChangedLine = 0;

    for (const group of groupByPath(blocks)) {
      const absolutePath = editAdapter.resolveToCwd(group.path, baseCwd);
      throwIfAborted();

      const fileResult = await withFileMutationQueue(absolutePath, async () => {
        throwIfAborted();

        // Read file
        try {
          await fsAccess(absolutePath, constants.R_OK | constants.W_OK);
        } catch (err) {
          throw toolError(
            editAdapter.fileNotFoundError(`${group.path} (${errorCode(err)})`),
          );
        }

        throwIfAborted();
        let buffer: Buffer;
        try {
          buffer = await readFile(absolutePath);
        } catch (err) {
          throw toolError(
            editAdapter.validationError(
              `Could not read ${group.path} (${errorCode(err)}) — the file may have changed or been removed. Re-read the file and retry the edit.`,
            ),
          );
        }

        const rawContent = buffer.toString("utf-8");
        const { bom, text } = editAdapter.stripBom(rawContent);
        const ending = editAdapter.detectLineEnding(text);
        const content = editAdapter.normalizeNewlines(text);

        // Apply edits (pse's fuzzy chain; no-match/ambiguous → pse errors)
        const result = editAdapter.applyBlocks(
          content,
          group.blocks as EditRequest[],
          group.path,
        );
        if (!result.ok || result.content === undefined) {
          throw toolError(result.error! as EditError);
        }

        // Write-form bytes: BOM prepended, line endings restored
        const finalContent =
          bom + editAdapter.restoreLineEndings(result.content, ending);

        // GATE: validate write-form bytes before any write
        if (gateOn) {
          await runSyntaxGate(group.path, finalContent, grammar, treeSitter);
        }

        // Coherence warnings (non-blocking)
        const warnings = editAdapter
          .coherenceCheck(result.content)
          .filter((w) => !excludePatterns.some((p) => w.includes(p)));

        // Atomic write: temp file + rename
        const tmpPath = resolve(dirname(absolutePath), `.${randomUUID()}.tmp`);
        await writeFile(tmpPath, finalContent, "utf-8");
        await rename(tmpPath, absolutePath);

        const diffResult = generateDiffString(content, result.content);
        return {
          appliedCount: group.blocks.length,
          replacements: result.replacements,
          matchPasses: result.matchPasses,
          diff: diffResult.diff ?? "",
          firstChangedLine: diffResult.firstChangedLine ?? 0,
          patch: generateUnifiedPatch(group.path, content, result.content),
          warnings,
        };
      });

      const replacementWord =
        fileResult.replacements === 1 ? "replacement" : "replacements";
      summaries.push(
        `Successfully replaced ${fileResult.replacements} ${replacementWord} across ` +
          `${fileResult.appliedCount} edit(s) in ${group.path}.`,
      );
      if (fileResult.warnings.length > 0) {
        summaries.push("Coherence warnings:");
        for (const w of fileResult.warnings) summaries.push(`  - ${w}`);
      }
      matchPasses.push(...fileResult.matchPasses);
      if (!primaryDiff) {
        primaryDiff = fileResult.diff;
        primaryPatch = fileResult.patch;
        primaryFirstChangedLine = fileResult.firstChangedLine;
      }
    }

    const text = [summaries.join("\n")];
    const nonSimple = matchPasses.filter((p) => p !== "simple");
    if (nonSimple.length > 0) {
      text.push(`Match passes: ${nonSimple.join(", ")}`);
    }

    return {
      content: [{ type: "text" as const, text: text.join("\n") }],
      details: {
        diff: primaryDiff,
        patch: primaryPatch,
        firstChangedLine: primaryFirstChangedLine,
        matchPasses,
      },
    };
  };

  return { surface, execute };
}
