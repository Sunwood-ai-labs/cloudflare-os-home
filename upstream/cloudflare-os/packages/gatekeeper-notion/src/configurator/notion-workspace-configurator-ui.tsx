import { Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  NotionWorkspaceConfiguratorRpc,
  NotionWorkspaceConfiguratorValues,
} from "./notion-workspace-configurator-types";

export default {
  initial: {},

  // Whole-workspace access takes no parameters, so it is always ready to add.
  isReady() {
    return true;
  },

  resourceUrl() {
    return "https://www.notion.so/";
  },

  render() {
    return <Section>
      <Field
        label="Whole workspace"
        description="Grants access to every page and database you have shared with this Notion connection. To limit access, connect a single page or database instead."
      >
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<NotionWorkspaceConfiguratorRpc, NotionWorkspaceConfiguratorValues>;
