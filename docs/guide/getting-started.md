# Getting started

This guide takes a clean Windows checkout to a running local workspace.

## Prerequisites

- Docker Desktop with the Linux engine enabled.
- PowerShell.
- Enough disk space for the upstream JavaScript install and Docker build.
- Provider credentials only for the models you plan to call.

## 1. Clone and configure

```powershell
git clone https://github.com/Sunwood-ai-labs/cloudflare-os-home.git
Set-Location cloudflare-os-home
Copy-Item .env.example .env
notepad .env
```

Set at least LITELLM_MASTER_KEY. Leave provider keys empty when you do not use those routes. Keep AWS profiles outside Git.

## 2. Start the Compose project

```powershell
docker compose up --build -d
docker compose ps
```

The first build installs the upstream pnpm workspace and can take several minutes. Cloudflare OS listens on port 8877; the project-local LiteLLM diagnostic port is 4001 on localhost.

## 3. Complete the first-run UI

Open `http://localhost:8877`, create a local account, and register an OpenAI-compatible model. For this project, the in-network endpoint is `http://litellm:4000/v1`.

## 4. Verify

```powershell
docker compose config --quiet
.\scripts\verify-project-litellm.ps1
```

For browser QA, provide credentials explicitly:

```powershell
$env:CFOS_USERNAME = 'your-local-account'
$env:CFOS_PASSWORD = 'your-local-password'
$env:BASE_URL = 'http://localhost:8877'
```

## 5. Stop safely

```powershell
docker compose down
```

Use docker compose down -v only when you want to remove the named Worker state volumes.

Next: [Usage](usage) · [Architecture](architecture) · [日本語](../ja/guide/getting-started)
