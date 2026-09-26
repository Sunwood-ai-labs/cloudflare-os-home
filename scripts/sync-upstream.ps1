param(
  [string]$RemoteUrl = 'https://github.com/cloudflare/cloudflare-os.git',
  [string]$Ref = 'main'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot

try {
  git fetch $RemoteUrl $Ref
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to fetch $Ref from $RemoteUrl"
  }

  $sha = (git rev-parse FETCH_HEAD).Trim()
  Write-Output "Syncing upstream/cloudflare-os to $sha ..."

  git rm -rf --cached --quiet upstream/cloudflare-os
  if (Test-Path 'upstream/cloudflare-os') {
    Remove-Item -Recurse -Force 'upstream/cloudflare-os'
  }

  git read-tree --prefix=upstream/cloudflare-os/ -u $sha
  if ($LASTEXITCODE -ne 0) {
    throw "git read-tree failed for $sha"
  }

  # Re-apply the Cloudflare OS Home local container overlay to scripts/run-dev-server.ts.
  node -e '
    const fs = require("node:fs");
    const file = "upstream/cloudflare-os/scripts/run-dev-server.ts";
    let src = fs.readFileSync(file, "utf8");

    if (!src.includes("CFOS_DISABLE_DEV_WATCHERS")) {
      src = src.replace(
        "let stoppingDevWatchers = false;\n",
        "let stoppingDevWatchers = false;\nconst disableDevWatchers = process.env.CFOS_DISABLE_DEV_WATCHERS === \"true\";\n"
      );
      src = src.replace(
        /for \(const gk of gatekeepers\) \{\n  \/\/ Configurator UI[\s\S]*?\n\}\n/,
        match => `if (!disableDevWatchers) {\n${match.replace(/^(?=.+)/gm, "  ")}}\n`
      );
      src = src.replace(
        "await waitForPort(Number(wranglerPort ?? DEFAULT_WRANGLER_PORT), 60_000);\nif (wranglerChild.exitCode === null) startDeferredWatchers();",
        "if (!disableDevWatchers) {\n  await waitForPort(Number(wranglerPort ?? DEFAULT_WRANGLER_PORT), 60_000);\n  if (wranglerChild.exitCode === null) startDeferredWatchers();\n}"
      );
    }

    if (!src.includes("process.env.PUBLIC_BASE_URL")) {
      const target = "  config.vars.BASE_URL = `http://${backendHost}/gatekeeper/${gk.name.slice(\"gatekeeper-\".length)}`;\n";
      const replacement = target +
        "  if (process.env.PUBLIC_BASE_URL) {\n" +
        "    const origin = process.env.PUBLIC_BASE_URL.replace(/\\/+$/, \"\");\n" +
        "    config.vars.BASE_URL = `${origin}/gatekeeper/${gk.name.slice(\"gatekeeper-\".length)}`;\n" +
        "  }\n";
      src = src.replace(target, replacement);
    }

    if (!src.includes("WRANGLER_DEV_IP")) {
      const target = "console.log(`\\nStarting: wrangler dev ${args.join(\" \")}\\n`);";
      const replacement =
        "const wranglerDevIp = process.env.WRANGLER_DEV_IP;\n" +
        "if (wranglerDevIp) {\n" +
        "  args.push(\"--ip\", wranglerDevIp);\n" +
        "}\n" +
        target;
      src = src.replace(target, replacement);
    }

    fs.writeFileSync(file, src);
  '

  git add upstream/cloudflare-os/scripts/run-dev-server.ts

  # Update pinned commit in THIRD-PARTY-NOTICES.md.
  node -e '
    const fs = require("node:fs");
    const sha = process.argv[1];
    const file = "THIRD-PARTY-NOTICES.md";
    const text = fs.readFileSync(file, "utf8").replace(
      /upstream commit `[0-9a-f]{40}`/,
      `upstream commit \`${sha}\``
    );
    fs.writeFileSync(file, text);
  ' $sha

  Write-Output "UPSTREAM_SYNCED_SHA=$sha"
} finally {
  Pop-Location
}
