/**
 * Semantic edit adapter — wraps pi-semantic-edit for use in ports.
 *
 * Single entry point for the adapter: re-exports the pi-semantic-edit
 * functions and types used by the edit port, and provides the
 * EditAdapter factory injected into the edit port at runtime.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { applyBlocks } from "pi-semantic-edit/src/domain/editor";
import { coherenceCheck } from "pi-semantic-edit/src/domain/coherence";
import {
  fileNotFoundError,
  malformedPatchError,
  missingPathError,
  validationError,
} from "pi-semantic-edit/src/domain/errors";
import { MalformedPatchError } from "pi-semantic-edit/src/domain/parser";
import {
  detectLineEnding,
  normalizeNewlines,
  resolveToCwd,
  restoreLineEndings,
  stripBom,
} from "pi-semantic-edit/src/domain/utils";
import { normalizeEditArgs } from "pi-semantic-edit/src/pi/normalize";
import { createRobustEditTool } from "pi-semantic-edit/src/pi/tool";

import type {
  EditAdapter,
  EditError,
  EditRequest,
  EditRequestLike,
} from "../types";

// Re-export types and functions used by the edit port and the adapter registry
export {
  applyBlocks,
  coherenceCheck,
  fileNotFoundError,
  malformedPatchError,
  missingPathError,
  validationError,
  MalformedPatchError,
  detectLineEnding,
  normalizeNewlines,
  resolveToCwd,
  restoreLineEndings,
  stripBom,
  normalizeEditArgs,
  createRobustEditTool,
};

export type { EditError, EditRequest, EditRequestLike };

/**
 * Create the semantic edit adapter.
 *
 * This adapter wraps pi-semantic-edit functions to implement the EditAdapter interface.
 */
export function createSemanticEditAdapter(): EditAdapter {
  return {
    applyBlocks: (content: string, blocks: EditRequest[], path: string) => {
      return applyBlocks(content, blocks, path);
    },

    coherenceCheck: (content: string): string[] => {
      return coherenceCheck(content);
    },

    detectLineEnding: (content: string): "\n" | "\r\n" => {
      return detectLineEnding(content);
    },

    fileNotFoundError: (path: string): EditError => {
      return fileNotFoundError(path);
    },

    malformedPatchError: (message: string, index?: number): EditError => {
      return malformedPatchError(message, index);
    },

    missingPathError: (): EditError => {
      return missingPathError();
    },

    validationError: (message: string): EditError => {
      return validationError(message);
    },

    normalizeEditArgs: (input: unknown): EditRequestLike[] | null => {
      return normalizeEditArgs(input);
    },

    normalizeNewlines: (text: string): string => {
      return normalizeNewlines(text);
    },

    resolveToCwd: (userPath: string, cwd: string): string => {
      return resolveToCwd(userPath, cwd);
    },

    restoreLineEndings: (text: string, ending: "\n" | "\r\n"): string => {
      return restoreLineEndings(text, ending);
    },

    stripBom: (content: string): { bom: string; text: string } => {
      return stripBom(content);
    },

    createRobustEditTool: (cwd: string, pi: ExtensionAPI) => {
      return createRobustEditTool(cwd, pi);
    },
  };
}
