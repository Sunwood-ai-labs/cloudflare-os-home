import { Autocomplete, Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  GoogleSheetsConfiguratorRpc, GoogleSheetsConfiguratorValues,
} from "./google-sheets-configurator-types";

export default {
  initial: {},

  isReady({ values }) {
    return typeof values.spreadsheetId === "string" && values.spreadsheetId.length > 0;
  },

  resourceUrl({ values }) {
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(values.spreadsheetId ?? "")}/edit`;
  },

  render({ values, setValues, ui }) {
    return <Section>
      <Field label="Spreadsheet" description="Search recent spreadsheets from Drive.">
        <Autocomplete
          name="spreadsheetId"
          value={values.spreadsheetId}
          placeholder="Search recent spreadsheets..."
          loadOptions={query => ui.listSpreadsheets(query)}
          onChange={spreadsheetId => setValues({ spreadsheetId })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<GoogleSheetsConfiguratorRpc, GoogleSheetsConfiguratorValues>;
