import { RpcTarget } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";
import { NotionApi, itemResponseToSummary } from "./notion-api";
import type {
  ConfiguratorOption,
  NotionItemConfiguratorRpc,
} from "./configurator/notion-item-configurator-types";
import type { NotionWorkspaceConfiguratorRpc } from "./configurator/notion-workspace-configurator-types";

const OPTION_LIMIT = 50;

// Token getters are held off-instance so they aren't exposed as RPC-accessible properties.
const tokenGetters = new WeakMap<object, () => Promise<string>>();

function notionApi(target: object): NotionApi {
  const getToken = tokenGetters.get(target);
  if (!getToken) throw new Error("Notion configurator is not initialized.");
  return new NotionApi(getToken);
}

// Capability exposed to the page/database configurator iframe.
@validateRpc()
export class NotionItemConfiguratorUI extends RpcTarget implements NotionItemConfiguratorRpc {
  constructor(getToken: () => Promise<string>) {
    super();
    tokenGetters.set(this, getToken);
  }

  async listItems(query: string): Promise<ConfiguratorOption[]> {
    const trimmed = query.trim();
    const result = await notionApi(this).search({
      query: trimmed || undefined,
      page_size: OPTION_LIMIT,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    });
    return result.results.map(item => {
      const summary = itemResponseToSummary(item);
      const option: ConfiguratorOption = {
        value: summary.url,
        title: summary.title || "Untitled",
        subtitle: summary.kind === "database" ? "Database" : "Page",
      };
      if (summary.icon) option.meta = summary.icon;
      return option;
    });
  }
}

// Capability exposed to the whole-workspace configurator iframe.
@validateRpc()
export class NotionWorkspaceConfiguratorUI extends RpcTarget implements NotionWorkspaceConfiguratorRpc {
  constructor(getToken: () => Promise<string>) {
    super();
    tokenGetters.set(this, getToken);
  }

  async getWorkspaceName(): Promise<string | null> {
    try {
      const bot = await notionApi(this).getBotUser();
      return bot.workspaceName ?? null;
    } catch {
      return null;
    }
  }
}
