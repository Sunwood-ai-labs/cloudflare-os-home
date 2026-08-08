<div align="center">
  <img src="docs/public/logo.svg" alt="Cloudflare OS Home logo" width="96" />
  <h1>Cloudflare OS Home</h1>
  <p>Unofficial personal, self-hosted agent workspace built around Cloudflare OS.</p>
  <p>
    <a href="https://github.com/Sunwood-ai-labs/cloudflare-os-home/actions/workflows/ci.yml"><img src="https://github.com/Sunwood-ai-labs/cloudflare-os-home/actions/workflows/ci.yml/badge.svg" alt="Repository QA" /></a>
    <a href="https://github.com/Sunwood-ai-labs/cloudflare-os-home/actions/workflows/pages.yml"><img src="https://github.com/Sunwood-ai-labs/cloudflare-os-home/actions/workflows/pages.yml/badge.svg" alt="Docs deployment" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-E66A3C.svg" alt="Apache-2.0 license" /></a>
    <a href="https://docs.docker.com/compose/"><img src="https://img.shields.io/badge/Docker%20Compose-ready-2496ED.svg?logo=docker&logoColor=white" alt="Docker Compose" /></a>
  </p>
  <p>
    <a href="README.ja.md">日本語</a>
    ·
    <a href="https://sunwood-ai-labs.github.io/cloudflare-os-home/">Documentation</a>
    ·
    <a href="https://github.com/Sunwood-ai-labs/cloudflare-os-home/issues">Issues</a>
  </p>
</div>

## ✨ What this is

Cloudflare OS Home is a reproducible local lab for exploring Cloudflare OS as an agent-first workspace. It bundles the upstream Cloudflare OS source with a project-local LiteLLM gateway, Docker Compose networking, Tailscale Serve instructions, and screenshot-backed verification.

The focus is practical: ask an agent to create a Gadget, write files, execute code, and leave a reviewable draft. It is an unofficial integration, not a Cloudflare-hosted product or an official distribution.

## 🚀 What you get

- Cloudflare OS source pinned to a known upstream revision.
- Project-local LiteLLM with an OpenAI-compatible endpoint at `http://litellm:4000/v1`.
- A 26-model configuration template with provider credentials loaded from `.env`.
- Docker Compose networking that does not depend on an external Open WebUI network.
- Optional tailnet-only HTTPS access through Tailscale Serve.
- Browser QA scripts for model registration, chat persistence, responsive layout, and agentic Gadget creation.
- A research log and screenshots documenting what was actually tested.

## 🧭 Choose your path

