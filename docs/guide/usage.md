# Usage

Cloudflare OS Home has two useful modes: ordinary model chat and agentic work.

## Register a model

In the onboarding or provider screen, choose the OpenAI-compatible provider type and use:

- Model ID: the ID exposed by LiteLLM, such as glm-4.7.
- API URL: `http://litellm:4000/v1` from inside the Compose network.
- API token: the project-local LITELLM_MASTER_KEY.

The UI confirms a model registration, and the project evidence includes the configured provider screen.

## Ordinary chat

A question such as “what is Cloudflare OS?” can finish as one model response. That is still useful for quick answers, but it does not prove that tools were called. Model knowledge can also be incomplete or stale.

## Agentic work

Make the requested work concrete and require execution. For example:

```text
Act as a coding agent, not a chat-only assistant.
Create a minimal Gadget named Agent Proof.
Write the files, execute a test, and report the result.
Do not only explain the steps.
```

A successful run should show tool activity such as writing files, running code, using the Gadget, and a pending draft that can be accepted or discarded.

## Browser QA

All browser scripts require CFOS_USERNAME and CFOS_PASSWORD. The agent smoke test also accepts BASE_URL. The wait-and-evidence script requires WORKSPACE_URL from the workspace under test.

```powershell
$env:CFOS_USERNAME = 'your-local-account'
$env:CFOS_PASSWORD = 'your-local-password'
$env:BASE_URL = 'http://localhost:8877'
node .\qa\agentic-gadget-smoke.mjs
```

## Tailscale

Set CFOS_PUBLIC_BASE_URL and CFOS_BACKEND_HOST in the environment or .env, recreate the Cloudflare OS service, then run scripts/enable-tailscale-serve.ps1. The helper derives the machine tailnet URL instead of storing one in the repository.

Next: [Architecture](architecture) · [Evidence](evidence) · [日本語](../ja/guide/usage)
