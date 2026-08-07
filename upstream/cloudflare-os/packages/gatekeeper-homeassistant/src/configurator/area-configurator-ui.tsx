import { Autocomplete, Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  HomeAssistantAreaConfiguratorRpc,
  HomeAssistantAreaConfiguratorValues,
} from "./resource-configurator-types";

export default {
  initial: {},

  isReady({ values }) {
    return typeof values.areaId === "string" && values.areaId.length > 0;
  },

  resourceUrl({ values, ui }) {
    return ui.resourceUrl(values.areaId);
  },

  render({ values, setValues, ui }) {
    return <Section>
      <Field label="Area" description="Choose a Home Assistant area (room).">
        <Autocomplete
          name="areaId"
          value={values.areaId}
          placeholder="Search areas..."
          loadOptions={query => ui.listAreas(query)}
          onChange={areaId => setValues({ areaId })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<HomeAssistantAreaConfiguratorRpc, HomeAssistantAreaConfiguratorValues>;
