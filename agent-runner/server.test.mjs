import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildClaudeMcpArgs, buildCodexMcpArgs, buildMcpBridgeEnv } from './mcp-config.mjs'

const workspace = mkdtempSync(join(tmpdir(), 'pi-mcp-runner-test-'))
process.env.AGENT_RUNNER_WORKSPACE = workspace
process.env.AGENT_RUNNER_MCP_SESSION_TTL_SECONDS = '10'
process.env.AGENT_RUNNER_MCP_MAX_SESSIONS = '16'
process.env.TEAM_ICONS = 'emoji'
const { createRunnerServer, runCli, runAcp, isPiMcpToolPermission } = await import('./server.mjs')
const fixture = fileURLToPath(new URL('./fixtures/native-agent.mjs', import.meta.url))
const calls = []
let server, base
const overrides = Object.fromEntries(['claude-code-glm', 'codex', 'antigravity', 'hermes'].map(id => [id, {
  name: id, available: () => true,
  run: (prompt, ctx) => {
    calls.push({ id, prompt, cwd: ctx.cwd, readOnly: ctx.readOnly, bridge: ctx.bridge,
      catalog: ctx.mcpSession?.mcpTools.map(tool => tool.name) })
    const verdict = id === 'codex' && prompt.includes('You are the reviewer')
      ? calls.filter(call => call.id === 'codex' && call.prompt.includes('You are the reviewer')).length % 2
        ? 'VERDICT: CHANGES_REQUESTED' : 'VERDICT: APPROVE' : ''
    const childEnv = { ...process.env, ...buildMcpBridgeEnv(ctx.bridge), FIXTURE_VERDICT: verdict }
    if (id === 'antigravity' || id === 'hermes') return runAcp(prompt, {
      ...ctx, name: id, cmd: process.execPath, args: [fixture, 'acp', id], env: childEnv,
      ...(id === 'hermes' ? { model: 'fixture-selected-model', reloadMcpAfterModel: true } : {}),
    })
    return runCli({ ...ctx, name: id, cmd: process.execPath,
      args: [fixture, 'cli', id, ...(id === 'codex' ? buildCodexMcpArgs(ctx.bridge) : buildClaudeMcpArgs(ctx.bridge))],
      stdin: prompt, env: childEnv,
      parse: ({ stdout }) => ({ text: JSON.parse(stdout.trim().split('\n').at(-1)).result }),
    })
  },
}]))
const tools = [{ type: 'function', function: { name: 'executeCode', description: 'Call the scoped Pi env',
  parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } } }]
const initial = text => [{ role: 'system', content: 'Authorized binding: env.MCP_FIXTURE' }, { role: 'user', content: text }]

before(async () => {
  server = createRunnerServer({ authorizationToken: 'fixture-runner-token', agentOverrides: overrides })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await server.nativeTeardown
  const resolvedWorkspace = resolve(workspace)
  assert.equal(dirname(resolvedWorkspace), resolve(tmpdir()))
  assert(basename(resolvedWorkspace).startsWith('pi-mcp-runner-test-'))
  rmSync(resolvedWorkspace, { recursive: true, force: true, maxRetries: 12, retryDelay: 100 })
})
async function post(path, body, options = {}) {
  const response = await fetch(base + path, { method: 'POST', headers: {
    authorization: 'Bearer fixture-runner-token', 'content-type': 'application/json',
  }, body: JSON.stringify(body), ...options })
  assert.equal(response.status, 200, await response.clone().text())
  return response
}
async function chat(model, messages, extra = {}) {
  return (await post('/v1/chat/completions', { model, messages, tools, ...extra })).json()
}
function withResults(messages, completion, content = 'PI_RESULT_OK') {
  const assistant = completion.choices[0].message
  return [...messages, assistant, ...assistant.tool_calls.map(call => ({ role: 'tool', tool_call_id: call.id, content }))]
}

