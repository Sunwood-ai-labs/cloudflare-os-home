# Verification inventory

## Functional checks

- [x] Compose configuration validates.
- [x] Project-local LiteLLM responds to an authenticated model-list request; 26 model IDs were returned.
- [x] Cloudflare OS serves its frontend on port 8877.
- [x] Local authentication succeeds.
- [x] A project-local LiteLLM-backed OpenAI-compatible model can be registered from the UI.
- [x] A simple prompt returns a model response from `glm-4.7`.
- [x] The result survives a page reload.
- [x] An agentic task creates a Gadget, writes `server.js`/`client.js`, executes code, and reports the test result.

## Visual evidence

Screenshots are saved under `artifacts/screenshots/` at the following checkpoints:

- [x] 01-login.png
- [x] 03-model-modal.png
- [x] 04-model-form.png
- [x] 05-model-configured.png
- [x] 06-home.png
- [x] 07-chat-response-final.png
- [x] 08-reload.png
- [x] 09-mobile-home.png
- [x] 10-network-model-form.png
- [x] 11-network-model-configured.png
- [x] 12-tailscale-chat-response.png
- [x] 13-tailscale-reload.png
- [x] 14-tailscale-mobile-home.png
- [x] 15-agent-request-sent.png
- [x] 16-agent-gadget-result.png
- [x] 17-agent-gadget-complete.png

## Exploratory checks

- [x] Confirm the Compose-network LiteLLM URL `http://litellm:4000/v1` is used instead of `localhost` or an external network.
- [x] Confirm Tailscale Serve returns HTTPS 200 at the machine's tailnet URL (redacted in the public log).
- [x] Confirm the same chat flow works through the Tailscale URL.
- [x] Confirm the coding-agent flow reaches a pending Gadget draft and exposes Accept/Discard changes.
- [x] Record any upstream/local limitations separately from setup failures.
