/**
 * Tree-sitter adapter internals — accesses non-exported symbols from pi-tree-sitter.
 *
 * This file contains the "hack" to access functions that pi-tree-sitter doesn't export.
 * When pi-tree-sitter updates, only this file needs to change.
 *
 * Strategy: Read source at runtime, strip TypeScript annotations, evaluate with dependencies.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Type declarations for symbols we expose
export type LineAtFn = (source: string, offset: number) => string;
export type FormatErrorFn = (node: unknown, source: string) => string;
export type CollectErrorsFn = (tree: unknown, source: string) => string[];

// Read vendored pi-tree-sitter source
const vendorPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "vendor/index.ts",
);
const source = readFileSync(vendorPath, "utf-8");

// Strip TypeScript annotations (signature and body separately)
function stripTypes(code: string): string {
  const sigEnd = code.indexOf("{");
  if (sigEnd === -1) return code;
  const sig = code.substring(0, sigEnd);
  const body = code.substring(sigEnd);
  // Strip types from function signature
  const cleanSig = sig
    .replace(/\w+\s*:\s*[\w<>\[\]|]+/g, (m) =>
      m.replace(/\s*:\s*[\w<>\[\]|]+/, ""),
    )
    .replace(/\):\s*[\w<>\[\]|]+/, ")");
  // Strip types and non-null assertions from body
  const cleanBody = body
    .replace(/(const|let|var)\s+\w+\s*:\s*[\w<>\[\]|]+/g, (m) =>
      m.replace(/\s*:\s*[\w<>\[\]|]+/, ""),
    )
    .replace(/\):\s*[\w<>\[\]|]+(?=\s*[;,])/g, ")")
    .replace(/\)!/g, ")")
    .replace(/(\w)!\s*([;,)])/g, "$1$2")
    .replace(/(\w)!\./g, "$1.");
  return cleanSig + cleanBody;
}

// Extract function source code by name
function extractFunctionSource(name: string): string | null {
  const startIdx = source.indexOf("function " + name + "(");
  if (startIdx === -1) return null;
  let depth = 0;
  let foundBrace = false;
  let endIdx = startIdx;
  for (let i = startIdx; i < source.length; i++) {
    if (source[i] === "{") {
      depth++;
      foundBrace = true;
    }
    if (source[i] === "}") depth--;
    if (foundBrace && depth === 0) {
      endIdx = i + 1;
      break;
    }
  }
  return source.substring(startIdx, endIdx);
}

// Extract, strip types, and evaluate with dependencies
function extractAndEval<T>(name: string, deps: Record<string, unknown>): T {
  const raw = extractFunctionSource(name);
  if (!raw) throw new Error(`Could not extract ${name} from pi-tree-sitter`);
  const clean = stripTypes(raw);
  const depNames = Object.keys(deps);
  const depValues = Object.values(deps);
  const factory = new Function(...depNames, "return " + clean);
  return factory(...depValues) as T;
}

// Constants — hardcoded (stable, simple values)
export const MAX_ERRORS = 10;
export const CLOSER_LABELS: Record<string, string> = {
  ")": "parenthesis",
  "]": "bracket",
  "}": "brace",
};

// Functions — extracted from pi-tree-sitter at runtime
export const lineAt: LineAtFn = extractAndEval<LineAtFn>("lineAt", {});
export const formatError: FormatErrorFn = extractAndEval<FormatErrorFn>(
  "formatError",
  { CLOSER_LABELS },
);
export const collectErrors: CollectErrorsFn = extractAndEval<CollectErrorsFn>(
  "collectErrors",
  { CLOSER_LABELS, MAX_ERRORS, lineAt, formatError },
);
