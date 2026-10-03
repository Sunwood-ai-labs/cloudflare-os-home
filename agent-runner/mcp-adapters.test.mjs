import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildAcpMcpServers, buildClaudeMcpArgs, buildCodexMcpArgs, buildMcpBridgeEnv,
} from './mcp-config.mjs'
import { startMcpProxy } from './mcp-proxy.mjs'

const bridge = { endpoint: 'http://127.0.0.1:4100/mcp/request-1', token: 'request-scoped-secret-123' }
const tick = () => new Promise(resolve => setImmediate(resolve))

async function until(predicate) {
  const timeout = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() > timeout) assert.fail('Timed out waiting for fixture result')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

function proxyFixture(t, fetchImpl) {
  const input = new PassThrough(), output = new PassThrough()
  const messages = []
  let wire = ''
  output.on('data', chunk => {
    wire += chunk.toString()
    const lines = wire.split('\n')
    wire = lines.pop()
    for (const line of lines) if (line) messages.push(JSON.parse(line))
  })
  const proxy = startMcpProxy({ input, output, ...bridge, fetchImpl })
  t.after(() => { proxy.close(); input.destroy(); output.destroy() })
  return { input, messages, proxy }
}

test('no bridge leaves every native invocation unchanged', () => {
  assert.deepEqual(buildClaudeMcpArgs(), [])
  assert.deepEqual(buildCodexMcpArgs(), [])
  assert.deepEqual(buildAcpMcpServers(), [])
  assert.deepEqual(buildMcpBridgeEnv(), {})
})

test('Claude config uses credential placeholders and allows only its Pi bridge', () => {
  const args = buildClaudeMcpArgs(bridge)
  const config = JSON.parse(args[args.indexOf('--mcp-config') + 1])
  assert.equal(config.mcpServers.cloudflare_os.type, 'stdio')
  assert.equal(config.mcpServers.cloudflare_os.command, process.execPath)
  assert.deepEqual(config.mcpServers.cloudflare_os.env, {
    CFOS_MCP_ENDPOINT: '${CFOS_MCP_ENDPOINT}', CFOS_MCP_TOKEN: '${CFOS_MCP_TOKEN}',
  })
  assert.ok(args.includes('--strict-mcp-config'))
  assert.equal(args[args.indexOf('--allowedTools') + 1], 'mcp__cloudflare_os__*')
  assert.ok(!args.join(' ').includes(bridge.token))
  assert.ok(!args.join(' ').includes(bridge.endpoint))
  assert.ok(!args.some(arg => /bypassPermissions|skip-permissions|Bash/.test(arg)))
})

test('Codex gets request-only config overrides and explicit environment forwarding', () => {
  const args = buildCodexMcpArgs({ ...bridge, toolTimeoutSeconds: 321 })
  const config = Object.fromEntries(args.filter((_, i) => i % 2).map(value => {
    const at = value.indexOf('=')
    return [value.slice(0, at), JSON.parse(value.slice(at + 1))]
  }))
  assert.equal(config['mcp_servers.cloudflare_os.command'], process.execPath)
  assert.deepEqual(config['mcp_servers.cloudflare_os.env_vars'], ['CFOS_MCP_ENDPOINT', 'CFOS_MCP_TOKEN'])
  assert.equal(config['mcp_servers.cloudflare_os.tool_timeout_sec'], 321)
  assert.equal(config['mcp_servers.cloudflare_os.required'], true)
  assert.equal(config['mcp_servers.cloudflare_os.default_tools_approval_mode'], 'approve')
  assert.ok(Object.keys(config).every(key => key.startsWith('mcp_servers.cloudflare_os.')))
  assert.ok(args.every((arg, i) => i % 2 || arg === '-c'))
  assert.ok(!args.join(' ').includes(bridge.token))
  assert.ok(!args.join(' ').includes(bridge.endpoint))
  assert.ok(!args.some(arg => /approval_policy|sandbox_mode|bypass/.test(arg)))
})