test('actual Antigravity ACP metadata grants only the scoped MCP bridge', () => {
  const observed = { kind: 'other', status: 'pending', title: 'cloudflare_os_describeBinding',
    content: [], rawInput: { arguments: {} },
    _meta: { mcp: { tool: 'describeBinding', server: 'cloudflare_os' }, is_mcp_tool_call: true } }
  assert.equal(isPiMcpToolPermission(observed, { endpoint: 'fixture' }), true)
  assert.equal(isPiMcpToolPermission(observed), false)
  assert.equal(isPiMcpToolPermission({ kind: 'execute', title: observed.title }, {}), false)
  assert.equal(isPiMcpToolPermission({ ...observed, _meta: { ...observed._meta,
    mcp: { ...observed._meta.mcp, server: 'other_server' } } }, {}), false)
  assert.equal(isPiMcpToolPermission({ ...observed, _meta: { ...observed._meta,
    is_mcp_tool_call: false } }, {}), false)
  assert.equal(isPiMcpToolPermission({ ...observed, _meta: { ...observed._meta,
    mcp: { server: 'cloudflare_os' } } }, {}), false)
})

for (const model of ['claude-code-glm', 'codex', 'antigravity', 'hermes']) {
  test(`${model}: real native subprocess round-trips Pi result, duplicate delivery is cached`, async () => {
    const before = calls.length
    const messages = initial(`MCP fixture ${model}`)
    const first = await chat(model, messages)
    assert.equal(first.choices[0].finish_reason, 'tool_calls')
    assert.equal(first.choices[0].message.tool_calls[0].function.name, 'executeCode')
    assert(first.usage.total_tokens > 0)
    const resumed = withResults(messages, first)
    const final = await chat(model, resumed)
    assert.match(final.choices[0].message.content, /PI_RESULT_OK/)
    const replay = await chat(model, resumed)
    assert.deepEqual(replay.choices, final.choices)
    assert.equal(calls.length, before + 1)
    assert(calls.at(-1).prompt.includes('env.MCP_FIXTURE'))
  })
}

test('new user follow-up starts a new native process after completed bridge calls', async () => {
  const messages = initial('first task')
  const first = await chat('codex', messages)
  const originalCwd = calls.at(-1).cwd
  const resumed = withResults(messages, first)
  const final = await chat('codex', resumed)
  const before = calls.length
  const next = await chat('codex', [...resumed, final.choices[0].message, { role: 'user', content: 'A distinct follow-up' }])
  assert.equal(calls.length, before + 1)
  assert.equal(calls.at(-1).cwd, originalCwd)
  assert.equal(next.choices[0].finish_reason, 'tool_calls')
  await chat('codex', withResults([...resumed, final.choices[0].message, { role: 'user', content: 'A distinct follow-up' }], next))
})

test('chat SSE includes executable function call deltas and nonzero usage', async () => {
  const messages = initial('stream call')
  const response = await post('/v1/chat/completions', { model: 'claude-code-glm', messages, tools, stream: true })
  const stream = await response.text()
  const chunks = stream.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)))
  const call = chunks.flatMap(chunk => chunk.choices[0].delta.tool_calls ?? [])[0]
  assert(call.id)
  assert.equal(call.index, 0)
  assert.equal(chunks.at(-1).choices[0].finish_reason, 'tool_calls')
  assert(chunks.at(-1).usage.total_tokens > 0)
  await chat('claude-code-glm', [...messages, { role: 'assistant', tool_calls: [call] }, { role: 'tool', tool_call_id: call.id, content: 'STREAM_OK' }])
})

test('Responses API preserves call_id and emits standard function SSE events', async () => {
  const input = [{ role: 'user', content: 'response roundtrip' }]
  const response = await post('/v1/responses', { model: 'hermes', instructions: 'env.MCP_FIXTURE', input,
    tools: tools.map(({ function: fn }) => ({ type: 'function', ...fn })), stream: true })
  const stream = await response.text()
  assert.match(stream, /response\.function_call_arguments\.delta/)
  assert.match(stream, /response\.function_call_arguments\.done/)
  const complete = stream.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)))
    .find(event => event.type === 'response.completed').response
  const call = complete.output.find(item => item.type === 'function_call')
  assert(call.call_id)
  assert.equal(call.name, 'executeCode')
  const body = { model: 'hermes', instructions: 'env.MCP_FIXTURE', tools,
    input: [...input, { ...call, call_id: `${call.call_id}|${call.id}` },
      { type: 'function_call_output', call_id: `${call.call_id}|${call.id}`, output: 'RESPONSES_OK' }] }
  const final = await (await post('/v1/responses', body)).json()
  assert.match(final.output[0].content[0].text, /RESPONSES_OK/)
  assert.deepEqual((await (await post('/v1/responses', body)).json()).output.map(item => item.content), final.output.map(item => item.content))
})

