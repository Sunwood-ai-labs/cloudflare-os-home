#!/usr/bin/env node
// Optional compatibility smoke: REAL native CLI, SYNTHETIC loopback model and
// MCP fixtures. No provider requests, host credentials or shared config files.
// Run manually: node agent-runner/native-mcp-smoke.mjs [--claude-binary PATH]
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline'
import { buildAcpMcpServers, buildClaudeMcpArgs, buildMcpBridgeEnv } from './mcp-config.mjs'

const MARKER = 'CFOS_NATIVE_MCP_FIXTURE_漢字_42'

function stopChild(child) {
  if (!child?.pid) return
  try {
    if (process.platform === 'win32') child.kill()
    else process.kill(-child.pid, 'SIGKILL')
  } catch { child.kill() }
  child.stdin?.destroy()
  child.stdout?.destroy()
  child.stderr?.destroy()
}

function isolatedEnvironment(directory) {
  const out = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC)$/i.test(name)))
  for (const subdirectory of ['appdata', 'localappdata', 'claude', 'codex', 'hermes']) {
    mkdirSync(join(directory, subdirectory), { recursive: true })
  }
  return {
    ...out, HOME: directory, USERPROFILE: directory,
    APPDATA: join(directory, 'appdata'), LOCALAPPDATA: join(directory, 'localappdata'),
    TEMP: directory, TMP: directory, TERM: 'dumb', LANG: 'C.UTF-8', NO_COLOR: '1',
    CLAUDE_CONFIG_DIR: join(directory, 'claude'), CODEX_HOME: join(directory, 'codex'),
    ANTHROPIC_API_KEY: 'fixture-dummy-api-key',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1',
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendAnthropic(res, { id, content, stop_reason, stream }) {
  const message = {
    id, type: 'message', role: 'assistant', model: 'cfos-mock-model', content,
    stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
  }
  if (!stream) return sendJson(res, 200, message)
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
  event('message_start', { message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })
  for (const [index, block] of content.entries()) {
    if (block.type === 'tool_use') {
      event('content_block_start', { index, content_block: { ...block, input: {} } })
      event('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })
    } else {
      event('content_block_start', { index, content_block: { type: 'text', text: '' } })
      event('content_block_delta', { index, delta: { type: 'text_delta', text: block.text } })
    }
    event('content_block_stop', { index })
  }
  event('message_delta', { delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 10 } })
  event('message_stop', {})
  res.end()
}

export async function runNativeMcpSmoke({ claudeBinary = 'claude', timeoutMs = 60_000 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'cfos-native-mcp-'))
  const childEnv = isolatedEnvironment(directory)
  const token = randomUUID()
  const observations = { modelRequests: 0, mcpCalls: 0, consumedToolResult: false, advertisedTool: false }
  let child
  const server = createServer(async (req, res) => {
    try {
      let wire = ''
      for await (const chunk of req) wire += chunk.toString()
      const body = wire ? JSON.parse(wire) : {}
      const path = new URL(req.url, 'http://127.0.0.1').pathname
      if (path === '/mcp/smoke') {
        if (req.headers.authorization !== `Bearer ${token}`) return sendJson(res, 401, {})
        if (!Object.hasOwn(body, 'id')) { res.writeHead(204); res.end(); return }
        let result
        if (body.method === 'initialize') result = {
          protocolVersion: body.params.protocolVersion, capabilities: { tools: {} },
          serverInfo: { name: 'cfos-native-mcp-fixture', version: '1.0.0' },
        }
        else if (body.method === 'tools/list') result = { tools: [{
          name: 'describeBinding', description: 'Return the local compatibility fixture marker.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        }] }
        else if (body.method === 'tools/call' && body.params.name === 'describeBinding') {
          observations.mcpCalls++
          result = { content: [{ type: 'text', text: MARKER }] }
        }
        else if (body.method === 'ping') result = {}
        else return sendJson(res, 200, { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Unsupported fixture method' } })
        return sendJson(res, 200, { jsonrpc: '2.0', id: body.id, result })
      }
      if (path.endsWith('/messages/count_tokens')) return sendJson(res, 200, { input_tokens: 10 })
      if (path.endsWith('/messages')) {
        observations.modelRequests++
        const advertised = (body.tools ?? []).find(tool => tool.name === 'mcp__cloudflare_os__describeBinding')
        observations.advertisedTool ||= Boolean(advertised)
        const toolResult = (body.messages ?? []).flatMap(message => Array.isArray(message.content) ? message.content : [])
          .find(block => block.type === 'tool_result' && JSON.stringify(block.content).includes(MARKER))
        observations.consumedToolResult ||= Boolean(toolResult)
        if (toolResult) return sendAnthropic(res, {
          id: 'msg_fixture_done', content: [{ type: 'text', text: `Verified ${MARKER}` }], stop_reason: 'end_turn', stream: body.stream,
        })
        if (!advertised) return sendAnthropic(res, {
          id: 'msg_fixture_no_mcp', content: [{ type: 'text', text: 'Expected fixture MCP tool is absent' }], stop_reason: 'end_turn', stream: body.stream,
        })
        return sendAnthropic(res, {
          id: `msg_fixture_tool_${observations.modelRequests}`,
          content: [{ type: 'tool_use', id: `tool_fixture_${observations.modelRequests}`, name: advertised.name, input: {} }],
          stop_reason: 'tool_use', stream: body.stream,
        })
      }
      sendJson(res, 404, { error: { type: 'not_found_error', message: 'Unknown fixture route' } })
    } catch { if (!res.writableEnded) sendJson(res, 500, { error: { message: 'Fixture request failed' } }) }
  })
  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolveListen)
    })
    const base = `http://127.0.0.1:${server.address().port}`
    const bridge = { endpoint: `${base}/mcp/smoke`, token }
    Object.assign(childEnv, buildMcpBridgeEnv(bridge), { ANTHROPIC_BASE_URL: base })
    const version = spawnSync(claudeBinary, ['--version'], {
      env: childEnv, cwd: directory, encoding: 'utf8', timeout: 10_000,
    })
    if (version.error || version.status !== 0) throw new Error('Claude CLI version check failed')
    const args = ['-p', '--output-format', 'json', '--model', 'cfos-mock-model',
      '--permission-mode', 'acceptEdits', '--max-turns', '3', ...buildClaudeMcpArgs(bridge)]
    const result = await new Promise((resolveChild, reject) => {
      child = spawn(claudeBinary, args, { env: childEnv, cwd: directory, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true })
      let stdout = '', stderr = ''
      const timer = setTimeout(() => { stopChild(child); reject(new Error('Native compatibility smoke timed out')) }, timeoutMs)
      child.stdout.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000) })
      child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 10_000) stderr = stderr.slice(-10_000) })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('close', code => { clearTimeout(timer); resolveChild({ code, stdout, stderr }) })
      child.stdin.end('Call the cloudflare_os describeBinding MCP tool and report its exact returned fixture marker.')
    })
    let final
    try { final = JSON.parse(result.stdout.trim().split('\n').at(-1)) } catch {}
    const success = result.code === 0 && !final?.is_error && observations.mcpCalls > 0
      && observations.consumedToolResult && String(final?.result ?? '').includes(MARKER)
    return {
      agent: 'Claude Code', version: version.stdout.trim(), model: 'synthetic loopback Anthropic fixture',
      success, ...observations, exitCode: result.code,
      ...(success ? {} : { error: String(final?.result ?? result.stderr ?? 'Unexpected native result').slice(-600) }),
    }
  } finally {
    stopChild(child)
    server.closeAllConnections()
    await new Promise(resolveClose => server.close(resolveClose))
    const expectedPrefix = resolve(tmpdir()) + sep + 'cfos-native-mcp-'
    if (!resolve(directory).startsWith(expectedPrefix)) throw new Error('Temporary directory validation failed')
    rmSync(directory, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 })
  }
}

