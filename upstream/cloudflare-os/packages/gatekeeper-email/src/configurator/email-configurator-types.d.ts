export type EmailMailboxConfiguratorValues = {
  emailName?: string | null;
}

export interface EmailMailboxConfiguratorRpc {
  resourceUrl(emailName: string | null | undefined): Promise<string>;
}
