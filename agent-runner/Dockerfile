FROM node:24-bookworm-slim

ARG CLAUDE_CODE_VERSION=2.1.283
ARG CODEX_VERSION=0.157.1
ARG HERMES_AGENT_VERSION=0.19.0

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git ripgrep tini python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" "@openai/codex@${CODEX_VERSION}" \
    && npm cache clean --force \
    && python3 -m venv /opt/hermes \
    && /opt/hermes/bin/pip install --no-cache-dir "hermes-agent[acp,mcp]==${HERMES_AGENT_VERSION}" \
    && ln -s /opt/hermes/bin/hermes /usr/local/bin/hermes \
    && mkdir -p /agents/codex /agents/state /workspace

COPY server.mjs codex-env.mjs pi-mcp-session.mjs mcp-config.mjs mcp-proxy.mjs native-mcp-smoke.mjs native-codex-mcp-smoke.mjs native-antigravity-mcp-smoke.mjs /app/

ENV CODEX_HOME=/agents/codex \
    AGENT_RUNNER_PORT=4100

WORKDIR /workspace
EXPOSE 4100
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/server.mjs"]
