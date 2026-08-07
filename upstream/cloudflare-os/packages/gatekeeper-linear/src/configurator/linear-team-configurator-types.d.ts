import type { LinearWorkspaceConfiguratorRpc } from "./linear-workspace-configurator-types";

export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type LinearTeamConfiguratorValues = {
  teamKey?: string | null;
}

export interface LinearTeamConfiguratorRpc extends LinearWorkspaceConfiguratorRpc {
  listTeams(query: string): Promise<ConfiguratorOption[]>;
}
