#!/usr/bin/env node
// Optional REAL Antigravity ACP/OAuth-provider smoke with a harmless local MCP
// marker. Credential source is only copied into a private disposable profile.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { buildAcpMcpServers, buildMcpBridgeEnv } from './mcp-config.mjs'

const MARKER = 'CFOS_ANTIGRAVITY_NATIVE_MCP_VERIFIED_42'

export async function runNativeAntigravityMcpSmoke({
  runtime = '/agents/antigravity-runtime', profileSource = '/agents/antigravity-profile-source',
  model = process.env.ANTIGRAVITY_MODEL, registerOnly = false, timeoutMs = 720_000,
} = {}) {
  const executable = join(runtime, 'agy_acp_server.par')
  const sourceToken = join(profileSource, 'antigravity-acp', 'acp_token.json')
  if (!existsSync(executable) || !existsSync(sourceToken)) throw new Error('Antigravity runtime or read-only source profile is absent')
  const original = statSync(sourceToken)
  const directory = mkdtempSync(join(tmpdir(), 'cfos-native-antigravity-'))
  const profile = join(directory, 'profile'), cwd = join(directory, 'workspace')
  mkdirSync(join(profile, 'antigravity-acp'), { recursive: true, mode: 0o700 })
  mkdirSync(cwd, { recursive: true })
  copyFileSync(sourceToken, join(profile, 'antigravity-acp', 'acp_token.json'))
  writeFileSync(join(profile, 'antigravity-acp', 'settings.json'), JSON.stringify({ auth: { type: 'oauth-personal' } }), { mode: 0o600 })
  const token = randomUUID()
  const observations = { initialized: false, mcpRegistered: false, mcpCalls: 0, permissionRequests: [] }
  let child, timer, output = '', stderr = ''
  const pending = new Map()
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end(); return }
      let wire = ''
      for await (const chunk of req) wire += chunk.toString()
      const body = JSON.parse(wire)
      if (!Object.hasOwn(body, 'id')) { res.writeHead(204); res.end(); return }
      let result
      if (body.method === 'initialize') result = { protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'cfos-antigravity-native-fixture', version: '1.0.0' } }
      else if (body.method === 'tools/list') {
        observations.mcpRegistered = true
        result = { tools: [{ name: 'describeBinding', description: 'Return the harmless local MCP verification marker. No external services or file writes.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }] }
      } else if (body.method === 'tools/call' && body.params.name === 'describeBinding') {
        observations.mcpCalls++
        result = { content: [{ type: 'text', text: MARKER }] }
      } else if (body.method === 'ping') result = {}
      else {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Unsupported fixture method' } }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }))
    } catch { if (!res.writableEnded) { res.writeHead(500); res.end('{}') } }
  })
  const stop = () => {
    if (!child?.pid) return
    try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill() }
    child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy()
  }
  try {
    await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen) })
    const bridge = { endpoint: `http://127.0.0.1:${server.address().port}/mcp/smoke`, token }
    const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|LD_LIBRARY_PATH|LANG|LC_ALL|SYSTEMROOT|WINDIR)$/i.test(name)))
    Object.assign(environment, { ...buildMcpBridgeEnv(bridge), HOME: directory, TMPDIR: directory,
      GEMINI_HOME: profile, AGY_ACP_FORCE_FILE_STORAGE: '1', ANTIGRAVITY_HARNESS_PATH: join(runtime, 'localharness_external'),
      BROWSER: '/bin/true', PYTHONUNBUFFERED: '1', ELECTRON_RUN_AS_NODE: '1' })
    child = spawn(executable, ['--uid='], { cwd, env: environment, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let nextId = 1
    const send = message => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n')
    const request = (method, params) => new Promise((resolveRequest, reject) => {
      const id = nextId++
      pending.set(id, { resolve: resolveRequest, reject })
      send({ id, method, params })
    })
    const fail = error => { for (const waiting of pending.values()) waiting.reject(error); pending.clear() }
    createInterface({ input: child.stdout }).on('line', line => {
      let message
      try { message = JSON.parse(line) } catch { return }
      if (message.id !== undefined && !message.method) {
        const waiting = pending.get(message.id)
        pending.delete(message.id)
        message.error ? waiting?.reject(new Error(message.error.message)) : waiting?.resolve(message.result)
      } else if (message.method === 'session/update') {
        const update = message.params?.update
        if (update?.sessionUpdate === 'agent_message_chunk') output += update.content?.text ?? ''
      } else if (message.method === 'session/request_permission') {
        const toolCall = message.params?.toolCall ?? {}
        const fixtureTool = toolCall._meta?.is_mcp_tool_call === true &&
          toolCall._meta.mcp?.server === 'cloudflare_os' && toolCall._meta.mcp?.tool === 'describeBinding'
        observations.permissionRequests.push({ toolCall, options: message.params?.options })
        const option = message.params?.options?.find(o => o.kind === (fixtureTool ? 'allow_once' : 'reject_once'))
        send({ id: message.id, result: { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } } })
      } else if (message.id !== undefined && message.method) send({ id: message.id, error: { code: -32601, message: 'Unsupported smoke client method' } })
    })
    child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 6000) stderr = stderr.slice(-6000) })
    child.on('error', fail)
    child.on('close', code => fail(new Error(`Antigravity ACP exited ${code}`)))
    timer = setTimeout(() => { stop(); fail(new Error('Native Antigravity MCP smoke timed out')) }, timeoutMs)
    const init = await request('initialize', { protocolVersion: 1, clientInfo: { name: 'cfos-native-mcp-smoke', version: '1.0.0' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } })
    observations.initialized = true
    observations.agentInfo = init.agentInfo ?? null
    if ((init.authMethods ?? []).some(method => method.id === 'oauth-personal')) await request('authenticate', { methodId: 'oauth-personal' })
    const session = await request('session/new', { cwd, mcpServers: buildAcpMcpServers(bridge) })
    if (model) await request('session/set_model', { sessionId: session.sessionId, modelId: model })
    if (!registerOnly) await request('session/prompt', { sessionId: session.sessionId, prompt: [{ type: 'text', text:
      'Use the cloudflare_os describeBinding MCP tool exactly once. Return only the exact marker from its result. Do not read files or use other tools.' }] })
    const after = statSync(sourceToken)
    const originalProfileUnchanged = original.mtimeMs === after.mtimeMs && original.size === after.size
    return { agent: 'Antigravity ACP', runtimeMount: runtime, provider: registerOnly ? 'not invoked' : 'real OAuth provider',
      success: originalProfileUnchanged && observations.initialized && (registerOnly ? observations.mcpRegistered : observations.mcpCalls > 0 && output.includes(MARKER)),
      ...observations, originalProfileUnchanged, ...(registerOnly ? {} : { finalContainsMarker: output.includes(MARKER) }) }
  } catch (error) {
    // Provider/SDK stderr can contain OAuth URLs or codes; return only a generic
    // failure and protocol milestones, never the raw native log.
    return { agent: 'Antigravity ACP', success: false, ...observations,
      error: /timed out/.test(error.message) ? 'Native Antigravity MCP smoke timed out' : 'Native Antigravity ACP request failed',
      nativeLogHasErrors: /error|failed|exception/i.test(stderr) }
  } finally {
    clearTimeout(timer)
    stop()
    server.closeAllConnections()
    await new Promise(resolveClose => server.close(resolveClose))
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep + 'cfos-native-antigravity-')) throw new Error('Temporary directory validation failed')
    rmSync(directory, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const get = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
  try {
    const result = await runNativeAntigravityMcpSmoke({ runtime: get('--runtime', '/agents/antigravity-runtime'),
      profileSource: get('--profile-source', '/agents/antigravity-profile-source'), registerOnly: args.includes('--register-only') })
    process.stdout.write(JSON.stringify(result) + '\n')
    if (!result.success) process.exitCode = 1
  } catch { process.stdout.write(JSON.stringify({ success: false, error: 'Antigravity native smoke setup failed' }) + '\n'); process.exitCode = 1 }
}
