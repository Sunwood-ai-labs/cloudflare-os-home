FROM node:24-bookworm-slim

ENV CI=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN apt-get update \
    && apt-get install --yes --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.17.0 \
    && mkdir -p /pnpm /workspace

WORKDIR /workspace

COPY upstream/cloudflare-os/ /workspace/

RUN pnpm install --frozen-lockfile

EXPOSE 8787

CMD ["pnpm", "run-local"]
