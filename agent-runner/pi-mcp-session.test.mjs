import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PiMcpSession, canonicalToolCallId, sessionIdFromCallId } from './pi-mcp-session.mjs'

const TOOLS = [{ type: 'function', function: {
  name: 'executeCode', description: 'Run code through the current Pi chat bindings.',
  parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
} }, { type: 'function', function: {
  name: 'describeBinding', parameters: { type: 'object', properties: { name: { type: 'string' } } },
} }]

test('MCP catalog preserves exact Pi schemas without claiming approval or read-only annotations', () => {
  const session = new PiMcpSession(TOOLS)
  try {
    assert.deepEqual(session.mcpTools[0], {
      name: 'executeCode', description: TOOLS[0].function.description,
      inputSchema: TOOLS[0].function.parameters,
    })
    const catalog = session.mcpTools
    catalog[0].inputSchema.properties.code.type = 'number'
    assert.equal(session.mcpTools[0].inputSchema.properties.code.type, 'string')
    assert.equal(session.mcpTools[0].annotations, undefined)
  } finally { session.close() }
})

test('a native MCP call waits for Pi and receives only its correlated result', async () => {
  const session = new PiMcpSession(TOOLS)
  try {
    const changed = session.waitForCalls()
    let resumed = false
    const result = session.callTool('executeCode', { code: 'return await env.MCP.listTools()' })
      .then(value => { resumed = true; return value })
    const [queued] = await changed
    assert.equal(sessionIdFromCallId(queued.id), session.id)
    assert.ok(queued.id.length <= 64)
    assert.equal(resumed, false)
    assert.deepEqual(JSON.parse(queued.function.arguments), { code: 'return await env.MCP.listTools()' })
    const [emitted] = session.takeCalls()
    assert.deepEqual(emitted, queued)
    assert.deepEqual(session.takeCalls(), [])
    assert.deepEqual(session.emittedCalls(), [queued])
    session.validateResults([{ tool_call_id: queued.id, content: 'Pi-approved tool result' }])
    await Promise.resolve()
    assert.equal(resumed, false)
    session.submitResults([{ tool_call_id: queued.id, content: 'Pi-approved tool result' }])
    assert.equal(await result, 'Pi-approved tool result')
    assert.deepEqual(session.emittedCalls(), [])
    session.submitResults([{ tool_call_id: queued.id, content: 'Pi-approved tool result' }])
    assert.throws(() => session.submitResults([{ tool_call_id: queued.id, content: 'changed result' }]), /Conflicting/)
  } finally { session.close() }
})

test('parallel calls drain once and later calls wait for the next Pi request', async () => {
  const session = new PiMcpSession(TOOLS)
  try {
    const first = session.callTool('describeBinding', { name: 'ONE' })
    const second = session.callTool('describeBinding', { name: 'TWO' })
    const batch = session.takeCalls()
    assert.equal(batch.length, 2)
    assert.notEqual(batch[0].id, batch[1].id)
    const third = session.callTool('describeBinding', { name: 'THREE' })
    const [late] = session.takeCalls()
    assert.ok(late)
    assert.equal(JSON.parse(late.function.arguments).name, 'THREE')
    session.submitResults([
      { tool_call_id: batch[1].id, content: '2' }, { tool_call_id: batch[0].id, content: '1' },
      { tool_call_id: late.id, content: '3' },
    ])
    assert.deepEqual(await Promise.all([first, second, third]), ['1', '2', '3'])
  } finally { session.close() }
})

test('unknown tool, unsent/foreign call IDs and invalid arguments fail closed', async () => {
  const session = new PiMcpSession(TOOLS)
  const foreign = new PiMcpSession(TOOLS)
  try {
    await assert.rejects(session.callTool('foreignWrite', {}), /not available/)
    await assert.rejects(session.callTool('executeCode', []), /object/)
    const cyclic = {}; cyclic.self = cyclic
    await assert.rejects(session.callTool('executeCode', cyclic), /serializable/)
    const result = session.callTool('describeBinding', {})
    const [call] = session.pendingCalls()
    assert.throws(() => session.submitResults([{ tool_call_id: call.id, content: 'early' }]), /does not belong/)
    session.takeCalls()
    assert.throws(() => foreign.submitResults([{ tool_call_id: call.id, content: 'foreign' }]), /does not belong/)
    // A mixed valid/invalid batch must not partially resume the native agent.
    assert.throws(() => session.submitResults([
      { tool_call_id: call.id, content: 'wrong' }, { tool_call_id: 'unknown', content: 'other' },
    ]), /does not belong/)
    session.submitResults([{ tool_call_id: call.id, content: 'right' }])
    assert.equal(await result, 'right')
  } finally { session.close(); foreign.close() }
})

test('pending limits do not prevent new calls after Pi returns a result', async () => {
  const session = new PiMcpSession(TOOLS, { maxPending: 1, maxCalls: 2 })
  try {
    const first = session.callTool('describeBinding', {})
    await assert.rejects(session.callTool('describeBinding', {}), /limit/)
    const [call] = session.takeCalls()
    session.submitResults([{ tool_call_id: call.id, content: 'first' }])
    assert.equal(await first, 'first')
    const second = session.callTool('describeBinding', {})
    const [next] = session.takeCalls()
    session.submitResults([{ tool_call_id: next.id, content: 'second' }])
    assert.equal(await second, 'second')
    await assert.rejects(session.callTool('describeBinding', {}), /limit/)
  } finally { session.close() }
})

