import { Autocomplete, Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type { GoogleDocConfiguratorRpc, GoogleDocConfiguratorValues } from "./google-doc-configurator-types";

export default {
  initial: {},

  isReady({ values }) {
    return typeof values.docId === "string" && values.docId.length > 0;
  },

  resourceUrl({ values }) {
    return `https://docs.google.com/document/d/${encodeURIComponent(values.docId ?? "")}/edit`;
  },

  render({ values, setValues, ui }) {
    return <Section>
      <Field label="Document" description="Search recent documents from Drive.">
        <Autocomplete
          name="docId"
          value={values.docId}
          placeholder="Search recent docs..."
          loadOptions={query => ui.listDocs(query)}
          onChange={docId => setValues({ docId })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<GoogleDocConfiguratorRpc, GoogleDocConfiguratorValues>;
