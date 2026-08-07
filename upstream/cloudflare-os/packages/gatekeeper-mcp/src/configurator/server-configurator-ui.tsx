import {
  CheckboxList, Field, h, RadioCards, Section, type ConfiguratorUISpec,
} from "@gadgets/configurator-ui";
import type {
  McpServerConfiguratorRpc,
  McpServerConfiguratorValues,
} from "./server-configurator-types";

export default {
  initial: { mode: "all", tools: null },

  initialValuesFromResourceUrl({ resourceUrl }) {
    const params = new URLSearchParams(new URL(resourceUrl).hash.slice(1));
    const selected = params.getAll("tool").map(name => name.trim()).filter(Boolean)
      .map(encodeURIComponent);
    return {
      mode: params.has("tool") ? "choose" : "all",
      tools: selected.length > 0 ? selected.join(",") : null,
    };
  },

  isReady({ values }) {
    return values.mode === "all"
      || (values.tools ?? "").split(",").some(name => name.trim().length > 0);
  },

  async resourceUrl({ values, ui }) {
    const endpoint = await ui.getEndpoint();
    if (values.mode === "all") return endpoint;

    const params = new URLSearchParams();
    const selected = (values.tools ?? "").split(",").map(name => name.trim()).filter(Boolean)
      .map(decodeURIComponent);
    for (const tool of selected) params.append("tool", tool);
    if (selected.length === 0) params.append("tool", "");
    return `${endpoint}#${params}`;
  },

  render({ values, setValues, ui }) {
    const mode = values.mode === "choose" ? "choose" : "all";
    const selectedCount = (values.tools ?? "").split(",").filter(Boolean).length;

    return <Section>
      <Field label="Tools" description="Choose how much of this server this connection may call.">
        <RadioCards
          value={mode}
          options={[
            {
              value: "all",
              title: "All tools",
              description: "Every tool this server offers, including ones it adds later.",
            },
            {
              value: "choose",
              title: "Choose tools",
              description:
                "Only the tools you tick. Anything else is refused, including tools added later.",
            },
          ]}
          onChange={next => setValues({ mode: next })}
        />
      </Field>
      <Field
        label="Allowed tools"
        description={mode === "all"
          ? "Read-only tools return data straight away; the rest queue for your approval."
          : selectedCount > 0
            ? `${selectedCount} selected. Read-only tools return data straight away; the rest `
              + "queue for your approval."
            : "Tick at least one tool to grant anything."}>
        <CheckboxList
          name="tools"
          value={values.tools}
          loadOptions={async () => (await ui.listToolOptions())
            .map(option => ({ ...option, value: encodeURIComponent(option.value) }))}
          allSelected={mode === "all"}
          disabled={mode === "all"}
          onChange={tools => setValues({ tools })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<McpServerConfiguratorRpc, McpServerConfiguratorValues>;
