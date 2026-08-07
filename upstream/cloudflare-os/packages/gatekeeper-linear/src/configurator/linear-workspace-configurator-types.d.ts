export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type LinearWorkspaceConfiguratorValues = {
  workspaceUrlKey?: string | null;
}

export interface LinearWorkspaceConfiguratorRpc {
  getWorkspaceUrlKey(): Promise<string>;
  listWorkspaces(): Promise<ConfiguratorOption[]>;
}
