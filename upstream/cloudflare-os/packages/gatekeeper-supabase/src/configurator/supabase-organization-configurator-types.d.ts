export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type SupabaseOrganizationConfiguratorValues = {
  /** The selected organization slug. Matches the `:slug` group of the resource URL pattern. */
  slug?: string | null;
}

export interface SupabaseOrganizationConfiguratorRpc {
  /** Searches the connected account's organizations. Returns options whose `value` is a slug. */
  listOrganizations(query: string): Promise<ConfiguratorOption[]>;
}
