import { Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  SpotifyAccountConfiguratorRpc,
  SpotifyAccountConfiguratorValues,
} from "./account-configurator-types";

// The whole-account resource has no user-selectable inputs — once an account is connected, the
// resource URL is fully determined. The configurator confirms which account is being connected
// and signals readiness. The sandboxed runtime has no effect hooks, so we render static text and
// rely on `resourceUrl` (via the `ui` capability) to produce the canonical URL.

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
        description="This binding grants access to the connected Spotify account: profile, catalog search, your library, your playlists, and playback control on your Spotify Connect devices.">
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<SpotifyAccountConfiguratorRpc, SpotifyAccountConfiguratorValues>;
