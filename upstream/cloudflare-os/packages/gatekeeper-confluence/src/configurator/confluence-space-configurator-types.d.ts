export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
};

export type ConfluenceSpaceConfiguratorValues = {
  /** The selected space's URL. */
  spaceUrl?: string | null;
};

export interface ConfluenceSpaceConfiguratorRpc {
  /** Searches the spaces this connection can access. `value` is the space URL. */
  listSpaces(query: string): Promise<ConfiguratorOption[]>;
}
