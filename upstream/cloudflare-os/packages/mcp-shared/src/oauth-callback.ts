import type { McpLog } from "./log.js";
import {
  errorPageHtml, htmlResponse, INVALID_LINK_HTML, SELF_CLOSING_HTML,
} from "./html.js";

type OAuthCallbackAccount = {
  acceptAuthCode(code: string, nonce: string, issuer?: string): Promise<boolean>;
};

/** Completes the shared browser callback for an MCP account OAuth flow. */
export async function handleOAuthCallback(
  url: URL,
  accountForId: (id: string) => OAuthCallbackAccount,
  log: McpLog,
): Promise<Response> {
  const error = url.searchParams.get("error");
  if (error) {
    const detail = url.searchParams.get("error_description") ?? error;
    return htmlResponse(errorPageHtml(
      "Authorization failed", `${detail} Start the connection again.`), 400);
  }

  const state = url.searchParams.get("state") ?? "";
  const separator = state.indexOf(":");
  const code = url.searchParams.get("code");
  if (separator < 0 || !code) return htmlResponse(INVALID_LINK_HTML, 400);

  let account: OAuthCallbackAccount;
  try {
    account = accountForId(state.slice(0, separator));
  } catch {
    return htmlResponse(INVALID_LINK_HTML, 400);
  }

  try {
    const accepted = await account.acceptAuthCode(
      code, state.slice(separator + 1), url.searchParams.get("iss") ?? undefined);
    if (!accepted) return htmlResponse(INVALID_LINK_HTML, 400);
  } catch (err) {
    log.warn("oauth code exchange failed", { event: "connect.oauth.failed", error: err });
    return htmlResponse(errorPageHtml(
      "Could not finish connecting", err instanceof Error ? err.message : String(err)), 502);
  }
  return htmlResponse(SELF_CLOSING_HTML);
}
