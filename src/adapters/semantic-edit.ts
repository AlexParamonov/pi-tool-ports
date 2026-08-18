/**
 * Semantic edit adapter — wraps pi-semantic-edit for use in ports.
 *
 * This adapter encapsulates the deep imports from pi-semantic-edit,
 * providing a clean interface for the edit port.
 */
import { applyBlocks } from "pi-semantic-edit/src/domain/editor";
import { coherenceCheck } from "pi-semantic-edit/src/domain/coherence";
import {
  fileNotFoundError,
  malformedPatchError,
  missingPathError,
  validationError,
} from "pi-semantic-edit/src/domain/errors";
import { MalformedPatchError } from "pi-semantic-edit/src/domain/parser";
import type { EditError, EditRequest } from "pi-semantic-edit/src/domain/types";
import {
  detectLineEnding,
  normalizeNewlines,
  resolveToCwd,
  restoreLineEndings,
  stripBom,
} from "pi-semantic-edit/src/domain/utils";
import { normalizeEditArgs } from "pi-semantic-edit/src/pi/normalize";
import type { EditRequestLike } from "pi-semantic-edit/src/pi/normalize";
import { createRobustEditTool } from "pi-semantic-edit/src/pi/tool";

// Re-export types and functions used by the edit port
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
