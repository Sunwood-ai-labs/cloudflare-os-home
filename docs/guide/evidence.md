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

## Collaborative whiteboard experiment

The prompt “Make a collaborative whiteboard app.” was run through `LiteLLM · glm-5.2`. This produced an agent-generated Gadget with Durable Object shared state, sticky notes, drawing, presence, and event delivery; it was not a fixed whiteboard feature. A separate test account then joined a `Gadget only` share link and synchronized a new note back to the Owner.

| Checkpoint | Screenshot |
| --- | --- |
| 22-check retest | [108-whiteboard-retest.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/108-whiteboard-retest.png) |
| UI smoke test | [109-whiteboard-smoke-test.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/109-whiteboard-smoke-test.png) |
| Two-tab presence | [114-whiteboard-two-tabs-presence.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/114-whiteboard-two-tabs-presence.png) |
| Realtime sync | [115-whiteboard-realtime-tabB-to-tabA.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/115-whiteboard-realtime-tabB-to-tabA.png) |
| Reload persistence | [116-whiteboard-reload-persistence.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/116-whiteboard-reload-persistence.png) |
| Cross-account share join | [119-multiuser-collaborator-joined.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/119-multiuser-collaborator-joined.png) |
| Cross-account realtime note | [120-multiuser-collaborator-realtime-note.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/120-multiuser-collaborator-realtime-note.png) / [122-multiuser-owner-sync-final.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/122-multiuser-owner-sync-final.png) |

The full screenshot timeline, cross-account permission result, cleanup error, and unverified boundaries are in the [collaborative whiteboard experiment record](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/WHITEBOARD-EXPERIMENT.md).

### Reading the screenshots with HyperFrames

The six raw multi-user screenshots are also explained in a rendered [38-second HyperFrames walkthrough](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/hyperframe-multiuser-explainer.mp4). The [source composition](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/hyperframes/multiuser-explainer/index.html) labels each scene as share, join, input, sync, or cleanup finding. Keyframes [124](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/124-hyperframe-multiuser-title.png) through [129](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/129-hyperframe-cleanup-finding.png) preserve the original screenshots and add the interpretation beside them.

For publishing, a separate [six-slide 3:2 carousel](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/130-cloudflare-os-multiuser-slide-1-title.png) is available. It uses a result-first cover and short action/result slides; see [130–135](https://github.com/Sunwood-ai-labs/cloudflare-os-home/tree/main/artifacts/screenshots) for the full set.

The continuation was published as a four-post X thread: [main post](https://x.com/hAru_mAki_ch/status/2086048448328204347), [continuity reply](https://x.com/hAru_mAki_ch/status/2086048845205798939), [evidence reply](https://x.com/hAru_mAki_ch/status/2086048941033009238), and [repository reply](https://x.com/hAru_mAki_ch/status/2086049016979374574). The complete payload, parent IDs, and publication checks are recorded in [WHITEBOARD-EXPERIMENT.md](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/WHITEBOARD-EXPERIMENT.md).

## Important limitation

The first ordinary chat also produced an incorrect explanation of Cloudflare OS. That is retained as useful evidence: a chat response alone is not the same as grounded product knowledge or an agentic execution.
