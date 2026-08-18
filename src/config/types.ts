/** pi-tool-ports configuration. */
export interface ToolPortsConfig {
  exclude?: {
    /** String patterns to match against warnings. */
    patterns?: string[];
  };
}

/** Built-in defaults. */
export const DEFAULT_CONFIG: ToolPortsConfig = {
  exclude: {},
};
