/**
 * Adapter interfaces — define what ports need from adapters.
 *
 * Ports depend on these interfaces, not concrete implementations.
 * Adapters implement these interfaces and are injected at runtime.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { LexRules } from "pi-tree-sitter/src/delimiter";
import type { NotifyFn } from "pi-tree-sitter/src/grammar";

// Import actual types from libraries for compatibility
import type { EditError as PseEditError } from "pi-semantic-edit/src/domain/types";
import type { EditRequestLike as PseEditRequestLike } from "pi-semantic-edit/src/pi/normalize";
import type { ApplyBlocksResult as PseApplyBlocksResult } from "pi-semantic-edit/src/domain/editor";

// Re-export library types for adapter interface
export type EditError = PseEditError;
export type EditRequestLike = PseEditRequestLike;
export type ApplyBlocksResult = PseApplyBlocksResult;

// ── Tree-Sitter Adapter ──────────────────────────────────────────────

/** Tree-sitter adapter interface — functions the gate needs. */
export interface TreeSitterAdapter {
  BALANCE_RULES: Record<string, LexRules>;
  LANGUAGE_MAP: Record<string, unknown>;
  ensureParser: () => Promise<void>;
  loadGrammar: (entry: unknown, notify?: NotifyFn) => Promise<unknown>;
  checkDelimiterBalance: (
    path: string,
    content: string,
    rules: LexRules,
  ) => string | null;
  collectErrors: (tree: unknown, source: string) => string[];
  MAX_ERRORS: number;
}

/** Request for a single edit operation. */
export interface EditRequest {
  path: string;
  oldText: string;
  newText: string;
  replaceAll?: boolean;
}

/** Error thrown for malformed patches. */
export class MalformedPatchError extends Error {
  index?: number;
  constructor(message: string, index?: number) {
    super(message);
    this.name = "MalformedPatchError";
    this.index = index;
  }
}

/** Functions the edit port needs from the semantic-edit adapter. */
export interface EditAdapter {
  /** Apply edit blocks to content. */
  applyBlocks: (
    content: string,
    blocks: EditRequest[],
    path: string,
  ) => ApplyBlocksResult;

  /** Check for coherence issues in content. */
  coherenceCheck: (content: string) => string[];

  /** Detect line ending style. */
  detectLineEnding: (content: string) => "\n" | "\r\n";

  /** Create file-not-found error. */
  fileNotFoundError: (path: string) => EditError;

  /** Create malformed patch error. */
  malformedPatchError: (message: string, index?: number) => EditError;

  /** Create missing path error. */
  missingPathError: () => EditError;

  /** Create validation error. */
  validationError: (message: string) => EditError;

  /** Normalize edit arguments from input. */
  normalizeEditArgs: (input: unknown) => EditRequestLike[] | null;

  /** Normalize newlines to Unix style. */
  normalizeNewlines: (text: string) => string;

  /** Resolve a user path to an absolute path relative to cwd. */
  resolveToCwd: (userPath: string, cwd: string) => string;

  /** Restore line endings after normalization. */
  restoreLineEndings: (text: string, ending: "\n" | "\r\n") => string;

  /** Strip BOM from content. */
  stripBom: (content: string) => { bom: string; text: string };

  /** Create the base edit tool (captures surface fields). */
  createRobustEditTool: (
    cwd: string,
    pi: ExtensionAPI,
  ) => Record<string, unknown>;
}

// ── Adapter Options ──────────────────────────────────────────────────

/** Options for creating ports with injected adapters. */
export interface PortAdapterOptions {
  /** Semantic edit adapter. */
  editAdapter?: EditAdapter;

  /** Tree-sitter adapter. */
  treeSitter?: TreeSitterAdapter;
}
