# Cloudflare OS Home

Unofficial personal/self-hosted workspace built around Cloudflare OS, LiteLLM, Docker Compose, and Tailscale.

This directory contains a self-contained Docker Compose lab for the official Cloudflare OS source and a project-local copy of the existing LiteLLM deployment.

The investigation history and screenshot-backed experiment results are recorded in [RESEARCH-LOG.md](RESEARCH-LOG.md).

This is an unofficial integration. See [SECURITY.md](SECURITY.md) for credential handling and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for upstream attribution.

## What is included

- `upstream/cloudflare-os`: the official Cloudflare OS repository.
- `litellm/`: the existing LiteLLM image recipe and Mantle compatibility patch.
- `litellm/config.yaml`: the existing 26-model configuration, with provider keys loaded from environment variables.
- `secrets/aws/`: the copied AWS profile files used by the Bedrock Mantle models.
- `cloudflare-os`: the official local Worker/workerd development server.

Both services are on the Compose project network. From Cloudflare OS, LiteLLM is always `http://litellm:4000/v1`; the project no longer depends on the external `open-webui_default` network.

## Start

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build -d
```

If starting on another machine, copy `.env.example` to `.env` and fill in `LITELLM_MASTER_KEY`, `ZAI_API_KEY`, `NVIDIA_API_KEY`, and `GEMINI_API_KEY`. The AWS profile files are only needed for the two Bedrock Mantle models.

The first run installs/builds the JavaScript workspace, so it can take several minutes. The local wrapper sets `WRANGLER_DEV_IP=0.0.0.0` and disables the generated-UI watchers in Docker. The initial generated files are still built; disabling only the watchers prevents Docker file events from repeatedly restarting Wrangler during a chat.

Open `http://localhost:8877` locally. Create a local account during first use. Browser QA scripts require `CFOS_USERNAME` and `CFOS_PASSWORD` to be supplied through the environment; no test password is stored in this repository.

## Tailscale

Tailscale Serve can expose the local service as a tailnet-only HTTPS proxy:

```text
https://<your-tailnet-host>:8877/
```

The Compose defaults use localhost. If using Tailscale, set `CFOS_PUBLIC_BASE_URL` and `CFOS_BACKEND_HOST` in `.env`, then recreate the Cloudflare OS service. To configure it manually:

```powershell
.\scripts\enable-tailscale-serve.ps1
tailscale serve status
```

This uses Tailscale Serve, so it is reachable by the tailnet and is not exposed as a public internet Funnel endpoint.

The cost of a chat is whatever the configured LiteLLM provider route charges; if that route is local, there is no per-token provider charge.

## Stop and reset

```powershell
docker compose down
```

The named volumes preserve local Worker state. To remove the local Worker state after confirming it is no longer needed:

```powershell
docker compose down -v
```

Verify the project-local LiteLLM without exposing the API key:

```powershell
.\scripts\verify-project-litellm.ps1
```

## Scope

This is an unofficial, reproducible local development setup, not the unfinished production `workerd` self-host deployment path. The upstream source and its Apache-2.0 license remain in `upstream/cloudflare-os`.

For browser QA, set credentials explicitly before running a script:

```powershell
$env:CFOS_USERNAME = 'your-local-account'
$env:CFOS_PASSWORD = 'your-local-password'
```
