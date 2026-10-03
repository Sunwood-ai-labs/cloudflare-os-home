#!/usr/bin/env node
// Optional REAL Codex CLI smoke against SYNTHETIC loopback Responses/MCP.
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildCodexMcpArgs, buildMcpBridgeEnv } from './mcp-config.mjs'

const MARKER = 'CFOS_NATIVE_CODEX_MCP_FIXTURE_42'

export async function runNativeCodexMcpSmoke({ codexBinary = 'codex', timeoutMs = 60_000, readOnlyHint = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'cfos-native-codex-'))
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC)$/i.test(name)))
  Object.assign(environment, { HOME: directory, USERPROFILE: directory, APPDATA: directory, LOCALAPPDATA: directory,
    CODEX_HOME: directory, TEMP: directory, TMP: directory, TERM: 'dumb', NO_COLOR: '1', LANG: 'C.UTF-8' })
  const token = randomUUID()
  const observations = { modelRequests: 0, mcpCalls: 0, consumedToolResult: false, advertisedTool: false }
  let child
  const server = createServer(async (req, res) => {
    try {
      let wire = ''
      for await (const chunk of req) wire += chunk.toString()
      const body = wire ? JSON.parse(wire) : {}
      const path = new URL(req.url, 'http://127.0.0.1').pathname
      const json = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }
      if (path === '/mcp/smoke') {
        if (req.headers.authorization !== `Bearer ${token}`) return json(401, {})
        if (!Object.hasOwn(body, 'id')) { res.writeHead(204); res.end(); return }
        let result
        if (body.method === 'initialize') result = { protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } }
        else if (body.method === 'tools/list') result = { tools: [{ name: 'describeBinding', description: 'Return the fixture marker.', inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          ...(readOnlyHint === null ? {} : { annotations: { readOnlyHint, destructiveHint: false, openWorldHint: false } }) }] }
        else if (body.method === 'tools/call' && body.params.name === 'describeBinding') {
          observations.mcpCalls++
          result = { content: [{ type: 'text', text: MARKER }] }
        } else if (body.method === 'ping') result = {}
        else return json(200, { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Unsupported fixture method' } })
        return json(200, { jsonrpc: '2.0', id: body.id, result })
      }
      if (!path.endsWith('/responses')) return json(404, { error: { message: 'Unknown fixture route' } })
      observations.modelRequests++
      const tools = (body.tools ?? []).flatMap(tool => tool.type === 'namespace'
        ? tool.tools.map(t => ({ ...t, namespace: tool.name })) : [tool])
      const tool = tools.find(t => (t.name?.includes('cloudflare_os') || t.namespace?.includes('cloudflare_os')) && t.name?.endsWith('describeBinding'))
      observations.advertisedTool ||= Boolean(tool)
      const consumed = (body.input ?? []).some(item => item.type === 'function_call_output' && JSON.stringify(item.output).includes(MARKER))
      observations.consumedToolResult ||= consumed
      const responseId = `resp_fixture_${observations.modelRequests}`
      const item = consumed ? { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: `Verified ${MARKER}`, annotations: [] }] }
        : tool ? { id: 'fc_fixture', type: 'function_call', call_id: 'call_fixture', name: tool.name, arguments: '{}', ...(tool.namespace ? { namespace: tool.namespace } : {}) }
        : { id: 'msg_fixture_missing', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Expected fixture MCP tool is absent', annotations: [] }] }
      const response = { id: responseId, object: 'response', created_at: 0, status: 'in_progress', model: body.model, output: [] }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      let sequence = 0
      const event = (type, value) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...value })}\n\n`)
      event('response.created', { response })
      event('response.output_item.added', { output_index: 0, item: item.type === 'function_call' ? { ...item, arguments: '' } : { ...item, content: [], status: 'in_progress' } })
      if (item.type === 'function_call') {
        event('response.function_call_arguments.delta', { item_id: item.id, output_index: 0, delta: '{}' })
        event('response.function_call_arguments.done', { item_id: item.id, output_index: 0, arguments: '{}' })
      } else {
        event('response.content_part.added', { item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
        event('response.output_text.delta', { item_id: item.id, output_index: 0, content_index: 0, delta: item.content[0].text })
        event('response.output_text.done', { item_id: item.id, output_index: 0, content_index: 0, text: item.content[0].text })
        event('response.content_part.done', { item_id: item.id, output_index: 0, content_index: 0, part: item.content[0] })
      }
      event('response.output_item.done', { output_index: 0, item })
      event('response.completed', { response: { ...response, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } })
      res.end()
    } catch { if (!res.writableEnded) { res.writeHead(500); res.end('{}') } }
  })
  const stop = () => {
    if (!child?.pid) return
    try { process.platform === 'win32' ? child.kill() : process.kill(-child.pid, 'SIGKILL') } catch { child.kill() }
    child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy()
  }
  try {
    await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen) })
    const base = `http://127.0.0.1:${server.address().port}`
    const bridge = { endpoint: `${base}/mcp/smoke`, token, toolTimeoutSeconds: 45 }
    Object.assign(environment, buildMcpBridgeEnv(bridge))
    const version = spawnSync(codexBinary, ['--version'], { env: environment, cwd: directory, encoding: 'utf8', timeout: 10_000 })
    if (version.error || version.status !== 0) throw new Error('Codex CLI version check failed')
    const overrides = { model_provider: 'cfos_fixture', 'model_providers.cfos_fixture.name': 'CFOS synthetic fixture',
      'model_providers.cfos_fixture.base_url': `${base}/v1`, 'model_providers.cfos_fixture.wire_api': 'responses',
      'model_providers.cfos_fixture.requires_openai_auth': false }
    const args = ['exec', '--skip-git-repo-check', '--ephemeral', '--color', 'never', '--sandbox', 'workspace-write', '--model', 'gpt-5',
      ...Object.entries(overrides).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]),
      ...buildCodexMcpArgs(bridge), '-']
    const result = await new Promise((resolveChild, reject) => {
      child = spawn(codexBinary, args, { env: environment, cwd: directory, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true })
      let stdout = '', stderr = ''
      const timer = setTimeout(() => { stop(); reject(new Error('Native Codex smoke timed out')) }, timeoutMs)
      child.stdout.on('data', chunk => { stdout += chunk.toString() })
      child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 6000) stderr = stderr.slice(-6000) })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('close', code => { clearTimeout(timer); resolveChild({ code, stdout, stderr }) })
      child.stdin.end('Call the cloudflare_os describeBinding MCP tool and report its exact returned fixture marker.')
    })
    const success = result.code === 0 && observations.mcpCalls > 0 && observations.consumedToolResult && result.stdout.includes(MARKER)
    return { agent: 'Codex CLI', version: version.stdout.trim(), model: 'synthetic loopback Responses fixture', success, readOnlyHint, ...observations, exitCode: result.code,
      ...(success ? {} : { error: result.stderr.slice(-1500) || result.stdout.slice(-500) }) }
  } finally {
    stop()
    server.closeAllConnections()
    await new Promise(resolveClose => server.close(resolveClose))
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep + 'cfos-native-codex-')) throw new Error('Temporary directory validation failed')
    rmSync(directory, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = await runNativeCodexMcpSmoke({ readOnlyHint: process.argv.includes('--unannotated-tool') ? null : !process.argv.includes('--write-tool') }); process.stdout.write(JSON.stringify(result) + '\n'); if (!result.success) process.exitCode = 1 }
  catch (error) { process.stdout.write(JSON.stringify({ success: false, error: error.message }) + '\n'); process.exitCode = 1 }
}
