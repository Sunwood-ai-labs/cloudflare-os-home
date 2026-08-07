# Evidence

The conclusions in this repository are separated into source evidence, UI evidence, and live execution evidence.

## Source evidence

- The upstream README describes the agent-first workspace and Gadget model.
- The backend agent implementation contains the agent loop and tool definitions.
- The frontend renders tool-call summaries and pending changes.

Start with [the research log](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/RESEARCH-LOG.md) for the source paths and interpretation.

## UI evidence

| Checkpoint | Screenshot |
| --- | --- |
| Model registration | [11-network-model-configured.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/11-network-model-configured.png) |
| Tailscale chat | [12-tailscale-chat-response.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/12-tailscale-chat-response.png) |
| Agent request | [15-agent-request-sent.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/15-agent-request-sent.png) |
| Agent completed | [17-agent-gadget-complete.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/17-agent-gadget-complete.png) |

## Live execution evidence

The agent smoke test created a Gadget named Agent Proof, wrote server.js and client.js, ran code, confirmed Gadget accessibility, and left pending changes for review. The result was not inferred from a model explanation; it was observed in the application UI.

## Important limitation

The first ordinary chat also produced an incorrect explanation of Cloudflare OS. That is retained as useful evidence: a chat response alone is not the same as grounded product knowledge or an agentic execution.
