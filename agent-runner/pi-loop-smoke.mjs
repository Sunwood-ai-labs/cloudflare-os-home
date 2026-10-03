// Optional protocol smoke test with the exact Pi runtime pinned by Cloudflare OS.
// Install pi-agent-core/pi-ai 0.87.1 in a disposable directory, then run:
//   node agent-runner/pi-loop-smoke.mjs <temporary-runtime-directory>
// This uses real Pi provider adapters and tool execution with synthetic native
// subprocesses. It makes no provider calls and changes no Cloudflare OS state.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildClaudeMcpArgs, buildCodexMcpArgs, buildMcpBridgeEnv } from './mcp-config.mjs'

const runtimeDirectory = process.argv[2] && resolve(process.argv[2])
if (!runtimeDirectory) throw new Error('Pass a disposable directory with Pi 0.87.1 dependencies')
const packageDirectory = name => join(runtimeDirectory, 'node_modules', '@earendil-works', name)
for (const name of ['pi-agent-core', 'pi-ai']) {
  assert.equal(JSON.parse(readFileSync(join(packageDirectory(name), 'package.json'), 'utf8')).version, '0.87.1')
}
const { runAgentLoopContinue } = await import(pathToFileURL(join(packageDirectory('pi-agent-core'), 'dist', 'agent-loop.js')))
const { Type, toToolDeclaration } = await import(pathToFileURL(join(packageDirectory('pi-ai'), 'dist', 'index.js')))
const workspace = mkdtempSync(join(tmpdir(), 'cfos-real-pi-workspace-'))
process.env.AGENT_RUNNER_WORKSPACE = workspace
const { createRunnerServer, runCli } = await import('./server.mjs')
const nativeFixture = fileURLToPath(new URL('./fixtures/native-agent.mjs', import.meta.url))
let nativeRuns = 0
const models = ['claude-code-glm', 'codex']
const server = createRunnerServer({ authorizationToken: 'disposable-pi-fixture-token',
  agentOverrides: Object.fromEntries(models.map(name => [name, { name, available: () => true,
    run: (prompt, ctx) => {
      nativeRuns++
      return runCli({ ...ctx, name, cmd: process.execPath,
        args: [nativeFixture, 'cli', name,
          ...(name === 'codex' ? buildCodexMcpArgs(ctx.bridge) : buildClaudeMcpArgs(ctx.bridge))],
        stdin: prompt, env: { ...process.env, ...buildMcpBridgeEnv(ctx.bridge) },
        parse: ({ stdout }) => ({ text: JSON.parse(stdout.trim().split('\n').at(-1)).result }),
      })
    },
  }])) })
server.listen(0, '127.0.0.1')
await once(server, 'listening')
try {
  let allExecuted = 0
  for (const [index, api] of ['openai-completions', 'openai-responses'].entries()) {
    const { streamSimple } = await import(pathToFileURL(join(packageDirectory('pi-ai'), 'dist', 'api', api + '.js')))
    const evidence = `REAL_PI_EXECUTOR_${api}`
    let executed = 0
    const tools = [{ name: 'executeCode', label: 'Disposable Pi executor',
      description: 'Validate the fixture call and return a deterministic evidence marker.',
      parameters: Type.Object({ code: Type.String() }),
      execute: async (callId, { code }) => {
        assert.match(callId, /^cfos_/)
        assert.match(code, /export default async function/)
        executed++
        allExecuted++
        return { content: [{ type: 'text', text: evidence }], details: { fixture: true } }
      },
    }]
    const context = { tools, messages: [
      { role: 'system', content: 'Disposable protocol QA; all tools are deterministic fixtures.',
        toolsAdded: tools.map(toToolDeclaration), timestamp: 0 },
      { role: 'user', content: [{ type: 'text', text: 'Use the Pi MCP executeCode fixture once.' }], timestamp: Date.now() },
    ] }
    const model = { id: models[index], name: 'Disposable native fixture', provider: 'openai', api,
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`, reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 4096,
      compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false },
    }
    const events = []
    const messages = await runAgentLoopContinue(context, {
      model, apiKey: 'disposable-pi-fixture-token', convertToLlm: messages => messages, toolExecution: 'sequential',
    }, event => events.push(event), AbortSignal.timeout(20_000), streamSimple)
    const final = messages.findLast(message => message.role === 'assistant')
    assert.equal(final.stopReason, 'stop', final.errorMessage)
    assert.equal(executed, 1)
    assert.match(final.content.filter(part => part.type === 'text').map(part => part.text).join(''), new RegExp(evidence))
    assert.equal(messages.filter(message => message.role === 'toolResult').length, 1)
    assert.ok(events.some(event => event.type === 'tool_execution_end'))
    console.log(`PASS Pi 0.87.1 ${api}: MCP call -> real Pi tool executor -> native resumed final`)
  }
  assert.equal(nativeRuns, 2)
  assert.equal(allExecuted, 2)
  console.log('PASS 2 real Pi loops, 2 synthetic native subprocesses, 2 tool executions, no provider calls')
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  rmSync(workspace, { recursive: true, force: true })
}