export async function runNativeHermesMcpSmoke({ hermesBinary = 'hermes', timeoutMs = 60_000 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'cfos-native-mcp-'))
  const childEnv = isolatedEnvironment(directory)
  childEnv.HERMES_HOME = join(directory, 'hermes')
  const token = randomUUID()
  const observations = { modelRequests: 0, mcpCalls: 0, consumedToolResult: false, advertisedTool: false, permissionRequests: [], mcpRequests: [], modelToolNames: [] }
  let child, output = '', stderr = ''
  const pending = new Map()
  const server = createServer(async (req, res) => {
    try {
      let wire = ''
      for await (const chunk of req) wire += chunk.toString()
      const body = wire ? JSON.parse(wire) : {}
      const path = new URL(req.url, 'http://127.0.0.1').pathname
      if (path === '/mcp/smoke') {
        observations.mcpRequests.push(body.method)
        if (req.headers.authorization !== `Bearer ${token}`) return sendJson(res, 401, {})
        if (!Object.hasOwn(body, 'id')) { res.writeHead(204); res.end(); return }
        let result
        if (body.method === 'initialize') result = {
          protocolVersion: body.params.protocolVersion, capabilities: { tools: {} },
          serverInfo: { name: 'cfos-native-mcp-fixture', version: '1.0.0' },
        }
        else if (body.method === 'tools/list') result = { tools: [{
          name: 'describeBinding', description: 'Return the local compatibility fixture marker.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        }] }
        else if (body.method === 'tools/call' && body.params.name === 'describeBinding') {
          observations.mcpCalls++
          result = { content: [{ type: 'text', text: MARKER }] }
        }
        else if (body.method === 'ping') result = {}
        else return sendJson(res, 200, { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Unsupported fixture method' } })
        return sendJson(res, 200, { jsonrpc: '2.0', id: body.id, result })
      }
      if (path.endsWith('/models')) return sendJson(res, 200, { object: 'list', data: [{ id: 'cfos-mock-model', object: 'model', owned_by: 'fixture' }] })
      if (path.endsWith('/chat/completions')) {
        observations.modelRequests++
        observations.modelToolNames = (body.tools ?? []).map(t => t.function?.name).filter(Boolean)
        const tool = (body.tools ?? []).find(t => t.function?.name?.includes('cloudflare_os') && t.function.name.endsWith('describeBinding'))
        observations.advertisedTool ||= Boolean(tool)
        const consumed = (body.messages ?? []).some(m => m.role === 'tool' && JSON.stringify(m.content).includes(MARKER))
        observations.consumedToolResult ||= consumed
        const message = consumed ? { role: 'assistant', content: `Verified ${MARKER}` }
          : tool ? { role: 'assistant', content: null, tool_calls: [{ id: `call_fixture_${observations.modelRequests}`, type: 'function', function: { name: tool.function.name, arguments: '{}' } }] }
          : { role: 'assistant', content: 'Expected fixture MCP tool is absent' }
        const finish_reason = message.tool_calls ? 'tool_calls' : 'stop'
        const common = { id: `chatcmpl_fixture_${observations.modelRequests}`, model: 'cfos-mock-model', created: 0 }
        if (!body.stream) return sendJson(res, 200, {
          ...common, object: 'chat.completion', choices: [{ index: 0, message, finish_reason }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        })
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        const delta = message.tool_calls ? { role: 'assistant', tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) } : message
        res.write(`data: ${JSON.stringify({ ...common, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
        res.write(`data: ${JSON.stringify({ ...common, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`)
        res.end('data: [DONE]\n\n')
        return
      }
      sendJson(res, 404, { error: { message: 'Unknown fixture route' } })
    } catch { if (!res.writableEnded) sendJson(res, 500, { error: { message: 'Fixture request failed' } }) }
  })
  let timer
  try {
    await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen) })
    const base = `http://127.0.0.1:${server.address().port}`
    writeFileSync(join(childEnv.HERMES_HOME, 'config.yaml'), [
      'model:', '  default: cfos-mock-model', '  provider: custom', `  base_url: ${base}/v1`, '  api_key: fixture-dummy-api-key',
      'providers:', '  fixture:', `    base_url: ${base}/v1`, '    api_key: fixture-dummy-api-key',
      'memory:', '  memory_enabled: false', '  user_profile_enabled: false', '',
    ].join('\n'), { mode: 0o600 })
    const version = spawnSync(hermesBinary, ['--version'], { env: childEnv, cwd: directory, encoding: 'utf8', timeout: 10_000 })
    if (version.error || version.status !== 0) throw new Error('Hermes CLI version check failed')
    child = spawn(hermesBinary, ['acp'], { env: childEnv, cwd: directory, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true })
    const send = message => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n')
    let nextId = 1
    const request = (method, params) => new Promise((resolveRequest, reject) => {
      const id = nextId++
      pending.set(id, { resolve: resolveRequest, reject })
      send({ id, method, params })
    })
    const lines = createInterface({ input: child.stdout })
    lines.on('line', line => {
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
        observations.permissionRequests.push({ toolCall, options: message.params?.options })
        const fixtureTool = JSON.stringify(toolCall).includes('describeBinding') && JSON.stringify(toolCall).includes('cloudflare_os')
        const option = message.params?.options?.find(o => o.kind === (fixtureTool ? 'allow_once' : 'reject_once'))
        send({ id: message.id, result: { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } } })
      } else if (message.id !== undefined && message.method) send({ id: message.id, error: { code: -32601, message: 'Unsupported fixture client method' } })
    })
    child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 8000) stderr = stderr.slice(-8000) })
    const fail = error => { for (const wait of pending.values()) wait.reject(error); pending.clear() }
    child.on('error', fail)
    child.on('close', code => fail(new Error(`Hermes ACP exited ${code}: ${stderr.slice(-1000)}`)))
    timer = setTimeout(() => { stopChild(child); fail(new Error('Native Hermes compatibility smoke timed out')) }, timeoutMs)
    await request('initialize', { protocolVersion: 1, clientInfo: { name: 'cfos-native-fixture', version: '1.0.0' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } })
    const session = await request('session/new', { cwd: directory, mcpServers: buildAcpMcpServers({ endpoint: `${base}/mcp/smoke`, token }) })
    await request('session/set_model', { sessionId: session.sessionId, modelId: 'custom:fixture:cfos-mock-model' })
    await request('session/load', { sessionId: session.sessionId, cwd: directory,
      mcpServers: buildAcpMcpServers({ endpoint: `${base}/mcp/smoke`, token }) })
    await request('session/prompt', { sessionId: session.sessionId, prompt: [{ type: 'text', text: 'Call the cloudflare_os describeBinding MCP tool and report its exact returned fixture marker.' }] })
    const success = observations.mcpCalls > 0 && observations.consumedToolResult && output.includes(MARKER)
    const { mcpRequests, modelToolNames, ...summary } = observations
    return { agent: 'Hermes Agent', version: version.stdout.trim().split('\n')[0], model: 'synthetic loopback OpenAI fixture', success, ...summary,
      mcpToolName: modelToolNames.find(name => name.includes('cloudflare_os')),
      ...(success ? {} : { error: (output || stderr).slice(-1000), diagnostics: stderr.slice(-1500), mcpRequests, modelToolNames }) }
  } finally {
    clearTimeout(timer)
    stopChild(child)
    server.closeAllConnections()
    await new Promise(resolveClose => server.close(resolveClose))
    const expectedPrefix = resolve(tmpdir()) + sep + 'cfos-native-mcp-'
    if (!resolve(directory).startsWith(expectedPrefix)) throw new Error('Temporary directory validation failed')
    rmSync(directory, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = process.argv.indexOf('--claude-binary')
  const agentFlag = process.argv.indexOf('--agent')
  const agent = agentFlag >= 0 ? process.argv[agentFlag + 1] : 'claude'
  try {
    const result = agent === 'hermes' ? await runNativeHermesMcpSmoke()
      : agent === 'codex' ? await (await import('./native-codex-mcp-smoke.mjs')).runNativeCodexMcpSmoke({ readOnlyHint: !process.argv.includes('--write-tool') })
      : await runNativeMcpSmoke({ claudeBinary: flag >= 0 ? process.argv[flag + 1] : 'claude' })
    process.stdout.write(JSON.stringify(result) + '\n')
    if (!result.success) process.exitCode = 1
  } catch (error) {
    process.stdout.write(JSON.stringify({ success: false, error: error.message }) + '\n')
    process.exitCode = 1
  }
}
