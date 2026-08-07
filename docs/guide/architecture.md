# Architecture

## Runtime flow

```text
Browser
  │ localhost:8877 or tailnet-only Tailscale Serve
  ▼
Cloudflare OS container
  │ http://litellm:4000/v1
  ▼
Project-local LiteLLM
  │
  ▼
Model provider route
```

## Responsibilities

| Component | Responsibility |
| --- | --- |
| Cloudflare OS | Workspace UI, chat history, agent loop, Gadget tools, reviewable drafts |
| LiteLLM | OpenAI-compatible gateway, provider routing, model aliases, master-key auth |
| Docker Compose | Private service networking and repeatable startup |
| Tailscale Serve | Optional tailnet-only HTTPS access to the local port |
| QA scripts | Browser flows and screenshot evidence without storing credentials |

## Why the internal URL matters

The Cloudflare OS container cannot use localhost to reach the LiteLLM container. The Compose service name `litellm` resolves on the project network, so the correct in-network URL is `http://litellm:4000/v1`.

The host diagnostic port is separate and binds to localhost only. This keeps the model gateway out of the public network path.

## Agent boundary

Cloudflare OS owns the agent loop and tool definitions such as creating a Gadget, writing or editing files, and executing code. LiteLLM only provides model access; it does not turn a normal chat request into an agent by itself.

## Source boundary

The wrapper pins the upstream source revision recorded in THIRD-PARTY-NOTICES.md. The upstream license remains in upstream/cloudflare-os/LICENSE. This repository is an unofficial local integration.
