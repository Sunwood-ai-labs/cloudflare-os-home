export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type GoogleSheetsConfiguratorValues = {
  spreadsheetId?: string | null;
}

export interface GoogleSheetsConfiguratorRpc {
  listSpreadsheets(query: string): Promise<ConfiguratorOption[]>;
}
