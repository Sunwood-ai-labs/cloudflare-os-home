export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
};

export type ConfluencePageConfiguratorValues = {
  /** The selected page or blog post URL. */
  pageUrl?: string | null;
};

export interface ConfluencePageConfiguratorRpc {
  /** Searches the pages and blog posts this connection can access. `value` is the content URL. */
  listPages(query: string): Promise<ConfiguratorOption[]>;
}