| Goal | Start here |
| --- | --- |
| Run the local workspace | [Quick start](#-quick-start) |
| Understand the containers | [Architecture](https://sunwood-ai-labs.github.io/cloudflare-os-home/guide/architecture) |
| Reproduce the agent test | [Agent smoke test](#-agent-smoke-test) |
| Compare the evidence | [Research log](RESEARCH-LOG.md) |
| Diagnose a failed setup | [Troubleshooting](https://sunwood-ai-labs.github.io/cloudflare-os-home/guide/troubleshooting) |

## ⚡ Quick start

Prerequisites: Docker Desktop with the Linux engine enabled and PowerShell.

```powershell
git clone https://github.com/Sunwood-ai-labs/cloudflare-os-home.git
Set-Location cloudflare-os-home
Copy-Item .env.example .env
notepad .env
docker compose up --build -d
```

Open `http://localhost:8877` and create a local account on first use. At minimum, set `LITELLM_MASTER_KEY` in `.env`; provider API keys are only required for the routes you intend to call. AWS profile files are optional and are never committed.

Stop the lab with:

```powershell
docker compose down
```

The named volumes preserve local Worker state. Use `docker compose down -v` only when you intentionally want to remove that state.

## 🔐 Environment and secrets

`.env.example` is safe to copy, but it is intentionally incomplete. Keep real values in `.env`:

- `LITELLM_MASTER_KEY` for the project-local LiteLLM API.
- Provider keys such as `ZAI_API_KEY`, `NVIDIA_API_KEY`, and `GEMINI_API_KEY` when needed.
- `CFOS_PUBLIC_BASE_URL` and `CFOS_BACKEND_HOST` when using a non-local browser endpoint.
- AWS profiles only when using the optional Bedrock Mantle routes.

Never commit `.env`, `secrets/`, AWS profiles, or browser credentials. See [SECURITY.md](SECURITY.md).

## 🧩 Architecture

```text
Browser
  │ http://localhost:8877 or a tailnet-only Tailscale URL
  ▼
Cloudflare OS container
  │ http://litellm:4000/v1
  ▼
Project-local LiteLLM container
  │
  ▼
Configured model providers
```

Cloudflare OS owns the workspace, agent loop, Gadget tools, and reviewable changes. LiteLLM owns OpenAI-compatible model routing. The model itself is interchangeable; the original integration evidence used `glm-4.7`, while the latest content-focused Slides rerun used `glm-5.2` through the same project-local LiteLLM route.

## 🌐 Tailscale access

Tailscale Serve can provide tailnet-only HTTPS without opening a public Funnel endpoint:

```powershell
$env:CFOS_PUBLIC_BASE_URL = 'https://<your-tailnet-host>:8877'
$env:CFOS_BACKEND_HOST = '<your-tailnet-host>:8877'
docker compose up -d --force-recreate cloudflare-os
.\scripts\enable-tailscale-serve.ps1
```

The helper prints the actual tailnet URL. Keep the endpoint private to your tailnet and review the authentication model before sharing it.

## 🤖 Agent smoke test

The included smoke test asks Cloudflare OS to create a minimal Gadget, write `server.js` and `client.js`, execute a test, and report the result. Supply credentials explicitly:

```powershell
$env:CFOS_USERNAME = 'your-local-account'
$env:CFOS_PASSWORD = 'your-local-password'
$env:BASE_URL = 'http://localhost:8877'
node .\qa\agentic-gadget-smoke.mjs
```

The run should produce a Gadget draft with `Pending changes`, `Accept changes`, and `Discard`. This is the strongest evidence in the repository that the flow is more than a chat-only response.

## 📸 Evidence gallery

A quick visual tour of the four most useful checkpoints. Click any image to open the full-resolution PNG; the [QA inventory](QA.md) lists the full checkpoint inventory.

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="artifacts/screenshots/11-network-model-configured.png"><img src="artifacts/screenshots/11-network-model-configured.png" alt="Configured LiteLLM model in Cloudflare OS" width="100%" /></a>
      <br /><sub><b>1. Model connected</b> — the project-local LiteLLM model is registered.</sub>
    </td>
    <td width="50%" valign="top">
      <a href="artifacts/screenshots/12-tailscale-chat-response.png"><img src="artifacts/screenshots/12-tailscale-chat-response.png" alt="Cloudflare OS chat through the Tailscale endpoint" width="100%" /></a>
      <br /><sub><b>2. Tailscale path works</b> — the workspace is reachable and the model responds; answer-quality limits are documented in the research log.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="artifacts/screenshots/15-agent-request-sent.png"><img src="artifacts/screenshots/15-agent-request-sent.png" alt="Agent request asking Cloudflare OS to build a Gadget" width="100%" /></a>
      <br /><sub><b>3. Agent task submitted</b> — the prompt explicitly requires file creation, execution, and testing.</sub>
    </td>
    <td width="50%" valign="top">
      <a href="artifacts/screenshots/17-agent-gadget-complete.png"><img src="artifacts/screenshots/17-agent-gadget-complete.png" alt="Completed Cloudflare OS Gadget draft with pending changes" width="100%" /></a>
      <br /><sub><b>4. Gadget draft complete</b> — files were written, code ran, and changes are reviewable.</sub>
    </td>
  </tr>
</table>

For the interpretation behind these images, see the [evidence guide](https://sunwood-ai-labs.github.io/cloudflare-os-home/guide/evidence) and [research log](RESEARCH-LOG.md).

## 🔬 Investigation trail

The gallery above is the short version. The sections below keep the wider UI trail visible: setup, model configuration, chat persistence, network routing, Tailscale, and the agent run.

### Setup and capability surface

<table>
  <tr>
    <td width="33%" valign="top"><a href="artifacts/screenshots/01-login.png"><img src="artifacts/screenshots/01-login.png" alt="Cloudflare OS first login" width="100%" /></a><br /><sub><b>First login</b> — local account setup.</sub></td>
    <td width="33%" valign="top"><a href="artifacts/screenshots/03-model-modal.png"><img src="artifacts/screenshots/03-model-modal.png" alt="Cloudflare OS model picker" width="100%" /></a><br /><sub><b>Model picker</b> — add an AI provider.</sub></td>
    <td width="33%" valign="top"><a href="artifacts/screenshots/04-model-form.png"><img src="artifacts/screenshots/04-model-form.png" alt="Cloudflare OS model form" width="100%" /></a><br /><sub><b>Model form</b> — OpenAI-compatible fields.</sub></td>
  </tr>
  <tr>
    <td width="33%" valign="top"><a href="artifacts/screenshots/05-model-configured.png"><img src="artifacts/screenshots/05-model-configured.png" alt="Configured LiteLLM model in onboarding" width="100%" /></a><br /><sub><b>Model selected</b> — LiteLLM · glm-4.7 is available.</sub></td>
    <td width="33%" valign="top"><a href="artifacts/screenshots/06-home.png"><img src="artifacts/screenshots/06-home.png" alt="Cloudflare OS home workspace" width="100%" /></a><br /><sub><b>Workspace home</b> — work starts from a workspace.</sub></td>
    <td width="33%" valign="top"><a href="artifacts/screenshots/09-mobile-home.png"><img src="artifacts/screenshots/09-mobile-home.png" alt="Cloudflare OS mobile-width home" width="100%" /></a><br /><sub><b>Responsive layout</b> — mobile-width home view.</sub></td>
  </tr>
</table>

### Chat, persistence, and the knowledge caveat

<table>
  <tr>
    <td width="50%" valign="top"><a href="artifacts/screenshots/07-chat-response-final.png"><img src="artifacts/screenshots/07-chat-response-final.png" alt="Ordinary Cloudflare OS chat response" width="100%" /></a><br /><sub><b>Ordinary chat</b> — the model answered without using tools or external knowledge.</sub></td>
    <td width="50%" valign="top"><a href="artifacts/screenshots/08-reload.png"><img src="artifacts/screenshots/08-reload.png" alt="Cloudflare OS conversation after reload" width="100%" /></a><br /><sub><b>Persistence</b> — the conversation remained after reload.</sub></td>
  </tr>
</table>

> **Knowledge/RAG status:** the local run did not verify an Open WebUI-style Knowledge collection or RAG search screen. The ordinary-chat image is evidence of that limitation and of why grounded knowledge should not be assumed.

### LiteLLM routing and Tailscale

<table>
  <tr>
    <td width="33%" valign="top"><a href="artifacts/screenshots/10-network-model-form.png"><img src="artifacts/screenshots/10-network-model-form.png" alt="Cloudflare OS LiteLLM network model form" width="100%" /></a><br /><sub><b>In-network URL</b> — http://litellm:4000/v1.</sub></td>
    <td width="33%" valign="top"><a href="artifacts/screenshots/13-tailscale-reload.png"><img src="artifacts/screenshots/13-tailscale-reload.png" alt="Cloudflare OS reload through Tailscale" width="100%" /></a><br /><sub><b>Tailscale reload</b> — the same workspace survives the tailnet path.</sub></td>
    <td width="33%" valign="top"><a href="artifacts/screenshots/14-tailscale-mobile-home.png"><img src="artifacts/screenshots/14-tailscale-mobile-home.png" alt="Cloudflare OS mobile view through Tailscale" width="100%" /></a><br /><sub><b>Tailscale mobile</b> — responsive access over tailnet-only HTTPS.</sub></td>
  </tr>
</table>

### Agent execution progression

<table>
  <tr>
    <td width="100%" valign="top"><a href="artifacts/screenshots/16-agent-gadget-result.png"><img src="artifacts/screenshots/16-agent-gadget-result.png" alt="Cloudflare OS agent Gadget execution result" width="100%" /></a><br /><sub><b>Tool execution</b> — the agent produced a Gadget result before the final reviewable draft.</sub></td>
  </tr>
</table>

### Slides Blueprint experiment

<table>
  <tr>
    <td width="33%" valign="top"><a href="artifacts/screenshots/20-slides-deck-title.png"><img src="artifacts/screenshots/20-slides-deck-title.png" alt="Cloudflare OS Japanese slide deck title" width="100%" /></a><br /><sub><b>Slides title</b> — the generated deck opens as a Slides Gadget.</sub></td>
    <td width="33%" valign="top"><a href="artifacts/screenshots/19-slides-deck-summary.png"><img src="artifacts/screenshots/19-slides-deck-summary.png" alt="Cloudflare OS slide deck summary" width="100%" /></a><br /><sub><b>Generated content</b> — Japanese slides cover the comparison and limitations.</sub></td>
    <td width="33%" valign="top"><a href="artifacts/screenshots/18-slides-deck-placeholder.png"><img src="artifacts/screenshots/18-slides-deck-placeholder.png" alt="Cloudflare OS slide deck placeholder" width="100%" /></a><br /><sub><b>Known limitation</b> — the seventh template slide retained placeholders.</sub></td>
  </tr>
</table>

### GLM 5.2 content-focused rerun

The latest run switched the Cloudflare OS model picker to `LiteLLM · glm-5.2` and asked the built-in Slides Blueprint for an exactly eight-slide, Japanese, content-heavy verification deck. Each slide was required to contain a title, lead, and concrete body content, with an architecture diagram, execution flow, comparison table, and verification cards. The first visual pass exposed a low-contrast cover title and literal placeholder examples; both were corrected before `Accept changes`.

<table>
  <tr>
    <td width="25%" valign="top"><a href="artifacts/screenshots/58-glm-5.2-model-configured.png"><img src="artifacts/screenshots/58-glm-5.2-model-configured.png" alt="GLM 5.2 registered in Cloudflare OS" width="100%" /></a><br /><sub><b>Model selected</b> — project-local LiteLLM exposes `glm-5.2`.</sub></td>
    <td width="25%" valign="top"><a href="artifacts/screenshots/68-glm5.2-slide-1-final.png"><img src="artifacts/screenshots/68-glm5.2-slide-1-final.png" alt="GLM 5.2 slide deck cover" width="100%" /></a><br /><sub><b>Cover</b> — corrected contrast and environment details.</sub></td>
    <td width="25%" valign="top"><a href="artifacts/screenshots/69-glm5.2-slide-2-final.png"><img src="artifacts/screenshots/69-glm5.2-slide-2-final.png" alt="GLM 5.2 slide acceptance criteria" width="100%" /></a><br /><sub><b>Acceptance criteria</b> — no placeholder text and substantive bodies.</sub></td>
    <td width="25%" valign="top"><a href="artifacts/screenshots/70-glm5.2-slide-7-final.png"><img src="artifacts/screenshots/70-glm5.2-slide-7-final.png" alt="GLM 5.2 slide verification cards" width="100%" /></a><br /><sub><b>Verification cards</b> — 8/8, placeholder 0, body present, save check.</sub></td>
  </tr>
</table>

The accepted final set is [71–78](artifacts/screenshots/71-glm5.2-slide-1-accepted.png) through the saved [8 / 8 conclusion](artifacts/screenshots/78-glm5.2-slide-8-accepted.png). The UI verification recorded exactly `1 / 8` through `8 / 8`, a placeholder scan of zero, and zero geometric overflows. PDF file download, Knowledge/RAG behavior, external integrations, and long-running reconnect stability remain explicitly unverified.

The follow-up X payload is also staged in a tailnet-only [4 + 4 simulator](https://<tailnet-host>:8891/): four public-safe attachments on the main post, a separate attachment-free reply that points to the previous post, four attachments on the next linear continuation reply, and the GitHub URL in a separate final reply. The original captures remain in the repository; only the two images containing private connection URLs are masked in the simulated public payload.

### Tailscale evidence gallery

The slide run was repeated through the tailnet-only Cloudflare OS URL. The complete timeline is available from the local gallery at `https://<tailnet-host>:8890/` after starting the evidence server.

<table>
  <tr>
    <td width="33%" valign="top"><a href="artifacts/screenshots/30-tailscale-slide-1.png"><img src="artifacts/screenshots/30-tailscale-slide-1.png" alt="Tailscale slide one" width="100%" /></a><br /><sub><b>1 / 6</b> — the title slide is visible through Tailscale.</sub></td>
    <td width="33%" valign="top"><a href="artifacts/screenshots/35-tailscale-slide-6.png"><img src="artifacts/screenshots/35-tailscale-slide-6.png" alt="Tailscale slide six" width="100%" /></a><br /><sub><b>6 / 6</b> — the final slide is reachable through the same route.</sub></td>
    <td width="33%" valign="top"><a href="artifacts/screenshots/38-tailscale-gallery.png"><img src="artifacts/screenshots/38-tailscale-gallery.png" alt="Tailscale screenshot gallery" width="100%" /></a><br /><sub><b>Evidence gallery</b> — the screenshot page itself is tailnet-only.</sub></td>
  </tr>
</table>

The [research log](RESEARCH-LOG.md) contains the Open WebUI comparison, cost notes, source-code findings, and the distinction between what was observed locally and what remains unverified. No Open WebUI UI screenshot was captured in this run, so that comparison is not presented as image evidence.

## 🧪 Verification

```powershell
docker compose config --quiet
.\scripts\verify-project-litellm.ps1
```

The [QA inventory](QA.md) records the functional checks and screenshot checkpoints. The [research log](RESEARCH-LOG.md) explains the conclusions, limitations, Open WebUI comparison, and agent experiment in detail.

## 📚 Documentation

The browsable docs are available at [sunwood-ai-labs.github.io/cloudflare-os-home](https://sunwood-ai-labs.github.io/cloudflare-os-home/).

Run the docs locally:

```powershell
Set-Location docs
npm ci
npm run docs:dev
```

The site has English and Japanese navigation. Start with [Getting started](https://sunwood-ai-labs.github.io/cloudflare-os-home/guide/getting-started) or [はじめに](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/guide/getting-started).

## 🗂️ Repository layout

```text
cloudflare-os-home/
├─ upstream/cloudflare-os/   # pinned upstream source
├─ litellm/                  # project-local gateway image and config
├─ qa/                       # Playwright smoke tests and evidence scripts
├─ scripts/                  # PowerShell helpers
├─ artifacts/screenshots/    # public verification screenshots
├─ docs/                     # bilingual VitePress documentation
├─ docker-compose.yml
├─ RESEARCH-LOG.md
└─ SECURITY.md
```

## ⚠️ Scope and limitations

- This is a local development and research setup, not a production `workerd` self-host deployment.
- Cloudflare OS cloud features, pricing, and availability can differ from this local source checkout.
- Agent behavior depends on the selected model and can vary between runs.
- External connections and real-world actions require deliberate Gatekeeper/credential configuration.
- The upstream source remains under its own Apache-2.0 terms. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## 📜 License

The repository wrapper and included upstream source are distributed with Apache-2.0 terms. See [LICENSE](LICENSE) and the upstream license at [`upstream/cloudflare-os/LICENSE`](upstream/cloudflare-os/LICENSE).
