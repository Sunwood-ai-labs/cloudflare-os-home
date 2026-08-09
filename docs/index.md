---
layout: home

hero:
  name: Cloudflare OS Home
  text: A local, agent-first workspace
  tagline: Cloudflare OS + LiteLLM + Docker Compose + Tailscale
  image:
    src: /logo.svg
    alt: Cloudflare OS Home
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: 日本語
      link: /ja/
    - theme: alt
      text: Research Lab
      link: https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab
    - theme: alt
      text: View on GitHub
      link: https://github.com/Sunwood-ai-labs/cloudflare-os-home

features:
  - icon: 🧩
    title: Agent-first by design
    details: Create Gadgets, write files, execute code, and review pending changes.
  - icon: 🔌
    title: Bring your own models
    details: Route an OpenAI-compatible model through the project-local LiteLLM service.
  - icon: 🛡️
    title: Private by default
    details: Keep the lab local or expose it only to your tailnet through Tailscale Serve.
  - icon: 📸
    title: Research companion
    details: Follow the separate public lab for experiment records, screenshots, and evidence.
---

# Cloudflare OS Home

An unofficial, reproducible local lab for exploring Cloudflare OS as a workspace where agents can build and run small applications.

This repository keeps the runtime practical: the upstream source is included, LiteLLM is wired inside the Compose network, and the most important agent behavior is backed by a real Gadget smoke test.

## Start with a goal

- [Get started](guide/getting-started) — bring the stack up from a clean checkout.
- [Usage](guide/usage) — register a model, chat, and ask for agentic work.
- [Architecture](guide/architecture) — understand which container owns what.
- [Evidence](guide/evidence) — understand the split between runtime QA and the research lab.
- [Research Lab](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab) — read experiment records and inspect screenshots.
- [Troubleshooting](guide/troubleshooting) — recover from the common local failures.

## The short version

```text
Browser → Cloudflare OS → project-local LiteLLM → configured model provider
```

Cloudflare OS supplies the workspace and agent loop. LiteLLM supplies the model routing. This is a local integration, not an official Cloudflare-hosted service.
