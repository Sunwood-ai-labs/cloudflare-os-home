import { Autocomplete, Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  HomeAssistantEntityConfiguratorRpc,
  HomeAssistantEntityConfiguratorValues,
} from "./resource-configurator-types";

export default {
  initial: {},

  isReady({ values }) {
    return typeof values.entityId === "string" && values.entityId.length > 0;
  },

  resourceUrl({ values, ui }) {
    return ui.resourceUrl(values.entityId);
  },

  render({ values, setValues, ui }) {
    return <Section>
      <Field label="Entity" description="Choose a single Home Assistant entity (light, sensor, switch, etc).">
        <Autocomplete
          name="entityId"
          value={values.entityId}
          placeholder="Search entities..."
          loadOptions={query => ui.listEntities(query)}
          onChange={entityId => setValues({ entityId })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<HomeAssistantEntityConfiguratorRpc, HomeAssistantEntityConfiguratorValues>;
