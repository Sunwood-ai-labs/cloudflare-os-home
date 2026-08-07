export type NotionWorkspaceConfiguratorValues = {
  /** Unused; whole-workspace access has no parameters. */
  scope?: string | null;
}

export interface NotionWorkspaceConfiguratorRpc {
  /** Returns the connected workspace's name, for display. */
  getWorkspaceName(): Promise<string | null>;
}
