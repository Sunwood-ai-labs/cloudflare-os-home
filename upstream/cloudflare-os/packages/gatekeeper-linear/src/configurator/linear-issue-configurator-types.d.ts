import type { LinearWorkspaceConfiguratorRpc } from "./linear-workspace-configurator-types";

export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type LinearIssueConfiguratorValues = {
  issueIdentifier?: string | null;
}

export interface LinearIssueConfiguratorRpc extends LinearWorkspaceConfiguratorRpc {
  listIssues(query: string): Promise<ConfiguratorOption[]>;
}
