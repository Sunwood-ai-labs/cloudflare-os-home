# Contributing

Thanks for helping make this local lab more reproducible.

## Before opening a change

- Read [README.md](README.md), [SECURITY.md](SECURITY.md), and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- Never commit credentials, `.env`, AWS profiles, Workspace IDs, private hostnames, or personal screenshots.
- Keep upstream source changes clearly separated from wrapper, Compose, LiteLLM, and documentation changes.
- Preserve the upstream license and attribution when touching `upstream/cloudflare-os/`.

## Local checks

From the repository root:

```powershell
docker compose config --quiet
node --check .\qa\agentic-gadget-smoke.mjs
Set-Location docs
npm ci
npm run docs:build
```

If Docker Desktop's Linux engine is unavailable, report that limitation and run the documentation and syntax checks that do not require containers.

## Pull requests

Describe the user-visible result, the files changed, and the checks you ran. Include sanitized screenshots only when they explain a UI or visual change.
