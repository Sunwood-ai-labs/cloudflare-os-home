// Request-scoped MCP settings. Credentials stay in the child environment (or ACP
// session IPC), and are never saved to an agent's shared configuration directory.
import { fileURLToPath } from 'node:url'

export const MCP_SERVER_NAME = 'cloudflare_os'
export const MCP_ENV_VARS = ['CFOS_MCP_ENDPOINT', 'CFOS_MCP_TOKEN']

export function validateMcpBridge(bridge) {
  let endpoint
  try { endpoint = new URL(bridge?.endpoint) } catch { throw new Error('Invalid MCP bridge configuration') }
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
      || endpoint.username || endpoint.password || endpoint.hash || endpoint.search
      || typeof bridge.token !== 'string' || !bridge.token || /[\s\x00-\x1f\x7f]/.test(bridge.token)) {
    throw new Error('Invalid MCP bridge configuration')
  }
  return bridge
}

function launcher(bridge) {
  validateMcpBridge(bridge)
  return {
    command: bridge.command ?? process.execPath,
    args: [bridge.proxyPath ?? fileURLToPath(new URL('./mcp-proxy.mjs', import.meta.url))],
  }
}

export function buildMcpBridgeEnv(bridge) {
  if (!bridge) return {}
  validateMcpBridge(bridge)
  return { CFOS_MCP_ENDPOINT: bridge.endpoint, CFOS_MCP_TOKEN: bridge.token }
}

export function buildClaudeMcpArgs(bridge) {
  if (!bridge) return []
  const config = {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: 'stdio', ...launcher(bridge),
        env: Object.fromEntries(MCP_ENV_VARS.map(name => [name, '${' + name + '}'])),
      },
    },
  }
  // Only the bridge MCP is pre-approved here. Pi retains the actual tool
  // execution, approvals and role restrictions; native permissions are intact.
  return ['--strict-mcp-config', '--mcp-config', JSON.stringify(config),
    '--allowedTools', `mcp__${MCP_SERVER_NAME}__*`]
}

export function buildCodexMcpArgs(bridge) {
  if (!bridge) return []
  const toolTimeout = bridge.toolTimeoutSeconds ?? Number(process.env.AGENT_RUNNER_TIMEOUT_SECONDS ?? 900)
  if (!Number.isFinite(toolTimeout) || toolTimeout <= 0) throw new Error('Invalid MCP tool timeout')
  const config = {
    ...launcher(bridge), env_vars: MCP_ENV_VARS,
    startup_timeout_sec: 20,
    tool_timeout_sec: toolTimeout,
    required: true,
    // This local bridge only emits tool calls for Pi to execute. Delegate its
    // approval to Pi's chat grants and write-confirmation flow, as for Claude.
    // Native shell/filesystem tools and other MCP servers retain their policy.
    default_tools_approval_mode: 'approve',
  }
  // Each -c value is a TOML scalar/array parsed by Codex. JSON string and array
  // syntax is valid TOML here, and contains neither the endpoint nor its token.
  return Object.entries(config).flatMap(([key, value]) => [
    '-c', `mcp_servers.${MCP_SERVER_NAME}.${key}=${JSON.stringify(value)}`,
  ])
}

export function buildAcpMcpServers(bridge) {
  if (!bridge) return []
  return [{
    name: MCP_SERVER_NAME, ...launcher(bridge),
    env: Object.entries(buildMcpBridgeEnv(bridge)).map(([name, value]) => ({ name, value })),
  }]
}