test('Codex tool timeout follows the runner environment', t => {
  const previous = process.env.AGENT_RUNNER_TIMEOUT_SECONDS
  t.after(() => {
    if (previous === undefined) delete process.env.AGENT_RUNNER_TIMEOUT_SECONDS
    else process.env.AGENT_RUNNER_TIMEOUT_SECONDS = previous
  })
  process.env.AGENT_RUNNER_TIMEOUT_SECONDS = '47'
  assert.ok(buildCodexMcpArgs(bridge).includes('mcp_servers.cloudflare_os.tool_timeout_sec=47'))
})

test('Hermes and Antigravity share one valid ACP v1 stdio descriptor', () => {
  const [server] = buildAcpMcpServers(bridge)
  assert.equal(server.name, 'cloudflare_os')
  assert.equal(server.command, process.execPath)
  assert.ok(server.args[0].endsWith('mcp-proxy.mjs'))
  assert.deepEqual(Object.fromEntries(server.env.map(({ name, value }) => [name, value])), buildMcpBridgeEnv(bridge))
  assert.ok(!server.args.join(' ').includes(bridge.token))
})

test('invalid bridge configuration fails without exposing supplied credentials', () => {
  for (const invalid of [
    { ...bridge, endpoint: 'https://remote.example/mcp' },
    { ...bridge, endpoint: 'http://127.0.0.1:4100/mcp?token=secret' },
    { ...bridge, endpoint: 'http://user:secret@127.0.0.1:4100/mcp' },
    { ...bridge, token: 'secret\nvalue' },
  ]) {
    assert.throws(() => buildMcpBridgeEnv(invalid), { message: 'Invalid MCP bridge configuration' })
  }
  assert.throws(() => buildCodexMcpArgs({ ...bridge, toolTimeoutSeconds: NaN }), /Invalid MCP tool timeout/)
})

test('proxy forwards JSON-RPC and auth, preserving tool schemas and results', async t => {
  const requests = []
  const fixture = proxyFixture(t, async (url, options) => {
    const request = JSON.parse(options.body)
    requests.push({ url, options, request })
    return Response.json({ jsonrpc: '2.0', id: request.id, result: {
      tools: [{ name: 'executeCode', inputSchema: { type: 'object', properties: { code: { type: 'string' } } } }],
    } })
  })
  fixture.input.write(JSON.stringify({ jsonrpc: '2.0', id: 'list-1', method: 'tools/list', params: {} }) + '\n')
  await until(() => fixture.messages.length)
  assert.equal(requests[0].url, bridge.endpoint)
  assert.equal(requests[0].options.headers.authorization, `Bearer ${bridge.token}`)
  assert.equal(requests[0].options.redirect, 'error')
  assert.equal(fixture.messages[0].result.tools[0].name, 'executeCode')
  assert.equal(fixture.messages[0].id, 'list-1')
})

test('pending tool calls do not block other MCP requests', async t => {
  let releaseTool
  const fixture = proxyFixture(t, async (_url, options) => {
    const request = JSON.parse(options.body)
    if (request.method === 'tools/call') await new Promise(resolve => { releaseTool = resolve })
    return Response.json({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: 'Pi result' }] } })
  })
  fixture.input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'executeCode', arguments: { code: 'return 1' } } }) + '\n')
  fixture.input.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }) + '\n')
  await until(() => fixture.messages.length === 1)
  assert.equal(fixture.messages[0].id, 2)
  assert.equal(fixture.proxy.pendingRequests, 1)
  releaseTool()
  await until(() => fixture.messages.length === 2)
  assert.equal(fixture.messages[1].id, 1)
})

test('notifications do not produce stdout responses', async t => {
  let called = false
  const fixture = proxyFixture(t, async () => { called = true; return new Response(null, { status: 204 }) })
  fixture.input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  await until(() => called && fixture.proxy.pendingRequests === 0)
  assert.deepEqual(fixture.messages, [])
})

