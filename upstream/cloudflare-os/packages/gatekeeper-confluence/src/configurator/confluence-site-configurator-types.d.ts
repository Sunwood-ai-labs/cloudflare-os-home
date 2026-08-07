export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
};

export type ConfluenceSiteConfiguratorValues = {
  /** The selected site's wiki URL. */
  siteUrl?: string | null;
};

export interface ConfluenceSiteConfiguratorRpc {
  /** Lists the Confluence sites this connection can access. `value` is the site wiki URL. */
  listSites(query: string): Promise<ConfiguratorOption[]>;
}
