export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type GoogleDocConfiguratorValues = {
  docId?: string | null;
}

export interface GoogleDocConfiguratorRpc {
  listDocs(query: string): Promise<ConfiguratorOption[]>;
}
