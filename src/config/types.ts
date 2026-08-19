import type { AdapterName } from "../adapters/registry";

export interface ExcludeConfig {
  /** String patterns to match against warnings. */
  patterns?: string[];
}

/** Per-port adapter selection. */
export interface PortConfig {
  /** Adapter names to enable for this port. */
  adapters?: AdapterName[];
}

/** pi-tool-ports configuration. */
export interface ToolPortsConfig {
  exclude?: ExcludeConfig;
  ports?: {
    edit?: PortConfig;
    write?: PortConfig;
  };
}

/**
 * Config resolved with defaults applied: every field populated.
 * This is what `loadConfig` returns — no field needs a fallback after.
 */
export type ResolvedConfig = {
  exclude: { patterns: string[] };
  ports: {
    edit: { adapters: AdapterName[] };
    write: { adapters: AdapterName[] };
  };
};

/** Built-in defaults. */
export const DEFAULT_CONFIG: ToolPortsConfig = {
  exclude: {},
  ports: {
    edit: { adapters: ["semantic-edit", "tree-sitter"] },
    write: { adapters: ["semantic-edit", "tree-sitter"] },
  },
};