test('expiry rejects pending calls and waits and runs lifecycle cleanup once', async () => {
  let closed = 0
  const session = new PiMcpSession(TOOLS, { ttlMs: 20, onClose: () => { closed++ } })
  const call = session.callTool('describeBinding', {})
  session.takeCalls()
  const waiter = session.waitForCalls()
  const checks = Promise.all([
    assert.rejects(call, /expired/), assert.rejects(waiter, /expired/),
  ])
  // Session timers are unref'ed so idle bridge state does not keep a runner alive.
  await new Promise(resolve => setTimeout(resolve, 35))
  await checks
  assert.equal(closed, 1)
  session.close()
  assert.equal(closed, 1)
  await assert.rejects(session.callTool('describeBinding', {}), /expired/)
  assert.throws(() => session.takeCalls(), /expired/)
})

test('aborting one HTTP wait leaves the native session available to another request', async () => {
  const session = new PiMcpSession(TOOLS)
  try {
    const abort = new AbortController()
    const wait = session.waitForCalls({ signal: abort.signal })
    abort.abort(new Error('client disconnected'))
    await assert.rejects(wait, /disconnected/)
    assert.equal(session.waiters.size, 0)
    const next = session.waitForCalls()
    const result = session.callTool('describeBinding', {})
    assert.equal((await next).length, 1)
    const [call] = session.takeCalls()
    session.submitResults([{ tool_call_id: call.id, content: [{ type: 'text', text: 'ok' }] }])
    assert.equal(await result, '[{"type":"text","text":"ok"}]')
  } finally { session.close() }
})

test('call ID parser does not match ordinary provider calls or malformed counters', () => {
  assert.equal(sessionIdFromCallId('call_regular'), undefined)
  assert.equal(sessionIdFromCallId(null), undefined)
  assert.equal(sessionIdFromCallId('cfos_fake_1'), undefined)
  assert.equal(sessionIdFromCallId('cfos_12345678-1234-1234-1234-123456789abc_0'), undefined)
})

test('Responses item IDs canonicalize to the original call and duplicate results remain harmless', async () => {
  const session = new PiMcpSession(TOOLS)
  try {
    const pending = session.callTool('describeBinding', {})
    const [call] = session.takeCalls()
    assert.equal(canonicalToolCallId(`${call.id}|fc_item`), call.id)
    assert.equal(sessionIdFromCallId(`${call.id}|fc_item`), session.id)
    session.submitResults([{ role: 'tool', tool_call_id: `${call.id}|fc_item`, content: 'result' }])
    assert.equal(await pending, 'result')
    session.submitResults([{ call_id: call.id, output: 'result' }])
    assert.equal(canonicalToolCallId(`${call.id}|item|other`), undefined)
  } finally { session.close() }
})

test('team read-only roles reject direct Pi writes while executeCode retains Pi approval', async () => {
  const session = new PiMcpSession([...TOOLS, { type: 'function', function: {
    name: 'writeFile', parameters: { type: 'object' },
  } }])
  try {
    session.setReadOnly(true)
    assert.equal(session.mcpTools.some(tool => tool.name === 'writeFile'), false)
    await assert.rejects(session.callTool('writeFile', {}), /read-only/)
    assert.equal(session.mcpTools.some(tool => tool.name === 'executeCode'), true)
    // No execution occurs here: even executeCode returns only after the outer Pi result.
    const pending = session.callTool('executeCode', { code: 'return env.MCP.callTool("write", {})' })
    const [call] = session.takeCalls()
    session.submitResults([{ tool_call_id: call.id, content: 'Pi approval required' }])
    assert.equal(await pending, 'Pi approval required')
    session.setReadOnly(false)
    assert.equal(session.mcpTools.some(tool => tool.name === 'writeFile'), true)
  } finally { session.close() }
})

test('session data is bounded and rejected result batches can be retried with a valid result', async () => {
  const session = new PiMcpSession(TOOLS, { maxBytes: Buffer.byteLength(JSON.stringify(TOOLS)) + 100 })
  try {
    await assert.rejects(session.callTool('executeCode', { code: 'x'.repeat(200) }), /data limit/)
    await assert.rejects(session.callTool('executeCode', { toJSON: () => undefined }), /serialize to an object/)
    const result = session.callTool('describeBinding', {})
    const [call] = session.takeCalls()
    assert.throws(() => session.submitResults([{ tool_call_id: call.id, content: 'x'.repeat(200) }]), /data limit/)
    session.submitResults([{ tool_call_id: call.id, content: 'ok' }])
    assert.equal(await result, 'ok')
    const bytes = session.dataBytes
    session.submitResults([{ tool_call_id: call.id, content: 'ok' }])
    assert.equal(session.dataBytes, bytes)
  } finally { session.close() }
})