test('malformed input and transport failures use redacted JSON-RPC errors', async t => {
  const fixture = proxyFixture(t, async () => { throw new Error(bridge.endpoint + bridge.token) })
  fixture.input.write('{bad-json}\n')
  fixture.input.write(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' }) + '\n')
  fixture.input.write('[]\n')
  await until(() => fixture.messages.length === 3)
  assert.equal(fixture.messages.find(m => m.id === 9).error.code, -32603)
  assert.ok(fixture.messages.some(m => m.error.code === -32700))
  assert.ok(fixture.messages.some(m => m.error.code === -32600))
  assert.ok(!JSON.stringify(fixture.messages).includes(bridge.token))
  assert.ok(!JSON.stringify(fixture.messages).includes(bridge.endpoint))
})

test('HTTP failures do not expose the server response body', async t => {
  const fixture = proxyFixture(t, async () => new Response(bridge.token, { status: 401 }))
  fixture.input.write(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' }) + '\n')
  await until(() => fixture.messages.length === 1)
  assert.equal(fixture.messages[0].error.message, 'MCP bridge request failed (HTTP 401)')
  assert.ok(!JSON.stringify(fixture.messages).includes(bridge.token))
})

test('mismatched response IDs are rejected', async t => {
  const fixture = proxyFixture(t, async () => Response.json({ jsonrpc: '2.0', id: 999, result: {} }))
  fixture.input.write(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' }) + '\n')
  await until(() => fixture.messages.length === 1)
  assert.equal(fixture.messages[0].id, 4)
  assert.equal(fixture.messages[0].error.message, 'Invalid MCP bridge response')
})

test('UTF-8 arguments survive chunk boundaries on stdin', async t => {
  let code
  const fixture = proxyFixture(t, async (_url, options) => {
    const request = JSON.parse(options.body)
    code = request.params.arguments.code
    return Response.json({ jsonrpc: '2.0', id: request.id, result: {} })
  })
  const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { arguments: { code: '漢字' } } }) + '\n')
  const split = payload.indexOf(Buffer.from('漢')) + 1
  fixture.input.write(payload.subarray(0, split))
  fixture.input.write(payload.subarray(split))
  await until(() => fixture.messages.length === 1)
  assert.equal(code, '漢字')
})

test('stdin shutdown aborts pending HTTP calls', async t => {
  let aborted = false
  const fixture = proxyFixture(t, async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) }, { once: true })
  }))
  fixture.input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call' }) + '\n')
  await tick()
  fixture.input.end()
  await until(() => aborted)
  assert.equal(fixture.proxy.pendingRequests, 0)
  assert.deepEqual(fixture.messages, [])
})

test('real stdio subprocess communicates with a disposable loopback MCP endpoint', async t => {
  const requests = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const message = JSON.parse(body)
    requests.push({ message, auth: req.headers.authorization })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {
      content: [{ type: 'text', text: 'fixture-result-漢字' }],
    } }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const endpoint = `http://127.0.0.1:${server.address().port}/mcp/fixture`
  const child = spawn(process.execPath, [fileURLToPath(new URL('./mcp-proxy.mjs', import.meta.url))], {
    env: { ...process.env, ...buildMcpBridgeEnv({ ...bridge, endpoint }) }, stdio: ['pipe', 'pipe', 'pipe'],
  })
  t.after(() => child.kill())
  let output = '', stderr = ''
  child.stdout.on('data', chunk => { output += chunk.toString() })
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 'fixture', method: 'tools/call', params: { name: 'executeCode', arguments: { code: 'return "漢字"' } } }) + '\n')
  await until(() => output.includes('\n'))
  assert.equal(JSON.parse(output).result.content[0].text, 'fixture-result-漢字')
  assert.equal(requests[0].auth, `Bearer ${bridge.token}`)
  assert.equal(requests[0].message.params.arguments.code, 'return "漢字"')
  child.stdin.end()
  const [exitCode] = await once(child, 'exit')
  assert.equal(exitCode, 0)
  assert.equal(stderr, '')
})
