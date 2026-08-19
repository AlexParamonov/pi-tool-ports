import type { AdapterName } from "../adapters/registry";

export interface ExcludeConfig {
  /** String patterns to match against warnings. */
  patterns?: string[];
}

/** Per-port adapter selection. */
export interface PortConfig {
  /**
   * Adapter names to enable for this port, as written in the config file.
   * The file format is JSON, so unknown names are legal here; they are
   * dropped at resolution.
   */
  adapters?: string[];
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
 * Config resolved with defaults applied: every field populated, every
 * adapter name known. This is what `loadConfig` returns — no field needs
 * a fallback after.
 */
export interface ResolvedConfig {
  exclude: { patterns: string[] };
  ports: {
    edit: { adapters: AdapterName[] };
    write: { adapters: AdapterName[] };
  };
}

/** Built-in default: every known adapter enabled for every port. */
export const DEFAULT_ADAPTERS = ["semantic-edit", "tree-sitter"] as const;

/** Built-in defaults, resolved. */
export const DEFAULT_CONFIG: ResolvedConfig = {
  exclude: { patterns: [] },
  ports: {
    edit: { adapters: [...DEFAULT_ADAPTERS] },
    write: { adapters: [...DEFAULT_ADAPTERS] },
  },
};
