<div align="center">
  <img src="docs/public/logo.svg" alt="Cloudflare OS Home logo" width="96" />
  <h1>Cloudflare OS Home</h1>
  <p>Unofficial self-hosted Cloudflare OS workspace with project-local LiteLLM, Docker Compose, and Tailscale.</p>
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
    <a href="https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab">Research Lab</a>
    ·
    <a href="https://github.com/Sunwood-ai-labs/cloudflare-os-home/issues">Issues</a>
  </p>
</div>

## ✨ What this is

Cloudflare OS Home is a reproducible local runtime for exploring Cloudflare OS as an agent-first workspace. It keeps the upstream source, project-local LiteLLM route, Docker Compose networking, Tailscale Serve instructions, and browser QA together in one operational repository.

This is an unofficial integration, not a Cloudflare-hosted product or official distribution. Detailed experiments, screenshots, HyperFrames assets, and feature conclusions live in the separate [Cloudflare OS Home Lab](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab) repository.

## 🚀 What you get

- Cloudflare OS source pinned to a known upstream revision.
- Project-local LiteLLM with an OpenAI-compatible endpoint at `http://litellm:4000/v1`.
- A 26-model configuration template with provider credentials loaded from `.env`.
- Docker Compose networking that does not depend on an external Open WebUI network.
- Optional tailnet-only HTTPS access through Tailscale Serve.
- Browser QA scripts for model registration, chat persistence, responsive layout, and agentic Gadget creation.
- A separate evidence repository for detailed experiment records and screenshots.

## 🧭 Choose your path

| Goal | Start here |
| --- | --- |
| Run the local workspace | [Quick start](#-quick-start) |
| Understand the containers | [Architecture](https://sunwood-ai-labs.github.io/cloudflare-os-home/guide/architecture) |
| Reproduce the agent test | [Agent smoke test](#-agent-smoke-test) |
| Configure tailnet-only access | [Tailscale access](#-tailscale-access) |
| Try a reusable example | [Examples](examples/) |
| Read experiment results and screenshots | [Cloudflare OS Home Lab](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab) |
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

Stop the stack with:

```powershell
docker compose down
```

Named volumes preserve local Worker state. Use `docker compose down -v` only when you intentionally want to remove that state.

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

Cloudflare OS owns the workspace, agent loop, Gadget tools, and reviewable changes. LiteLLM owns OpenAI-compatible model routing. The model itself is interchangeable; the runtime was exercised with `glm-4.7` and `glm-5.2`.

### Architecture diagrams

The editable draw.io source is [`docs/cloudflare-os-architecture.drawio`](docs/cloudflare-os-architecture.drawio). The exported SVGs are shown below so the architecture is visible directly from the repository README.

<p align="center">
  <img src="docs/cloudflare-os-architecture.drawio.svg" alt="Cloudflare OS Home system architecture" width="100%" />
</p>

<p align="center"><em>Runtime architecture: Docker Compose, Cloudflare OS, Gatekeepers, LiteLLM, and external providers.</em></p>

<p align="center">
  <img src="docs/cloudflare-os-repository-structure.drawio.svg" alt="Cloudflare OS Home repository structure" width="100%" />
</p>

<p align="center"><em>Repository structure: the local integration wrapper and the pinned upstream monorepo.</em></p>

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

The run should produce a Gadget draft with `Pending changes`, `Accept changes`, and `Discard`. Detailed interpretation and visual evidence belong in the [Cloudflare OS Home Lab](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab).

## 🧰 Reusable examples

The [examples directory](examples/) collects public-safe inputs, expected results, implementation pointers, and limitations for repeatable local experiments. Start with the [Gatekeeper cross-customer write block](examples/gatekeeper-cross-customer-block/) example.

[The experiment index](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab/blob/main/experiments/README.md) maps the verified Cloudflare OS Home capabilities to their detailed records.

Examples use synthetic or local data only. Do not add credentials, real customer records, private endpoints, or publication-tracking metadata.

## 🧪 Runtime QA

The CI workflow validates the Compose file, QA script syntax, public-payload exclusions, and whitespace. The VitePress documentation build runs in the same workflow. For experiment-level claims, use the [Lab QA inventory](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab/blob/main/QA.md).

## 📚 Documentation

- [Getting started](https://sunwood-ai-labs.github.io/cloudflare-os-home/guide/getting-started)
- [Usage](https://sunwood-ai-labs.github.io/cloudflare-os-home/guide/usage)
- [Architecture](https://sunwood-ai-labs.github.io/cloudflare-os-home/guide/architecture)
- [Troubleshooting](https://sunwood-ai-labs.github.io/cloudflare-os-home/guide/troubleshooting)
- [Experiment records and evidence](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab)

## 📜 License

The repository is Apache-2.0 licensed. Upstream notices and third-party terms are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
