FROM node:24-bookworm-slim

ENV CI=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates procps tini \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.17.0 \
    && mkdir -p /pnpm /workspace

WORKDIR /workspace

COPY upstream/cloudflare-os/ /workspace/

# Restore relative .d.ts symlinks when the host checkout used git core.symlinks=false (e.g. Windows).
RUN node -e ' \
  const fs = require("node:fs"); \
  const path = require("node:path"); \
  function walk(dir) { \
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { \
      const full = path.join(dir, entry.name); \
      if (entry.isDirectory()) walk(full); \
      else if (entry.isFile() && entry.name.endsWith(".txt")) { \
        const target = fs.readFileSync(full, "utf8").trim(); \
        if (/^[\w.-]+\.d\.ts$/.test(target) && fs.existsSync(path.join(dir, target))) { \
          fs.unlinkSync(full); \
          fs.symlinkSync(target, full); \
        } \
      } \
    } \
  } \
  walk("/workspace/packages"); \
'

RUN pnpm install --frozen-lockfile \
    && pnpm exec vp run --no-cache @gadgets/typed-storage#build \
    && pnpm exec vp run --no-cache @gadgets/workshop-frontend#build:assets \
    && pnpm exec vp run -r --no-cache build:configurator --dev \
    && pnpm exec vp run -r --no-cache build:app:dev \
    && node packages/workshop-backend/scripts/build-bundled-blueprints.ts

EXPOSE 8877

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "run-local"]
