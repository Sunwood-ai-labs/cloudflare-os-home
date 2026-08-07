export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type GitHubRepoConfiguratorValues = {
  repoFullName?: string | null;
}

export interface GitHubRepoConfiguratorRpc {
  listRepos(query: string): Promise<ConfiguratorOption[]>;
}
