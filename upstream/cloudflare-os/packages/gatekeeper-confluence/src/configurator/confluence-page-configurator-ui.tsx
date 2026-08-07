import { Autocomplete, Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  ConfluencePageConfiguratorRpc,
  ConfluencePageConfiguratorValues,
} from "./confluence-page-configurator-types";

export default {
  initial: {},

  isReady({ values }) {
    return typeof values.pageUrl === "string" && values.pageUrl.length > 0;
  },

  initialValuesFromResourceUrl({ resourceUrl }) {
    return resourceUrl ? { pageUrl: resourceUrl } : {};
  },

  resourceUrl({ values }) {
    return values.pageUrl ?? "";
  },

  render({ values, setValues, ui }) {
    return <Section>
      <Field
        label="Page or blog post"
        description="Search the pages and blog posts shared with this connection, or paste a Confluence URL."
      >
        <Autocomplete
          name="pageUrl"
          value={values.pageUrl}
          placeholder="Search Confluence..."
          loadOptions={query => ui.listPages(query)}
          onChange={pageUrl => setValues({ pageUrl })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<ConfluencePageConfiguratorRpc, ConfluencePageConfiguratorValues>;
