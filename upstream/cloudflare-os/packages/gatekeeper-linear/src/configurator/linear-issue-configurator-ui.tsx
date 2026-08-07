import { Autocomplete, Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  LinearIssueConfiguratorRpc,
  LinearIssueConfiguratorValues,
} from "./linear-issue-configurator-types";

export default {
  initial: {},

  isReady({ values }) {
    return typeof values.issueIdentifier === "string" && values.issueIdentifier.length > 0;
  },

  initialValuesFromResourceUrl({ resourceUrl }) {
    const segments = new URL(resourceUrl).pathname.split("/").filter(Boolean);
    const issueIndex = segments.indexOf("issue");
    const issueIdentifier = issueIndex >= 0 ? segments[issueIndex + 1] : undefined;
    return issueIdentifier ? { issueIdentifier } : {};
  },

  async resourceUrl({ values, ui }) {
    const workspaceUrlKey = await ui.getWorkspaceUrlKey();
    return `https://linear.app/${workspaceUrlKey}/issue/${values.issueIdentifier}`;
  },

  render({ values, setValues, ui }) {
    return <Section>
      <Field label="Issue" description="Search issues, or type an identifier like ENG-123.">
        <Autocomplete
          name="issueIdentifier"
          value={values.issueIdentifier}
          placeholder="Search issues..."
          loadOptions={query => ui.listIssues(query)}
          onChange={issueIdentifier => setValues({ issueIdentifier })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<LinearIssueConfiguratorRpc, LinearIssueConfiguratorValues>;
