import { buildMcpBridgeEnv } from './mcp-config.mjs'

// Codex uses the mounted ChatGPT login, not the runner's provider/API keys.
// Keep this list explicit: denylisting secret-looking names misses new keys and
// innocently named secrets, as well as startup injection (NODE_OPTIONS, etc.).
const RUNTIME_NAMES = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
  'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'NO_COLOR',
])
const NETWORK_NAMES = new Set([
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
])

function runtimeEnv(source) {
  const result = {}
  for (const [name, value] of Object.entries(source)) {
    if (RUNTIME_NAMES.has(name.toUpperCase()) && typeof value === 'string') result[name.toUpperCase()] = value
  }
  return result
}

export function buildCodexEnv(source, bridge, codexHome = '/agents/codex') {
  const result = runtimeEnv(source)
  // Network/proxy settings can be needed for ChatGPT login and token refresh.
  // They belong to the CLI transport only, never its model-invoked tool shells.
  for (const [name, value] of Object.entries(source)) {
    if (NETWORK_NAMES.has(name.toUpperCase()) && typeof value === 'string') result[name] = value
  }
  return { ...result, CODEX_HOME: codexHome, ...buildMcpBridgeEnv(bridge) }
}

export function buildCodexShellEnvArgs(source) {
  const safe = runtimeEnv(source)
  // A non-empty include_only also removes any extra `set` entries merged from
  // local Codex config. Explicit values win over configured runtime overrides.
  safe.PATH ??= '/usr/local/bin:/usr/bin:/bin'
  const set = '{' + Object.entries(safe).map(([name, value]) => `${JSON.stringify(name)}=${JSON.stringify(value)}`).join(',') + '}'
  return [
    '-c', 'shell_environment_policy.inherit="none"',
    '-c', 'shell_environment_policy.ignore_default_excludes=false',
    '-c', 'shell_environment_policy.experimental_use_profile=false',
    '-c', 'shell_environment_policy.exclude=[]',
    '-c', `shell_environment_policy.include_only=${JSON.stringify(Object.keys(safe))}`,
    '-c', `shell_environment_policy.set=${set}`,
  ]
}
