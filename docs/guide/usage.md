# Usage

Cloudflare OS Home has two useful modes: ordinary model chat and agentic work.

## Register a model

In the onboarding or provider screen, choose the OpenAI-compatible provider type and use:

- Model ID: the ID exposed by LiteLLM, such as glm-4.7.
- API URL: `http://litellm:4000/v1` from inside the Compose network.
- API token: the project-local LITELLM_MASTER_KEY.

The UI confirms a model registration. Detailed screenshots and experiment interpretation are maintained in the [Research Lab](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab).

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

## Share Pi MCP with every agent

First enable the optional runner using the [coding-agent setup](https://github.com/Sunwood-ai-labs/cloudflare-os-home#-coding-agents-claude-code-codex-antigravity-hermes). The normal stack does not require native-agent credentials or mounts.

1. Register an endpoint with the Cloudflare OS **MCP Server** connector and grant it to the chat.
2. Select `claude-code-glm`, `codex`, `antigravity`, `hermes`, or `agent-team` in that chat.
3. Ask the agent to inspect the connected MCP and retrieve information with a read tool. Pi records `describeBinding` and `executeCode` activity and returns the result to the native agent.

The runner automatically exposes the request's Pi tools as a `cloudflare_os` stdio MCP to each agent. Calls become ordinary model tool calls executed by Pi, so existing LiteLLM registration, chat grants, OAuth sign-in, and write approvals apply. Changes to connections and tool definitions take effect on the next model request.

Sharing is scoped to the connections granted to that chat. Local files and native conversation histories are separate. Every team stage receives the same Pi connection access; existing native file and shell permission settings still apply.

Codex receives an explicit runtime environment allowlist rather than the runner's `.env`. Its mounted ChatGPT login and CLI proxy/CA settings still work; provider keys, the LiteLLM master key, and the runner token are not forwarded. The request-scoped MCP transport token is forwarded to the bridge proxy, but excluded from Codex tool-shell environments along with CLI proxy settings. Shells start from a separate runtime-only allowlist, including when there is no Pi bridge. This environment filtering does not isolate files or other processes in the shared runner container.

Tune retained sessions with `AGENT_RUNNER_MCP_SESSION_TTL_SECONDS` (default 1800 seconds) and `AGENT_RUNNER_MCP_MAX_SESSIONS` (default 16). Native processes also have the separate `AGENT_RUNNER_TIMEOUT_SECONDS` timeout (default 900 seconds).

Rebuild the runner after updating its code:

```powershell
docker compose -f docker-compose.yml -f docker-compose.agents.yml up --build -d agent-runner
docker compose -f docker-compose.yml -f docker-compose.agents.yml restart litellm
```

Wait for LiteLLM's `/health/liveliness` to return HTTP 200 before retrying a chat. Restarting LiteLLM reconnects it after the runner container's address changes.

Verify MCP transport and the Pi tool-result round trip without credentials or production services:

```powershell
node --test agent-runner/*.test.mjs
```

Automated tests use disposable CLI, MCP, and model-response fixtures. To validate a real model, perform the chat steps above and inspect both the native agent's final answer and Pi's tool records.

Test the built container's real Claude Code, Codex, and Hermes against synthetic loopback models with outside networking disabled:

```powershell
docker run --rm --network none --entrypoint node cloudflare-os-local-agent-runner:latest /app/native-mcp-smoke.mjs --agent claude
docker run --rm --network none --entrypoint node cloudflare-os-local-agent-runner:latest /app/native-mcp-smoke.mjs --agent codex
docker run --rm --network none --entrypoint node cloudflare-os-local-agent-runner:latest /app/native-mcp-smoke.mjs --agent hermes
docker run --rm --network none --entrypoint node cloudflare-os-local-agent-runner:latest /app/native-codex-mcp-smoke.mjs --check-environment
```

This verifies real CLI interoperability with synthetic models; it does not test external providers or real upstream MCP endpoints.
The Codex environment probe also executes a real tool shell with synthetic secret canaries and hostile shell-environment config, verifies that none reaches the shell, then checks the authenticated MCP round trip. Repository QA runs this probe with the same pinned Codex version as the image.

For a live check through the deployed LiteLLM, install the pinned Pi runtime in an ignored artifacts directory and run the public documentation probe:

```powershell
npm install --prefix artifacts/pi-runtime --no-audit --no-fund @earendil-works/pi-agent-core@0.87.1 @earendil-works/pi-ai@0.87.1
node qa/live-mcp-agent-probe.mjs --runtime-dir artifacts/pi-runtime --base-url http://127.0.0.1:4001/v1 --credential-env LITELLM_MASTER_KEY --models claude-code-glm,codex,antigravity,hermes,agent-team --output-dir artifacts/live-mcp-real
```

This requires the running stack and each native agent's actual credentials. The probe reads `LITELLM_MASTER_KEY` from the environment or local `.env` without printing it. It makes real model/provider requests that consume your allowances and calls the [read-only OpenAI Docs MCP](https://developers.openai.com/learn/docs-mcp). Models run sequentially; choose a fresh evidence directory for each run.

JSON evidence records native assistant tool calls, actual public MCP responses and hashes, all assistant outputs, and an unpredictable verifier generated only after a successful MCP call. Team checks require Plan, Implement, Review, and Summary to call MCP and consume their own verifier; every observed fix and re-review must do so too. The team log is checked against the recorded stages. Verifiers may appear in a stage's output without being repeated in the final summary. This standalone Pi-loop probe verifies the native bridge; the chat steps above separately check Workshop connection grants and Gadget behavior. Use `--api openai-responses` to test Pi's Responses adapter.

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
