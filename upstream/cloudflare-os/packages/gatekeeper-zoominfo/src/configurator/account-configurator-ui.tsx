import { Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  ZoomInfoAccountConfiguratorRpc,
  ZoomInfoAccountConfiguratorValues,
} from "./account-configurator-types";

// The whole-account resource has no user-selectable inputs — once an account is connected, the
// resource URL is fully determined. The configurator confirms which account is being connected and
// signals readiness. The sandboxed runtime has no effect hooks, so we render static text and rely
// on `resourceUrl` (via the `ui` capability) to produce the canonical URL.

export default {
  initial: { confirmed: "yes" },

  isReady() {
    return true;
  },

  resourceUrl({ ui }) {
    return ui.resourceUrl();
  },

  render() {
    return <Section>
      <Field
        label="Whole-account access"
        description="This binding grants access to the connected ZoomInfo account: lookup, company/contact/intent/scoop/news search, record enrichment (which consumes credits), recommendations, and account intelligence — all subject to the account's ZoomInfo entitlements.">
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<ZoomInfoAccountConfiguratorRpc, ZoomInfoAccountConfiguratorValues>;
