#!/usr/bin/env node
// Opt-in live validation: actual Pi 0.87.1 loop, deployed runner/native models,
// and the public read-only OpenAI documentation MCP. Credentials stay in memory.
// node qa/live-mcp-agent-probe.mjs --runtime-dir <disposable Pi runtime>
//   --base-url http://127.0.0.1:4001/v1 --credential-env LITELLM_MASTER_KEY
//   --models claude-code-glm,codex,hermes,agent-team --output-dir artifacts/live-mcp
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLiveMcpEvidenceTracker } from './live-mcp-evidence.mjs'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  if (!process.argv[index].startsWith('--') || process.argv[index + 1] === undefined) {
    throw new Error('Options must use --name value pairs')
  }
  args.set(process.argv[index].slice(2), process.argv[index + 1])
}
const runtime = args.get('runtime-dir') && resolve(args.get('runtime-dir'))
if (!runtime) throw new Error('Pass --runtime-dir with disposable Pi 0.87.1 packages')
const baseUrl = (args.get('base-url') ?? 'http://127.0.0.1:4001/v1').replace(/\/$/, '')
const credentialName = args.get('credential-env') ?? 'LITELLM_MASTER_KEY'
const api = args.get('api') ?? 'openai-completions'
if (!['openai-completions', 'openai-responses'].includes(api)) throw new Error('Unsupported Pi API adapter')
const models = (args.get('models') ?? 'claude-code-glm,codex,hermes,agent-team').split(',')
if (models.some(model => !['claude-code-glm', 'codex', 'antigravity', 'hermes', 'agent-team'].includes(model))) {
  throw new Error('Models must be native runner model IDs')
}
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const outputDir = resolve(args.get('output-dir') ?? join('artifacts', `live-mcp-${timestamp}`))
mkdirSync(outputDir, { recursive: true })

function envFileValue(name) {
  const file = readFileSync(resolve(args.get('env-file') ?? '.env'), 'utf8')
  const line = file.split(/\r?\n/).find(line => line.startsWith(`${name}=`))
  let value = line?.slice(name.length + 1).trim()
  if (value && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1)
  return value
}
const credential = process.env[credentialName] || envFileValue(credentialName)
if (!credential) throw new Error(`Missing ${credentialName}; credentials are never accepted in CLI arguments`)
const sanitize = value => String(value).replaceAll(credential, '[REDACTED]')
const writeEvidence = (name, value) => writeFileSync(join(outputDir, name), sanitize(JSON.stringify(value, null, 2)) + '\n', { mode: 0o600 })
const packageDirectory = name => join(runtime, 'node_modules', '@earendil-works', name)
for (const name of ['pi-agent-core', 'pi-ai']) {
  assert.equal(JSON.parse(readFileSync(join(packageDirectory(name), 'package.json'), 'utf8')).version, '0.87.1')
}
const { runAgentLoopContinue } = await import(pathToFileURL(join(packageDirectory('pi-agent-core'), 'dist', 'agent-loop.js')))
const { Type, toToolDeclaration } = await import(pathToFileURL(join(packageDirectory('pi-ai'), 'dist', 'index.js')))
const { streamSimple } = await import(pathToFileURL(join(packageDirectory('pi-ai'), 'dist', 'api', api + '.js')))

const endpoint = 'https://developers.openai.com/mcp'
const publicMcp = { endpoint, session: undefined, nextId: 0, protocolVersion: '2025-06-18' }
const mcpRequests = []
async function publicMcpRequest(method, params, { notification = false } = {}) {
  const id = ++publicMcp.nextId
  const startedAt = new Date().toISOString()
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': publicMcp.protocolVersion }
  if (publicMcp.session) headers['Mcp-Session-Id'] = publicMcp.session
  const response = await fetch(endpoint, { method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }),
    signal: AbortSignal.timeout(45_000), redirect: 'error' })
  publicMcp.session = response.headers.get('Mcp-Session-Id') ?? publicMcp.session
  const text = await response.text()
  if (Buffer.byteLength(text) > 1_048_576) throw new Error('Public MCP response exceeded 1 MiB')
  const request = { id, method, params, startedAt, finishedAt: new Date().toISOString(), status: response.status,
    responseSha256: createHash('sha256').update(text).digest('hex') }
  mcpRequests.push(request)
  if (!response.ok) throw new Error(`Public MCP ${method} HTTP ${response.status}`)
  if (notification) return undefined
  let reply
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const messages = text.split(/\r?\n\r?\n/).map(event => event.split(/\r?\n/)
      .filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')).filter(Boolean)
    for (const message of messages) {
      const parsed = JSON.parse(message)
      if (parsed.id === id) { reply = parsed; break }
    }
  } else reply = JSON.parse(text)
  if (!reply || reply.id !== id) throw new Error(`Public MCP ${method} returned no correlated response`)
  if (reply.error) throw new Error(`Public MCP ${method} error: ${reply.error.message}`)
  request.result = reply.result
  return reply.result
}

const summary = { runId: randomUUID(), startedAt: new Date().toISOString(), piVersion: '0.87.1', api,
  baseUrl, credentialSource: credentialName, publicMcpEndpoint: endpoint,
  scope: 'Standalone real Pi loop -> deployed native runner -> public read-only MCP; no Workshop account/Gadget changes',
  models: [] }
