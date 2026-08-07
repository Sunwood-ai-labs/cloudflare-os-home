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

Cloudflare OS owns the workspace, agent loop, Gadget tools, and reviewable changes. LiteLLM owns OpenAI-compatible model routing. The model itself is interchangeable; the current evidence was produced with `glm-4.7`.

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
