# Evidence

This runtime repository keeps only the checks needed to start and operate the local stack. Detailed feature experiments, raw screenshots, HyperFrames assets, X posting records, and the chronological research log live in the separate [Cloudflare OS Home Lab](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab).

## Runtime evidence

The local runtime is validated by:

- Compose configuration and the project-local LiteLLM route.
- Browser QA for local authentication, model registration, chat persistence, and responsive layout.
- The agent smoke test, which creates a Gadget, writes files, executes code, and leaves reviewable pending changes.
- Tailscale Serve configuration using a tailnet-only placeholder host.

Run the browser checks from the repository's `qa/` directory. Do not place credentials or private browser state in this repository.

## Research evidence

Use the Lab repository for the complete evidence map:

- [Experiment index](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab#-experiment-index)
- [Raw screenshots](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab/tree/main/artifacts/screenshots)
- [HyperFrames source and stills](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab/tree/main/artifacts/hyperframes)
- [Research log](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab/blob/main/RESEARCH-LOG.md)
- [QA inventory](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab/blob/main/QA.md)

The split is intentional: runtime setup stays easy to clone, while the evidence repository can grow with future experiments without making the operational repository noisy.
