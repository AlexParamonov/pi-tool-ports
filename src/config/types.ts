export interface ExcludeConfig {
  /** String patterns to match against warnings. */
  patterns?: string[];
}

/** pi-tool-ports configuration. */
export interface ToolPortsConfig {
  exclude?: ExcludeConfig;
}

/** Built-in defaults. */
export const DEFAULT_CONFIG: ToolPortsConfig = {
  exclude: {},
};
