// Provider-free native-agent fixture: real stdio MCP proxy process and ACP messages.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { once } from 'node:events'

const mode = process.argv[2]
const name = process.argv[3]
const send = message => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
let nextId = 1000
const acpWaiters = new Map()
const askClient = (method, params) => new Promise(resolve => {
  const id = nextId++
  acpWaiters.set(id, resolve)
  send({ id, method, params })
})

async function useMcp(prompt, server) {
  if (!server) return `fixture:${name}:baseline`
  const childEnv = { ...process.env, ...Object.fromEntries((server.env ?? []).map(item => [item.name, item.value])) }
  const proxy = spawn(server.command, server.args, { env: childEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] })
  const pending = new Map()
  let id = 0
  const request = (method, params) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject })
    proxy.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
  createInterface({ input: proxy.stdout }).on('line', line => {
    const message = JSON.parse(line)
    const waiter = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) waiter?.reject(new Error(message.error.message))
    else waiter?.resolve(message.result)
  })
  proxy.on('error', error => { for (const waiter of pending.values()) waiter.reject(error) })
  try {
    const init = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } })
    assert.equal(init.protocolVersion, '2024-11-05')
    const { tools } = await request('tools/list', {})
    assert(tools.some(tool => tool.name === 'executeCode'))
    if (mode === 'acp') {
      const options = [{ kind: 'allow_once', optionId: 'yes' }, { kind: 'reject_once', optionId: 'no' }]
      const denied = await askClient('session/request_permission', {
        toolCall: { kind: 'execute', title: 'cloudflare_os MCP shell command' }, options,
      })
      assert.equal(denied.outcome.optionId, 'no')
      const foreign = await askClient('session/request_permission', {
        toolCall: { kind: 'other', title: 'cloudflare_os_executeCode',
          _meta: { is_mcp_tool_call: true, mcp: { server: 'another_server', tool: 'executeCode' } } }, options,
      })
      assert.equal(foreign.outcome.optionId, 'no')
      const permitted = await askClient('session/request_permission', {
        toolCall: name === 'antigravity'
          ? { kind: 'other', title: 'cloudflare_os_executeCode', rawInput: { arguments: {} },
            _meta: { is_mcp_tool_call: true, mcp: { server: 'cloudflare_os', tool: 'executeCode' } } }
          : { kind: 'other', rawInput: { server_name: 'cloudflare_os', tool_name: 'executeCode' } }, options,
      })
      assert.equal(permitted.outcome.optionId, 'yes')
    }
    let text = ''
    const times = prompt.includes('[TWO_CALLS]') ? 2 : 1
    const callTool = async call => {
      const result = await request('tools/call', { name: 'executeCode', arguments: {
        code: `export default async function(self, env) { console.log(${JSON.stringify(`${name}:${call}`)}); }`,
      } })
      return result.content[0].text
    }
    if (prompt.includes('[PARALLEL_CALLS]')) text += (await Promise.all([callTool(0), callTool(1)])).join('')
    else for (let call = 0; call < times; call++) text += await callTool(call)
    if (prompt.includes('[SLOW_AFTER_RESULT]')) await new Promise(resolve => setTimeout(resolve, 250))
    if (process.env.FIXTURE_VERDICT) text = `${process.env.FIXTURE_VERDICT}\n${text}`
    return `fixture:${name}:${text}`
  } finally {
    const closed = proxy.exitCode === null && proxy.signalCode === null ? once(proxy, 'close') : Promise.resolve()
    proxy.stdin.end()
    proxy.kill()
    await closed
  }
}

if (mode === 'cli') {
  let prompt = ''
  for await (const chunk of process.stdin) prompt += chunk
  const server = process.env.CFOS_MCP_ENDPOINT ? {
    command: process.execPath, args: [new URL('../mcp-proxy.mjs', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')],
  } : undefined
  const result = await useMcp(prompt, server)
  console.log(JSON.stringify({ result }))
} else {
  let mcpServer, modelChanged = false, reloaded = false
  createInterface({ input: process.stdin }).on('line', async line => {
    const message = JSON.parse(line)
    if (!message.method) { acpWaiters.get(message.id)?.(message.result); acpWaiters.delete(message.id); return }
    if (message.method === 'initialize') send({ id: message.id, result: { protocolVersion: 1, authMethods: [] } })
    else if (message.method === 'session/new') {
      mcpServer = message.params.mcpServers.find(server => server.name === 'cloudflare_os')
      send({ id: message.id, result: { sessionId: 'fixture-session' } })
    } else if (message.method === 'session/set_model') {
      modelChanged = true
      mcpServer = undefined
      send({ id: message.id, result: {} })
    } else if (message.method === 'session/load') {
      mcpServer = message.params.mcpServers.find(server => server.name === 'cloudflare_os')
      reloaded = true
      send({ id: message.id, result: {} })
    }
    else if (message.method === 'session/prompt') {
      try {
        if (modelChanged && process.env.CFOS_MCP_ENDPOINT) assert(reloaded, 'model selection must reattach MCP tools')
        const text = await useMcp(message.params.prompt[0].text, mcpServer)
        send({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { text } } } })
        send({ id: message.id, result: { stopReason: 'end_turn' } })
      } catch (error) { send({ id: message.id, error: { code: -32000, message: error.message } }) }
    }
  })
}
