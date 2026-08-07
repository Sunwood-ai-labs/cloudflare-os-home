import { Autocomplete, Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  ConfluenceSpaceConfiguratorRpc,
  ConfluenceSpaceConfiguratorValues,
} from "./confluence-space-configurator-types";

export default {
  initial: {},

  isReady({ values }) {
    return typeof values.spaceUrl === "string" && values.spaceUrl.length > 0;
  },

  initialValuesFromResourceUrl({ resourceUrl }) {
    return resourceUrl ? { spaceUrl: resourceUrl } : {};
  },

  resourceUrl({ values }) {
    return values.spaceUrl ?? "";
  },

  render({ values, setValues, ui }) {
    return <Section>
      <Field label="Space" description="Search the spaces shared with this connection.">
        <Autocomplete
          name="spaceUrl"
          value={values.spaceUrl}
          placeholder="Search spaces..."
          loadOptions={query => ui.listSpaces(query)}
          onChange={spaceUrl => setValues({ spaceUrl })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<ConfluenceSpaceConfiguratorRpc, ConfluenceSpaceConfiguratorValues>;
