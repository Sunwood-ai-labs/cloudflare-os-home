export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type SupabaseProjectConfiguratorValues = {
  /** The selected project ref. Matches the `:ref` group of the resource URL pattern. */
  ref?: string | null;
}

export interface SupabaseProjectConfiguratorRpc {
  /** Searches the connected account's projects. Returns options whose `value` is a project ref. */
  listProjects(query: string): Promise<ConfiguratorOption[]>;
}
