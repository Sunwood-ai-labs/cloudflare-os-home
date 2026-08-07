# Security

This project is intended for local or tailnet-only use.

- Never commit `.env`, `secrets/`, AWS profiles, provider API keys, LiteLLM master keys, or browser credentials.
- Keep Tailscale Serve tailnet-only unless you have deliberately reviewed the exposure and authentication model.
- Browser QA scripts require `CFOS_USERNAME` and `CFOS_PASSWORD` from the environment; credentials are not stored in the repository.
- If a credential is exposed, revoke or rotate it immediately and remove it from the repository history before publishing.

Please do not include private screenshots, workspace IDs, or internal hostnames in issues or pull requests.
