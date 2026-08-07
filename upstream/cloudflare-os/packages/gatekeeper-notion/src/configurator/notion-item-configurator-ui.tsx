import { Autocomplete, Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  NotionItemConfiguratorRpc,
  NotionItemConfiguratorValues,
} from "./notion-item-configurator-types";

export default {
  initial: {},

  isReady({ values }) {
    return typeof values.itemUrl === "string" && values.itemUrl.length > 0;
  },

  initialValuesFromResourceUrl({ resourceUrl }) {
    return resourceUrl ? { itemUrl: resourceUrl } : {};
  },

  resourceUrl({ values }) {
    return values.itemUrl ?? "";
  },

  render({ values, setValues, ui }) {
    return <Section>
      <Field
        label="Page or database"
        description="Search the Notion pages and databases shared with this connection, or paste a Notion URL."
      >
        <Autocomplete
          name="itemUrl"
          value={values.itemUrl}
          placeholder="Search Notion..."
          loadOptions={query => ui.listItems(query)}
          onChange={itemUrl => setValues({ itemUrl })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<NotionItemConfiguratorRpc, NotionItemConfiguratorValues>;