test('request-scoped MCP token and catalog reject foreign calls', async () => {
  const messages = initial('auth fixture')
  const first = await chat('codex', messages)
  const bridge = calls.at(-1).bridge
  const invalid = await fetch(bridge.endpoint, { method: 'POST', headers: { authorization: 'Bearer foreign' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
  assert.equal(invalid.status, 401)
  const unavailable = await fetch(bridge.endpoint, { method: 'POST', headers: { authorization: `Bearer ${bridge.token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ungranted_tool' } }) })
  assert.match((await unavailable.json()).error.message, /not available/)
  await chat('codex', withResults(messages, first))
})

test('all six team stages share the same bridge, read roles restrict direct Pi writes', async () => {
  const before = calls.length
  let messages = initial('Build a team fixture')
  let response
  for (let step = 0; step < 8; step++) {
    const stageTools = [...tools, { type: 'function', function: {
      name: 'writeFile', parameters: { type: 'object' },
    } }]
    if (step === 0) {
      const streamResponse = await post('/v1/chat/completions', { model: 'agent-team', messages, tools: stageTools, stream: true })
      const reader = streamResponse.body.getReader()
      let early = ''
      while (!early.includes('working')) {
        const chunk = await reader.read()
        assert(!chunk.done, 'team progress should arrive before the native stage finishes')
        early += new TextDecoder().decode(chunk.value)
      }
      assert(!early.includes('"finish_reason":"tool_calls"'))
      let stream = early
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        stream += new TextDecoder().decode(chunk.value)
      }
      const chunks = stream.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)))
      response = { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '',
        tool_calls: chunks.flatMap(chunk => chunk.choices[0].delta.tool_calls ?? []) } }] }
    } else response = await chat('agent-team', messages, { tools: stageTools })
    if (response.choices[0].finish_reason !== 'tool_calls') break
    messages = withResults(messages, response, `STAGE_${step}`)
  }
  const stages = calls.slice(before)
  assert.equal(stages.length, 6)
  assert.equal(new Set(stages.map(stage => stage.bridge.token)).size, 1)
  assert.equal(new Set(stages.map(stage => stage.cwd)).size, 1)
  assert.deepEqual(stages.map(stage => Boolean(stage.readOnly)), [true, false, true, false, true, true])
  assert.deepEqual(stages.map(stage => stage.catalog.includes('writeFile')), [false, true, false, true, false, false])
  // Review and repair must see the current planner's actual result, and each
  // re-review must see the repaired report rather than only old task history.
  for (const stage of [stages[2], stages[3], stages[4]]) assert.match(stage.prompt, /fixture:antigravity:STAGE_0/)
  assert.match(stages[2].prompt, /fixture:claude-code-glm:STAGE_1/)
  assert.match(stages[3].prompt, /fixture:claude-code-glm:STAGE_1/)
  assert.match(stages[3].prompt, /fixture:codex:VERDICT: CHANGES_REQUESTED\s+STAGE_2/)
  assert.match(stages[4].prompt, /fixture:claude-code-glm:STAGE_3/)
  assert.match(response.choices[0].message.content, /Team log/)
})

test('unchanged prompt bodies from independent requests do not share sessions', async () => {
  const messages = initial('same body two independent users')
  const first = await chat('codex', messages)
  const firstCwd = calls.at(-1).cwd
  const second = await chat('codex', messages)
  assert.notEqual(calls.at(-1).cwd, firstCwd)
  assert.notEqual(first.choices[0].message.tool_calls[0].id, second.choices[0].message.tool_calls[0].id)
  await chat('codex', withResults(messages, first))
  await chat('codex', withResults(messages, second))
})

test('changed tools or binding context retire native session before returning removed tool', async () => {
  const messages = initial('update binding context')
  const firstTools = [...tools, { type: 'function', function: { name: 'writeFile', parameters: { type: 'object' } } }]
  const first = await chat('codex', messages, { tools: firstTools })
  const firstBridge = calls.at(-1).bridge
  const before = calls.length
  const resumed = withResults(messages, first)
  resumed[0] = { role: 'system', content: 'Authorized binding: env.MCP_UPDATED' }
  const changedTools = [...tools, { type: 'function', function: { name: 'listConnectableResources', parameters: { type: 'object' } } }]
  const next = await chat('codex', resumed, { tools: changedTools })
  assert.equal(calls.length, before + 1)
  assert.match(calls.at(-1).prompt, /env\.MCP_UPDATED/)
  assert.match(calls.at(-1).prompt, /do not rerun completed tools or writes/)
  assert(!calls.at(-1).catalog.includes('writeFile'))
  assert(calls.at(-1).catalog.includes('listConnectableResources'))
  assert.equal((await fetch(firstBridge.endpoint, { method: 'POST', headers: { authorization: `Bearer ${firstBridge.token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).status, 404)
  assert.notEqual(next.choices[0].message.tool_calls[0].id, first.choices[0].message.tool_calls[0].id)
  const replay = await chat('codex', resumed, { tools: changedTools })
  assert.deepEqual(replay.choices, next.choices)
  assert.equal(calls.length, before + 1)
  await chat('codex', withResults(resumed, next), { tools: changedTools })
})

test('parallel result retries accept reordered batches and identical duplicate rows', async () => {
  const messages = initial('[PARALLEL_CALLS]')
  const first = await chat('codex', messages)
  let batch = first
  if (first.choices[0].message.tool_calls.length === 1) {
    // Independent MCP POSTs can arrive in separate event-loop turns. Replayed provider history
    // may combine their assistant items, so submit both emitted IDs in the final result batch.
    const second = await chat('codex', withResults(messages, first))
    batch = { choices: [{ message: { role: 'assistant', tool_calls: [
      ...first.choices[0].message.tool_calls, ...second.choices[0].message.tool_calls,
    ] } }] }
  }
  assert.equal(batch.choices[0].message.tool_calls.length, 2)
  const resumed = withResults(messages, batch)
  const final = await chat('codex', resumed)
  const results = resumed.slice(-2).reverse()
  const replay = await chat('codex', [...resumed.slice(0, -2), ...results, results[0]])
  assert.deepEqual(replay.choices, final.choices)
})

test('disconnect during a continued native turn allows cached retry without repeating process', async () => {
  const messages = initial('[SLOW_AFTER_RESULT]')
  const first = await chat('codex', messages)
  const resumed = withResults(messages, first)
  const before = calls.length
  const abort = new AbortController()
  const pending = fetch(base + '/v1/chat/completions', { method: 'POST', signal: abort.signal,
    headers: { authorization: 'Bearer fixture-runner-token', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'codex', messages: resumed, tools }) })
  await new Promise(resolve => setTimeout(resolve, 50))
  abort.abort()
  await assert.rejects(pending)
  const final = await chat('codex', resumed)
  assert.match(final.choices[0].message.content, /PI_RESULT_OK/)
  assert.equal(calls.length, before)
})

test('removing every tool retires the old MCP endpoint and uses baseline execution', async () => {
  const messages = initial('remove all tools')
  const first = await chat('codex', messages)
  const bridge = calls.at(-1).bridge
  const final = await chat('codex', withResults(messages, first), { tools: [] })
  assert.match(final.choices[0].message.content, /baseline/)
  assert.equal(calls.at(-1).bridge, undefined)
  assert.equal((await fetch(bridge.endpoint, { method: 'POST', headers: { authorization: `Bearer ${bridge.token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).status, 404)
})

test('expired native session restarts from recorded results and caches restart turn IDs', async () => {
  const messages = initial('expiry result history')
  const first = await chat('codex', messages)
  const resumed = withResults(messages, first)
  await new Promise(resolve => setTimeout(resolve, 10_100))
  const before = calls.length
  const next = await chat('codex', resumed)
  assert.equal(calls.length, before + 1)
  assert.match(calls.at(-1).prompt, /do not rerun completed tools or writes/)
  const replay = await chat('codex', resumed)
  assert.deepEqual(replay.choices, next.choices)
  assert.equal(calls.length, before + 1)
  await chat('codex', withResults(resumed, next))
})

test('no-tools callers preserve baseline native behavior', async () => {
  const result = await chat('hermes', initial('baseline no tools'), { tools: [] })
  assert.equal(result.choices[0].finish_reason, 'stop')
  assert.match(result.choices[0].message.content, /baseline/)
  assert.equal(calls.at(-1).bridge, undefined)
  assert(!calls.at(-1).prompt.includes('Authorized binding'))
})
