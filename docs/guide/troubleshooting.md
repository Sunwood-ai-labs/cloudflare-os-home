# Troubleshooting

## Docker cannot connect to the Linux engine

Start Docker Desktop and wait until the Linux engine is ready, then run:

```powershell
docker version
docker compose up --build -d
```

If Docker Desktop is running but the engine is unavailable, restart Docker Desktop before debugging the application containers.

## Port 8877 is already in use

Find the process that owns the port or change the host mapping in docker-compose.yml. Keep the container port at 8877 unless you also update the browser backend settings.

## Cloudflare OS cannot reach LiteLLM

Use `http://litellm:4000/v1` inside the Compose network. Do not use localhost from the Cloudflare OS container. Check that the LiteLLM healthcheck is passing:

```powershell
docker compose ps
docker compose logs litellm
```

## Model registration succeeds but chat fails

Confirm that the model ID exists in LiteLLM, that LITELLM_MASTER_KEY matches the API token entered in the UI, and that the selected provider key is present in .env.

## Tailscale URL does not load

Run scripts/enable-tailscale-serve.ps1 and inspect tailscale serve status. Confirm that CFOS_PUBLIC_BASE_URL and CFOS_BACKEND_HOST match the URL and port you are using, then recreate the Cloudflare OS service.

## The agent answers without using tools

Ask for a concrete action and explicitly require file creation, code execution, and testing. A question-only prompt can complete as ordinary chat. Also check that the selected model handles tool calls reliably.

## Reset local state

```powershell
docker compose down -v
docker compose up --build -d
```

This removes named Worker state. Use it only when you are intentionally resetting the local lab.

Next: [Getting started](getting-started) · [Evidence](evidence) · [日本語](../ja/guide/troubleshooting)
