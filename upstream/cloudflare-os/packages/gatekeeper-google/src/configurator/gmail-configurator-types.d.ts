export type GmailConfiguratorValues = {
  mode?: "all" | "search" | "label" | null;
  query?: string | null;
  label?: string | null;
}

export interface GmailConfiguratorRpc {}
