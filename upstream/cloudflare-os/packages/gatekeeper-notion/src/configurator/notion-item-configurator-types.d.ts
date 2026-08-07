export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type NotionItemConfiguratorValues = {
  /** The selected page/database resource URL. */
  itemUrl?: string | null;
}

export interface NotionItemConfiguratorRpc {
  /** Search the user's accessible pages and databases. `value` is the resource URL. */
  listItems(query: string): Promise<ConfiguratorOption[]>;
}
