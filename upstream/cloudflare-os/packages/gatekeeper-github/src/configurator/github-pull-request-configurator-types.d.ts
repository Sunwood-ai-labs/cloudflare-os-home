export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type GitHubPullRequestConfiguratorValues = {
  repoFullName?: string | null;
  pullNumber?: string | null;
}

export interface GitHubPullRequestConfiguratorRpc {
  listRepos(query: string): Promise<ConfiguratorOption[]>;
  listPullRequests(repoFullName: string | null | undefined, query: string): Promise<ConfiguratorOption[]>;
}