try {
  const initialized = await publicMcpRequest('initialize', { protocolVersion: publicMcp.protocolVersion,
    capabilities: {}, clientInfo: { name: 'cloudflare-os-home-live-mcp-probe', version: '1.0.0' } })
  publicMcp.protocolVersion = initialized.protocolVersion
  await publicMcpRequest('notifications/initialized', {}, { notification: true })
  const catalog = await publicMcpRequest('tools/list', {})
  const search = catalog.tools.find(tool => tool.name === 'search_openai_docs')
  if (!search?.inputSchema || search.annotations?.readOnlyHint !== true) {
    throw new Error('Public MCP must expose explicitly read-only search_openai_docs')
  }
  writeEvidence('public-mcp-catalog.json', { serverInfo: initialized.serverInfo, protocolVersion: initialized.protocolVersion, search })
  for (const modelId of models) {
    const evidence = { model: modelId, startedAt: new Date().toISOString(), success: false,
      nativeToolCalls: [], publicMcpCalls: [], events: [], finalAnswer: '' }
    summary.models.push(evidence)
    const tracker = createLiveMcpEvidenceTracker(evidence)
    const abort = AbortSignal.timeout(Number(args.get('timeout-seconds') ?? 720) * 1000)
    let requests = 0
    const tools = [{ name: search.name, label: 'Live public OpenAI Docs MCP search',
      description: `${search.description}\nUse this actual read-only MCP tool to answer the task. Its result includes a verifier token; include that exact token in your final answer.`,
      parameters: Type.Unsafe(search.inputSchema),
      execute: async (callId, parameters) => {
        if (!/^cfos_[a-f0-9-]{36}_[a-f0-9]{16}(?:\|[^|]+)?$/.test(callId)) throw new Error('Native call did not use a runner bridge call ID')
        if (evidence.nativeToolCalls.length >= 16) throw new Error('Live probe tool-call budget exceeded')
        const result = await publicMcpRequest('tools/call', { name: search.name, arguments: parameters })
        if (result.isError) throw new Error('Actual public MCP returned a tool error')
        const verifier = `PUBLIC_MCP_VERIFIED_${randomUUID()}`
        const returnedText = `${verifier}\n${JSON.stringify(result)}`
        evidence.nativeToolCalls.push({ callId, name: search.name, parameters, verifier,
          ...tracker.stageForCall(),
          returnedTextSha256: createHash('sha256').update(returnedText).digest('hex') })
        evidence.publicMcpCalls.push(mcpRequests.at(-1))
        writeEvidence(`${modelId}.json`, evidence)
        return { content: [{ type: 'text', text: returnedText }], details: { livePublicMcp: true, verifier } }
      },
    }]
    const question = 'Use the cloudflare_os search_openai_docs MCP tool with query "Responses API structured outputs JSON schema". ' +
      'Give a concise answer: how does a JSON Schema constrain model output? Include one official documentation URL and ' +
      'the exact PUBLIC_MCP_VERIFIED token from your actual tool result. Do not inspect or edit files or run shell commands. ' +
      (modelId === 'agent-team' ? 'Every team stage, including review, fixes and summary, must call this MCP tool once and state its returned token.' : 'Call the MCP tool once before answering.')
    const context = { tools, messages: [
      { role: 'system', content: 'Live integration QA using a real public documentation MCP. Only the supplied read-only search tool is available. Do not invent its result or verifier token.',
        toolsAdded: tools.map(toToolDeclaration), timestamp: 0 },
      { role: 'user', content: [{ type: 'text', text: question }], timestamp: Date.now() },
    ] }
    const model = { id: modelId, name: modelId, provider: 'openai', api, baseUrl, reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 4096,
      compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false } }
    try {
      const messages = await runAgentLoopContinue(context, { model, apiKey: credential,
        convertToLlm: messages => messages, toolExecution: 'sequential', maxTokens: 4096,
        finishTurn: () => { if (++requests >= 20) return { action: 'end' } },
      }, event => {
        if (event.type === 'message_end' && event.message?.role === 'assistant') tracker.recordAssistant(event.message)
        if (['message_end', 'tool_execution_end', 'turn_end'].includes(event.type)) {
          evidence.events.push({ type: event.type, toolName: event.toolName, toolCallId: event.toolCallId,
            isError: event.isError, stopReason: event.message?.stopReason })
        }
      }, abort, streamSimple)
      const final = messages.findLast(message => message.role === 'assistant')
      evidence.stopReason = final?.stopReason
      evidence.error = final?.errorMessage && sanitize(final.errorMessage)
      evidence.finalAnswer = final?.content?.filter(part => part.type === 'text').map(part => part.text).join('') ?? ''
      tracker.finish(final)
    } catch (error) { evidence.error = sanitize(error.message) }
    evidence.finishedAt = new Date().toISOString()
    writeEvidence(`${modelId}.json`, evidence)
    writeEvidence('summary.json', summary)
    console.log(`${evidence.success ? 'PASS' : 'FAIL'} ${modelId}: real MCP calls=${evidence.nativeToolCalls.length}; evidence=${join(outputDir, modelId + '.json')}`)
  }
} catch (error) {
  summary.setupError = sanitize(error.message)
} finally {
  summary.finishedAt = new Date().toISOString()
  summary.success = summary.models.length === models.length && summary.models.every(model => model.success)
  writeEvidence('public-mcp-requests.json', mcpRequests)
  writeEvidence('summary.json', summary)
}
console.log(`Evidence: ${join(outputDir, 'summary.json')}`)
if (!summary.success) process.exitCode = 1
