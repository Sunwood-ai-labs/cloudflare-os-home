import { Autocomplete, Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  HomeAssistantDeviceConfiguratorRpc,
  HomeAssistantDeviceConfiguratorValues,
} from "./resource-configurator-types";

export default {
  initial: {},

  isReady({ values }) {
    return typeof values.deviceId === "string" && values.deviceId.length > 0;
  },

  resourceUrl({ values, ui }) {
    return ui.resourceUrl(values.deviceId);
  },

  render({ values, setValues, ui }) {
    return <Section>
      <Field label="Device" description="Choose a physical device. The binding grants access to all entities the device provides.">
        <Autocomplete
          name="deviceId"
          value={values.deviceId}
          placeholder="Search devices..."
          loadOptions={query => ui.listDevices(query)}
          onChange={deviceId => setValues({ deviceId })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<HomeAssistantDeviceConfiguratorRpc, HomeAssistantDeviceConfiguratorValues>;
