# Verification inventory

The runtime results below were captured during the initial integration pass. Repository polish checks were added on 2026-08-07.

## Repository polish QA

- [x] English and Japanese README entry points are present and cross-linked.
- [x] VitePress builds both locales with dead-link checking enabled.
- [x] GitHub Actions workflows cover documentation builds, public-payload checks, and Pages deployment.
- [x] Logo, favicon, and OGP assets are wired into the documentation site.
- [x] `npm audit --omit=dev --audit-level=high` reports no production dependency vulnerabilities.
- [x] Local-only `.env`, AWS files, and source screenshots remain excluded from the public payload.
- [x] Docker Compose services are healthy on 2026-08-07; Cloudflare OS and LiteLLM HTTP smoke checks returned 200.
- [x] GitHub Pages is enabled in workflow mode; English, Japanese, and evidence routes return HTTP 200.
- [x] The public `Repository QA` and `Deploy documentation` workflows pass on `main`.

## Functional checks

- [x] Compose configuration validates.
- [x] Project-local LiteLLM responds to an authenticated model-list request; 26 model IDs were returned.
- [x] Cloudflare OS serves its frontend on port 8877.
- [x] Local authentication succeeds.
- [x] A project-local LiteLLM-backed OpenAI-compatible model can be registered from the UI.
- [x] A simple prompt returns a model response from `glm-4.7`.
- [x] `LiteLLM · glm-5.2` can be registered from the UI through the project-local LiteLLM gateway and selected for a chat.
- [x] The result survives a page reload.
- [x] An agentic task creates a Gadget, writes `server.js`/`client.js`, executes code, and reports the test result.
- [x] The Slides Blueprint creates a seven-slide Gadget Draft, populates slides 1–6 in Japanese, and persists the result after `Accept changes`.
- [x] The Tailscale-only route on port 8877 returns HTTP 200 and accepts the dedicated local account.
- [x] A Slides Blueprint run through the Tailscale URL creates exactly six titled slides and persists them after `Accept changes`.
- [x] The Tailscale screenshot gallery on port 8890 returns HTTP 200, including representative slide images.
- [x] The GLM 5.2 content-focused Slides run creates exactly eight substantive slides, includes diagrams/table/verification cards, finds zero placeholder strings, has zero geometric overflows, and persists after `Accept changes`.
- [ ] The baseline Slides Blueprint run produces exactly six fully populated slides without leftover placeholders.
- [ ] The `Export to PDF` action produces a browser download in the local setup.

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
- [x] 18-slides-deck-placeholder.png
- [x] 19-slides-deck-summary.png
- [x] 20-slides-deck-title.png
- [x] 21-tailscale-access.png
- [x] 22-tailscale-home.png
- [x] 23-tailscale-slide-prompt.png
- [x] 24-tailscale-agent-start.png
- [x] 25-tailscale-agent-progress.png
- [x] 26-tailscale-draft-output.png
- [x] 27-tailscale-slide-progress.png
- [x] 28-tailscale-slide-edit-state.png
- [x] 29-tailscale-slide-failed.png
- [x] 30-tailscale-slide-1.png
- [x] 31-tailscale-slide-2.png
- [x] 32-tailscale-slide-3.png
- [x] 33-tailscale-slide-4.png
- [x] 34-tailscale-slide-5.png
- [x] 35-tailscale-slide-6.png
- [x] 36-tailscale-slide-accepted.png
- [x] 37-tailscale-slide-6-accepted.png
- [x] 38-tailscale-gallery.png
- [x] 39-tailscale-slide-6-accepted.png
- [x] 40-x-media-slide-1-3x2.png
- [x] 41-x-media-slide-6-3x2.png
- [x] 42-x-post-simulator.png
- [x] 43-x-media-slide-1-original-frame.png
- [x] 44-x-media-slide-6-original-frame.png
- [x] 45-x-post-simulator-split.png
- [x] 46-x-post-simulator-split-replies.png
- [x] 47-x-post-simulator-final-reply.png
- [x] 48-x-media-slide-1-original-frame.png
- [x] 49-x-media-slide-2-original-frame.png
- [x] 50-x-media-slide-3-original-frame.png
- [x] 51-x-media-slide-4-original-frame.png
- [x] 52-x-media-slide-5-original-frame.png
- [x] 53-x-media-slide-6-original-frame.png
- [x] 54-x-post-simulator-4plus2-top.png
- [x] 55-x-post-simulator-4plus2-middle.png
- [x] 56-x-post-simulator-4plus2-middle2.png
- [x] 57-glm-5.2-model-form.png
- [x] 58-glm-5.2-model-configured.png
- [x] 59-glm5.2-slide-prompt.png
- [x] 60-glm5.2-slide-1.png through 67-glm5.2-slide-8.png (first visual pass)
- [x] 68-glm5.2-slide-1-final.png
- [x] 69-glm5.2-slide-2-final.png
- [x] 70-glm5.2-slide-7-final.png
- [x] 71-glm5.2-slide-1-accepted.png through 78-glm5.2-slide-8-accepted.png
- [x] 79-x-media-glm5.2-slide-1-original-frame.png through 86-x-media-glm5.2-slide-8-original-frame.png
- [x] 87-x-media-glm5.2-slide-1-public-redacted.png and 89-x-media-glm5.2-slide-3-public-redacted.png
- [x] 91-x-post-simulator-glm5.2-4plus4-top.png
- [x] 92-x-post-simulator-glm5.2-4plus4-replies.png
- [x] 93-x-post-simulator-glm5.2-github-reply.png
- [x] 94-x-post-simulator-glm5.2-separated-main.png
- [x] 95-x-post-simulator-glm5.2-previous-post-reply.png
- [x] 96-x-post-simulator-glm5.2-continuation-media-reply.png
- [x] 97-x-post-simulator-glm5.2-github-reply.png

91〜93は初版レイアウト（前回投稿参照と5〜8枚目が同じ返信）、94〜97が分離後の最終証跡。

## Exploratory checks

- [x] Confirm the Compose-network LiteLLM URL `http://litellm:4000/v1` is used instead of `localhost` or an external network.
- [x] Confirm Tailscale Serve returns HTTPS 200 at the machine's tailnet URL (redacted in the public log).
- [x] Confirm the same chat flow works through the Tailscale URL.
- [x] Confirm the coding-agent flow reaches a pending Gadget draft and exposes Accept/Discard changes.
- [x] Open the generated Slides Gadget and verify slide navigation, `Slides`/`Code`/`Connections`, edit/present controls, and `Accept changes`.
- [x] Verify the six slide titles through the Tailscale URL after the agent initially lost its connection and reconnected.
- [x] Serve the screenshot gallery through a separate tailnet-only Tailscale Serve port.
- [x] Record any upstream/local limitations separately from setup failures.
