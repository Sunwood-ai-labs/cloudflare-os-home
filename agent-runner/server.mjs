#!/usr/bin/env node
// agent-runner: runs coding-agent CLIs (Claude Code, Codex, Antigravity, Hermes) inside this container and
// exposes them as an OpenAI-compatible chat-completions API on the Compose network only (no host
// port). The project LiteLLM forwards the `claude-code-glm`, `codex`, `antigravity` and `hermes` models
// here, so Cloudflare OS can pick them like any other model. `agent-team` chains them into one
// plan -> implement -> review -> summarize pipeline where each stage is a different agent.
//
// Modeled on OpenMausBot's Podman setup: engines live in the container and logins come from the
// local machine (see docker-compose.yml). Every agent works in its own workspace under
// /workspace with its CLI's safe defaults: file edits there are allowed, shell commands are not
// auto-approved.

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PiMcpSession, sessionIdFromCallId } from './pi-mcp-session.mjs'
import { buildClaudeMcpArgs, buildCodexMcpArgs, buildAcpMcpServers, buildMcpBridgeEnv } from './mcp-config.mjs'
import { buildCodexEnv, buildCodexShellEnvArgs } from './codex-env.mjs'

const env = process.env
const port = Number(env.AGENT_RUNNER_PORT ?? 4100)
const token = env.AGENT_RUNNER_TOKEN ?? ''
const timeoutMs = Number(env.AGENT_RUNNER_TIMEOUT_SECONDS ?? 900) * 1000
const workspaceRoot = env.AGENT_RUNNER_WORKSPACE ?? '/workspace'
const maxConcurrent = Number(env.AGENT_RUNNER_MAX_CONCURRENT ?? 2)

// ---- Claude Code (GLM through the project LiteLLM's Anthropic-compatible endpoint) ----------

const claudeModel = env.CLAUDE_CODE_GLM_MODEL ?? 'glm-5.2'
const claudeFastModel = env.CLAUDE_CODE_GLM_FAST_MODEL ?? 'glm-4.7'

function claudeEnv() {
  const out = Object.fromEntries(Object.entries(env).filter(([k]) => !/^(ANTHROPIC_|CLAUDE_CODE_|CLAUDECODE)/.test(k)))
  return {
    ...out,
    ANTHROPIC_BASE_URL: env.CLAUDE_CODE_LITELLM_URL ?? 'http://litellm:4000',
    ANTHROPIC_AUTH_TOKEN: env.LITELLM_MASTER_KEY ?? '',
    ANTHROPIC_MODEL: claudeModel,
    ANTHROPIC_DEFAULT_OPUS_MODEL: claudeModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: claudeModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: claudeFastModel,
    ANTHROPIC_SMALL_FAST_MODEL: claudeFastModel,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  }
}

// ---- Codex (ChatGPT login from the host's ~/.codex/auth.json) -------------------------------

const codexHome = '/agents/codex'

// ---- Antigravity (Google login via the agy ACP server, as OpenMausBot runs it) --------------

// Container paths are fixed; the host-side locations are set by the Compose mounts.
const stateDir = '/agents/state'
const agyRuntimeDir = '/agents/antigravity-runtime'
const agyExecutable = join(agyRuntimeDir, 'agy_acp_server.par')
const agyHarness = join(agyRuntimeDir, 'localharness_external')
const agyProfileSource = '/agents/antigravity-profile-source'
const agyProfile = join(stateDir, 'antigravity-profile')

// The local login is mounted read-only; the ACP server gets a private writable copy so it can
// keep its own session files without touching the source profile.
function prepareAntigravityProfile() {
  const acpDir = join(agyProfile, 'antigravity-acp')
  mkdirSync(acpDir, { recursive: true, mode: 0o700 })
  const sourceToken = join(agyProfileSource, 'antigravity-acp', 'acp_token.json')
  const tokenFile = join(acpDir, 'acp_token.json')
  if (existsSync(sourceToken) && (!existsSync(tokenFile) || statSync(sourceToken).mtimeMs > statSync(tokenFile).mtimeMs)) {
    copyFileSync(sourceToken, tokenFile)
  }
  writeFileSync(join(acpDir, 'settings.json'), `${JSON.stringify({ auth: { type: 'oauth-personal' } })}\n`, { mode: 0o600 })
  return existsSync(tokenFile)
}

function antigravityEnv() {
  const out = Object.fromEntries(Object.entries(env).filter(([k]) =>
    !/^(GEMINI_API_KEY|GOOGLE_|GCLOUD_PROJECT|CLOUDSDK_|AGY_ACP_|ANTIGRAVITY_|GEMINI_HOME$|BROWSER$)/.test(k)))
  return {
    ...out,
    GEMINI_HOME: agyProfile,
    AGY_ACP_FORCE_FILE_STORAGE: '1',
    ANTIGRAVITY_HARNESS_PATH: agyHarness,
    BROWSER: '/bin/true',
    PYTHONUNBUFFERED: '1',
    ELECTRON_RUN_AS_NODE: '1',
  }
}

// ---- Hermes Agent (`hermes acp`, as OpenMausBot runs it) ------------------------------------

// Hermes uses GLM through the project LiteLLM. As in OpenMausBot's driver, the OpenAI-compatible
// host goes into config.yaml `providers:` and the model is chosen with session/set_model
// `custom:<host>:<model>` (ACP ignores `hermes -m`).
const hermesHome = join(stateDir, 'hermes')
const hermesModel = env.HERMES_MODEL ?? 'glm-5.2'

function prepareHermesHome() {
  mkdirSync(hermesHome, { recursive: true })
  const baseUrl = env.HERMES_LITELLM_URL ?? 'http://litellm:4000/v1'
  writeFileSync(join(hermesHome, 'config.yaml'), [
    'model:', `  default: ${hermesModel}`, '  provider: custom', `  base_url: ${baseUrl}`,
    'providers:', '  litellm:', `    base_url: ${baseUrl}`, `    api_key: ${JSON.stringify(env.LITELLM_MASTER_KEY ?? '')}`,
    'memory:', '  memory_enabled: false', '  user_profile_enabled: false', '',
  ].join('\n'), { mode: 0o600 })
}

function hermesEnv() {
  // A stray OPENAI_API_KEY makes Hermes' provider:auto pick OpenRouter (see OpenMausBot).
  const out = Object.fromEntries(Object.entries(env).filter(([k]) => !/^(OPENAI_|OPENROUTER_|HERMES_)/.test(k)))
  return { ...out, HERMES_HOME: hermesHome }
}

// ACP agents ask the client before running tools. Reads and edits inside the workspace are
// approved; shell execution and anything else is declined. Read-only team roles lose `edit` too.
const ACP_ALLOWED_TOOL_KINDS = new Set(['read', 'edit', 'search', 'think', 'fetch'])
const ACP_READ_ONLY_TOOL_KINDS = new Set(['read', 'search', 'think', 'fetch'])

export function isPiMcpToolPermission(toolCall, bridge) {
  if (!bridge) return false
  const raw = toolCall?.rawInput ?? {}
  const serverName = toolCall?.mcpServerName ?? raw.server_name ?? raw.serverName ?? raw.mcp_server_name
  const toolName = toolCall?.name ?? raw.tool_name ?? raw.toolName ?? raw.name
  const metadata = toolCall?._meta
  // Antigravity identifies MCP calls in ACP extension metadata. Display titles
  // remain untrusted: a native shell request can contain the same words.
  const metadataBridge = metadata?.is_mcp_tool_call === true &&
    metadata.mcp?.server === 'cloudflare_os' &&
    /^[A-Za-z][A-Za-z0-9_]*$/.test(String(metadata.mcp?.tool ?? ''))
  return metadataBridge || serverName === 'cloudflare_os' ||
    /^mcp__cloudflare_os__[A-Za-z][A-Za-z0-9_]*$/.test(String(toolName ?? ''))
}

// ---- agents ----------------------------------------------------------------------------------

const agents = {
  'claude-code-glm': {
    name: 'Claude Code (GLM)',
    available: () => Boolean(env.LITELLM_MASTER_KEY),
    run: (prompt, ctx) => runCli({
      ...ctx, name: 'Claude Code',
      cmd: 'claude',
      args: ['-p', '--output-format', 'json', '--model', claudeModel, '--permission-mode', 'acceptEdits',
        ...(ctx.readOnly ? ['--disallowedTools', 'Edit,Write,NotebookEdit'] : []), ...buildClaudeMcpArgs(ctx.bridge)],
      stdin: prompt, env: { ...claudeEnv(), ...buildMcpBridgeEnv(ctx.bridge) },
      parse: ({ stdout }) => {
        const result = JSON.parse(lastJsonLine(stdout))
        if (result.is_error) throw new Error(result.result || 'Claude Code reported an error')
        return { text: result.result ?? '', usage: result.usage && {
          prompt_tokens: (result.usage.input_tokens ?? 0) + (result.usage.cache_read_input_tokens ?? 0),
          completion_tokens: result.usage.output_tokens ?? 0,
        } }
      },
    }),
  },
  codex: {
    name: 'Codex',
    available: () => existsSync(join(codexHome, 'auth.json')),
    run: (prompt, ctx) => {
      const outFile = join(tmpdir(), `codex-${randomUUID()}.txt`)
      return runCli({
        ...ctx, name: 'Codex',
        cmd: 'codex',
        args: ['exec', '--skip-git-repo-check', '--ephemeral', '--color', 'never', '--sandbox', ctx.readOnly ? 'read-only' : 'workspace-write',
          ...(env.CODEX_MODEL ? ['--model', env.CODEX_MODEL] : []),
          ...buildCodexShellEnvArgs(env),
          ...buildCodexMcpArgs(ctx.bridge),
          '--output-last-message', outFile, '-'],
        stdin: prompt, env: buildCodexEnv(env, ctx.bridge, codexHome),
        parse: () => {
          if (!existsSync(outFile)) throw new Error('Codex produced no final message')
          return { text: readFileSync(outFile, 'utf8') }
        },
      }).finally(() => rmSync(outFile, { force: true }))
    },
  },
  antigravity: {
    name: 'Antigravity',
    available: () => existsSync(agyExecutable) && existsSync(join(agyProfileSource, 'antigravity-acp', 'acp_token.json')),
    run: (prompt, ctx) => {
      if (!prepareAntigravityProfile()) throw new HttpError(503, 'Antigravity is not signed in')
      return runAcp(prompt, {
        ...ctx, name: 'Antigravity', cmd: agyExecutable, args: ['--uid='],
        env: { ...antigravityEnv(), ...buildMcpBridgeEnv(ctx.bridge) },
        authMethod: 'oauth-personal', model: env.ANTIGRAVITY_MODEL,
      })
    },
  },
  hermes: {
    name: 'Hermes Agent',
    available: () => Boolean(env.LITELLM_MASTER_KEY),
    run: (prompt, ctx) => {
      prepareHermesHome()
      return runAcp(prompt, {
        ...ctx, name: 'Hermes', cmd: 'hermes', args: ['acp'],
        env: { ...hermesEnv(), ...buildMcpBridgeEnv(ctx.bridge) },
        model: `custom:litellm:${hermesModel}`,
        reloadMcpAfterModel: true,
      })
    },
  },
  // Not a CLI: a pipeline that makes the agents above work together on one shared workspace.
  'agent-team': {
    name: 'Agent Team',
    workspace: 'agent-team',
    maxConcurrent: 1,
    available: () => Object.values(teamRoles).every(id => agents[id]?.available()),
    run: (prompt, ctx) => runTeam(prompt, ctx),
  },
}

function lastJsonLine(stdout) {
  const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('{'))
  if (!lines.length) throw new Error(`no JSON output: ${stdout.slice(-500)}`)
  return lines.at(-1)
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

const childTeardowns = new Set()

function stopChildTree(child, signal = 'SIGKILL') {
  if (child.runnerTeardown) return child.runnerTeardown
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0 || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  const stopped = new Promise(resolve => {
    if (process.platform === 'win32') {
      // The PID comes directly from our own spawn. /T also closes its stdio MCP descendants,
      // which would otherwise keep the private workspace locked after the parent is killed.
      const killer = spawn(join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
        ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.once('error', () => { child.kill('SIGKILL'); resolve() })
      killer.once('close', () => resolve())
    } else {
      try { process.kill(-child.pid, signal) } catch { child.kill(signal) }
      resolve()
    }
  })
  child.runnerTeardown = stopped
  childTeardowns.add(stopped)
  stopped.finally(() => childTeardowns.delete(stopped))
  return stopped
}

function watch(child, { signal, name }, reject) {
  const timer = setTimeout(() => { stopChildTree(child); reject(new HttpError(504, `${name} timed out`)) }, timeoutMs)
  const onAbort = () => { stopChildTree(child); reject(new HttpError(499, 'client closed request')) }
  signal?.addEventListener('abort', onAbort, { once: true })
  return () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort) }
}

export function runCli({ name, cmd, args, stdin, env: childEnv, cwd, signal, parse }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, env: childEnv, detached: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d; if (stderr.length > 200_000) stderr = stderr.slice(-100_000) })
    const done = watch(child, { signal, name }, reject)
    child.on('error', err => { done(); reject(err) })
    child.on('close', async code => {
      done()
      await child.runnerTeardown
      try {
        resolvePromise(parse({ stdout }))
      } catch (err) {
        const detail = (stderr || stdout).split(/\r?\n/).filter(Boolean).slice(-8).join('\n')
        reject(new HttpError(502, `${name} failed (exit ${code}): ${err.message}\n${detail}`))
      }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin ?? '')
  })
}

// Minimal ACP (Agent Client Protocol) client, following OpenMausBot's acp/core.ts:
// initialize -> [authenticate] -> session/new -> [session/set_model] -> session/prompt,
// collecting agent_message_chunk text.
export function runAcp(prompt, { name, cmd, args, env: childEnv, authMethod, model, cwd, signal, readOnly, bridge, reloadMcpAfterModel }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, env: childEnv, detached: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let buffer = '', text = '', nextId = 1, finished = false
    const pending = new Map()
    const stderrTail = []
    const send = msg => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`)
    const request = (method, params) => new Promise((res, rej) => {
      const id = nextId++
      pending.set(id, { res, rej })
      send({ id, method, params })
    })
    const finish = (err, value) => {
      if (finished) return
      finished = true
      done()
      stopChildTree(child, 'SIGTERM').then(() => { err ? reject(err) : resolvePromise(value) })
    }
    const done = watch(child, { signal, name }, err => finish(err))

    const answerPermission = msg => {
      const options = msg.params?.options ?? []
      const kind = String(msg.params?.toolCall?.kind ?? '')
      const toolCall = msg.params?.toolCall ?? {}
      // Only a positively identified bridge call gets MCP permission. An MCP-looking title
      // alone must never grant shell execution or access to another configured server.
      const bridgeTool = isPiMcpToolPermission(toolCall, bridge)
      const want = bridgeTool || (readOnly ? ACP_READ_ONLY_TOOL_KINDS : ACP_ALLOWED_TOOL_KINDS).has(kind) ? 'allow' : 'reject'
      const option = options.find(o => o.kind === `${want}_once`) ?? options.find(o => String(o.kind).startsWith(want))
      send({ id: msg.id, result: { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } } })
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line.startsWith('{')) continue
        let msg
        try { msg = JSON.parse(line) } catch { continue }
        if (msg.id !== undefined && !msg.method) {
          const waiter = pending.get(msg.id)
          pending.delete(msg.id)
          if (msg.error) waiter?.rej(new Error(msg.error.message ?? JSON.stringify(msg.error)))
          else waiter?.res(msg.result)
        } else if (msg.method === 'session/update') {
          const update = msg.params?.update ?? {}
          if (update.sessionUpdate === 'agent_message_chunk' && typeof update.content?.text === 'string') text += update.content.text
        } else if (msg.method === 'session/request_permission') {
          answerPermission(msg)
        } else if (msg.id !== undefined && msg.method) {
          send({ id: msg.id, error: { code: -32601, message: 'method not found' } })
        }
      }
    })
    // stderr can carry OAuth codes; keep only a short, redacted tail for error messages.
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => { stderrTail.push(...chunk.split('\n').filter(Boolean)); stderrTail.splice(0, Math.max(0, stderrTail.length - 5)) })
    child.on('error', err => finish(err))
    child.on('close', code => {
      if (!finished) finish(new HttpError(502, `${name} ACP exited ${code}: ${stderrTail.join(' | ').replace(/[A-Za-z0-9_\-]{32,}/g, '…')}`))
    })

    ;(async () => {
      const init = await request('initialize', {
        protocolVersion: 1,
        clientInfo: { name: 'cloudflare-os-home-agent-runner', version: '1.0.0' },
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      })
      if (authMethod && (init?.authMethods ?? []).some(m => m.id === authMethod)) {
        await request('authenticate', { methodId: authMethod })
      }
      const session = await request('session/new', { cwd, mcpServers: buildAcpMcpServers(bridge) })
      if (!session?.sessionId) throw new Error('session/new returned no sessionId')
      if (model) {
        await request('session/set_model', { sessionId: session.sessionId, modelId: model }).catch(err => log(`${name} set_model failed: ${err.message}`))
        // Hermes 0.19 replaces its agent on model selection and drops the attached MCP tools.
        // Loading that same session reattaches them to the selected model before inference.
        if (bridge && reloadMcpAfterModel) {
          await request('session/load', { sessionId: session.sessionId, cwd, mcpServers: buildAcpMcpServers(bridge) })
        }
      }
      const result = await request('session/prompt', { sessionId: session.sessionId, prompt: [{ type: 'text', text: prompt }] })
      if (result?.stopReason && result.stopReason !== 'end_turn') {
        throw new Error(`${name} stopped: ${result.stopReason}${result.error ? ` (${result.error})` : ''}`)
      }
      const usage = result?.usage ?? result?._meta ?? {}
      finish(null, { text, usage: typeof usage.inputTokens === 'number'
        ? { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens ?? 0 } : undefined })
    })().catch(err => finish(err.status ? err : new HttpError(502, `${name} failed: ${err.message}`)))
  })
}

// ---- agent team ------------------------------------------------------------------------------

// Plan -> implement -> review (-> fix -> re-review) -> summarize, each stage handled by a different
// agent in the same workspace, so the reviewer reads the files the implementer actually wrote.
const teamRoles = {
  planner: env.TEAM_PLANNER ?? 'antigravity',
  implementer: env.TEAM_IMPLEMENTER ?? 'claude-code-glm',
  reviewer: env.TEAM_REVIEWER ?? 'codex',
  summarizer: env.TEAM_SUMMARIZER ?? 'hermes',
}
const teamFixRounds = Number(env.TEAM_MAX_FIX_ROUNDS ?? 2)

const teamPreamble = role => `You are the ${role} in a team of coding agents (Antigravity, Claude Code, Codex, Hermes) ` +
  'working in one shared workspace (the current directory). It may hold files from earlier tasks; ' +
  'only touch what this task needs. Reply in the same language as the task.'

// The chat only ever grows (it is one streamed message), so progress is written as a log: an
// overview line, then per stage a heading, a "working" note, the agent's output and a "done" note,
// and a closing table.
const teamLabels = {
  en: { team: 'Agent Team', plan: 'Plan', implement: 'Implement', review: 'Review', fix: 'Fix', rereview: 'Re-review',
    summary: 'Summary', working: 'working…', done: s => `done in ${s}s`, round: n => ` (round ${n})`,
    approve: 'Approved', changes: 'Changes requested', changesNote: 'back to the implementer', noVerdict: 'No verdict',
    record: 'Team log', stage: 'Stage', agent: 'Agent', time: 'Time', result: 'Result', total: 'Total', s: n => `${n}s` },
  ja: { team: 'エージェントチーム', plan: '計画', implement: '実装', review: 'レビュー', fix: '修正', rereview: '再レビュー',
    summary: 'まとめ', working: '作業中…', done: s => `完了（${s}秒）`, round: n => `（${n}回目）`,
    approve: '承認', changes: '修正依頼', changesNote: '実装担当に差し戻します', noVerdict: '判定なし',
    record: 'チームの記録', stage: '段階', agent: 'エージェント', time: '時間', result: '結果', total: '合計', s: n => `${n}秒` },
}

// Font Awesome 6 (solid) icons, served as sized and colored SVGs by the Iconify API: the chat
// renders Markdown with raw HTML skipped, so an image is the only way to show an icon font glyph.
// TEAM_ICONS=emoji falls back to plain emoji (no request to the icon CDN).
const teamIcons = {
  team: ['people-group', '#f6821f', '🤝'], plan: ['compass', '#f6821f', '🧭'],
  implement: ['screwdriver-wrench', '#f6821f', '🛠️'], review: ['magnifying-glass', '#f6821f', '🔍'],
  fix: ['bandage', '#f6821f', '🩹'], summary: ['file-lines', '#f6821f', '📝'], record: ['chart-simple', '#f6821f', '📊'],
  working: ['hourglass-half', '#8a8a8a', '⏳'], done: ['circle-check', '#16a34a', '✅'],
  approve: ['circle-check', '#16a34a', '✅'], changes: ['triangle-exclamation', '#d97706', '⚠️'],
  noVerdict: ['circle-question', '#8a8a8a', '❔'],
}
const teamIconBase = env.TEAM_ICON_BASE_URL ?? 'https://api.iconify.design/fa6-solid'
const icon = key => {
  const [fa, color, emoji] = teamIcons[key]
  if (env.TEAM_ICONS === 'emoji') return emoji
  return `![${fa}](${teamIconBase}/${fa}.svg?height=1em&color=${encodeURIComponent(color)})`
}

async function runTeam(task, { signal, onDelta, bridge, mcpSession, workspace }) {
  const t = /[\u3040-\u30ff\u4e00-\u9fff]/.test(task) ? teamLabels.ja : teamLabels.en
  const name = id => agents[id].name
  let transcript = ''
  const emit = text => { transcript += text; onDelta?.(text) }
  const record = []
  const teamStarted = Date.now()

  emit(`${icon('team')} **${t.team}**　${icon('plan')} ${t.plan} ${name(teamRoles.planner)} → ` +
    `${icon('implement')} ${t.implement} ${name(teamRoles.implementer)} → ${icon('review')} ${t.review} ` +
    `${name(teamRoles.reviewer)} → ${icon('summary')} ${t.summary} ${name(teamRoles.summarizer)}`)

  // Planner and summarizer only read; ACP agents enforce it by declining edit permissions.
  const step = async (kind, label, agentId, prompt, { readOnly = false, show = out => out } = {}) => {
    emit(`\n\n---\n\n## ${icon(kind)} ${label} — ${name(agentId)}\n\n> ${icon('working')} ${name(agentId)} ${t.working}\n\n`)
    const started = Date.now()
    mcpSession?.setReadOnly(readOnly)
    const { text } = await runAgent(agentId, prompt, { signal, workspace: workspace ?? 'agent-team', readOnly, bridge, mcpSession })
    const out = text.trim() || '(no output)'
    const seconds = Math.round((Date.now() - started) / 1000)
    const entry = { kind, label, agent: name(agentId), seconds, result: icon('done') }
    record.push(entry)
    emit(`${show(out, entry)}\n\n> ${icon('done')} ${t.done(seconds)}`)
    return out
  }

  // The reviewer's first line is the verdict; show it as a badge instead of the raw marker.
  const showReview = (out, entry) => {
    const verdict = /VERDICT:\s*CHANGES_REQUESTED/i.test(out) ? 'changes' : /VERDICT:\s*APPROVE/i.test(out) ? 'approve' : 'noVerdict'
    entry.result = `${icon(verdict)} ${t[verdict]}`
    const note = verdict === 'changes' ? `：${t.changesNote}` : ''
    return `${icon(verdict)} **${t[verdict]}**${note}\n\n${out.replace(/^.*VERDICT:\s*\w+.*\n?/i, '').trim()}`
  }

  const plannerInstructions = bridge
    ? `Do not create or edit files. Complete the planner's work in this order:
1. Before writing the plan, perform any read-only information lookup the task requires from you as planner. Use the
cloudflare_os MCP tools yourself and wait for their results. Pi executeCode calls to read-only resource APIs are
allowed in this role; native shell commands and mutations remain prohibited. Inspect bindings with describeBinding
when needed, then call their APIs with executeCode. Do not delegate your own required lookup to a later stage.
2. Report your actual findings or returned source URL and any task-required evidence marker. If a required lookup
fails or is unavailable, state the concrete limitation; do not claim it succeeded or present a future call as completed.
3. Then write a short numbered plan (at most 10 lines) grounded in those results. For an information-only or chat-only
task, plan the requested answer and checks. Describe files to change only when the task actually needs file changes.`
    : `Do not create or edit files. Write a short numbered implementation plan (at most 10 lines) for the task below: which
files to create or change, what goes in each, and how to check it works.`
  const plan = await step('plan', t.plan, teamRoles.planner, `${teamPreamble('planner')}
${plannerInstructions}

Task:
${task}`, { readOnly: true })

  let report = await step('implement', t.implement, teamRoles.implementer, `${teamPreamble('implementer')}
Implement the task by creating or editing files, following the plan. Do not run commands or tests yourself; the
reviewer runs them next. Finish with the list of files you changed and a one-line summary of each.

Task:
${task}

Plan (from ${name(teamRoles.planner)}):
${plan}`)

  let review = ''
  for (let round = 0; ; round++) {
    review = await step('review', round ? `${t.rereview}${t.round(round)}` : t.review, teamRoles.reviewer, `${teamPreamble('reviewer')}
Review the files in the workspace against the task. Do not modify any file. The first line of your reply must be exactly
"VERDICT: APPROVE" or "VERDICT: CHANGES_REQUESTED". Then list concrete problems (file, what is wrong, how to fix);
request changes only for real bugs or unmet requirements, not style.
Judge this run using the current plan and implementer's report below. Earlier conversation outcomes are history;
check the current evidence before carrying forward an earlier failure or missing-result claim.

Task:
${task}

Current plan (from ${name(teamRoles.planner)}):
${plan}

Current implementer's report (from ${name(teamRoles.implementer)}):
${report}`, { readOnly: true, show: showReview })
    if (!/VERDICT:\s*CHANGES_REQUESTED/i.test(review) || round >= teamFixRounds) break
    report = await step('fix', `${t.fix}${t.round(round + 1)}`, teamRoles.implementer, `${teamPreamble('implementer')}
The reviewer requested changes. Fix the problems in the workspace files (do not run commands; the reviewer re-checks),
then list what you changed.
Use this run's current plan, report, and review below; earlier conversation outcomes are historical.

Task:
${task}

Current plan (from ${name(teamRoles.planner)}):
${plan}

Current implementer's report (from ${name(teamRoles.implementer)}):
${report}

Current review (from ${name(teamRoles.reviewer)}):
${review}`)
  }

  await step('summary', t.summary, teamRoles.summarizer, `${teamPreamble('reporter')}
Do not edit files. Write the final answer for the user in a few lines: what was built (file names), how to use or run
it, and the reviewer's verdict with any remaining issues.

Task:
${task}

Plan:
${plan}

Implementer's report:
${report}

Final review:
${review}`, { readOnly: true })

  const verdict = record.findLast(e => e.kind === 'review')?.result ?? ''
  emit(`\n\n---\n\n## ${icon('record')} ${t.record}\n\n| ${t.stage} | ${t.agent} | ${t.time} | ${t.result} |\n| --- | --- | --- | --- |\n` +
    record.map(e => `| ${icon(e.kind)} ${e.label} | ${e.agent} | ${t.s(e.seconds)} | ${e.result} |`).join('\n') +
    `\n| **${t.total}** | | **${t.s(Math.round((Date.now() - teamStarted) / 1000))}** | ${verdict} |`)
  return { text: transcript }
}

// ---- prompt construction ---------------------------------------------------------------------

function contentText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(part => {
    if (typeof part === 'string') return part
    if (['text', 'input_text', 'output_text'].includes(part?.type)) return part.text ?? ''
    if (part?.type === 'image_url' || part?.type === 'input_image') return '[image omitted]'
    return ''
  }).filter(Boolean).join('\n')
}

// Tool-enabled callers share their system prompt and bindings through the Pi MCP bridge;
// callers without tools keep the native agent's own prompt. Native tool turns resume the
// same process. When a session expires, recorded history and results seed its replacement.
export function buildPrompt(messages, { hasTools = false } = {}) {
  const turns = []
  for (const message of messages ?? []) {
    if (!hasTools && (message.role === 'system' || message.role === 'developer')) continue
    let text = contentText(message.content)
    if (message.role === 'assistant' && message.tool_calls?.length) {
      text += message.tool_calls.map(c => `\n[called ${c.function?.name}(${c.function?.arguments ?? ''})]`).join('')
    }
    if (message.role === 'tool') text = `[completed tool result ${message.tool_call_id ?? ''}; do not repeat this call] ${text}`
    if (text.trim()) turns.push({ role: message.role, text: text.trim() })
  }
  const lastUser = turns.findLastIndex(t => t.role === 'user')
  if (lastUser === -1) throw new HttpError(400, 'no user message')
  const history = turns.slice(0, lastUser)
  const latest = turns.slice(lastUser).map(t => t.text).join('\n\n')
  if (!history.length) return latest
  const transcript = history.map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`).join('\n\n')
  return `Conversation so far:\n\n${transcript}\n\n---\nLatest user message:\n\n${latest}`
}

// ---- execution + HTTP ------------------------------------------------------------------------

const running = new Map()

async function runAgent(id, prompt, { signal, onDelta, workspace, readOnly, bridge, mcpSession } = {}) {
  const agent = agents[id]
  if (!agent) throw new HttpError(404, `unknown model "${id}"`)
  if (!agent.available()) throw new HttpError(503, `${agent.name} is not configured in agent-runner`)
  if ((running.get(id) ?? 0) >= (agent.maxConcurrent ?? maxConcurrent)) throw new HttpError(429, `${agent.name} is busy`)
  const cwd = join(workspaceRoot, workspace ?? agent.workspace ?? id)
  mkdirSync(cwd, { recursive: true })
  running.set(id, (running.get(id) ?? 0) + 1)
  const permit = { id, held: true }
  if (mcpSession) {
    mcpSession.runnerPermits ??= new Set()
    mcpSession.runnerPermits.add(permit)
  }
  const started = Date.now()
  try {
    const result = await agent.run(prompt, { cwd, workspace: workspace ?? agent.workspace ?? id,
      signal, onDelta, readOnly, bridge, mcpSession })
    log(`${id} ok in ${((Date.now() - started) / 1000).toFixed(1)}s (${result.text.length} chars)`)
    return result
  } finally {
    if (permit.held) running.set(id, running.get(id) - 1)
    mcpSession?.runnerPermits?.delete(permit)
  }
}

function log(message) { console.log(`[${new Date().toISOString()}] ${message}`) }

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 20_000_000) throw new HttpError(413, 'request too large')
  }
  try { return JSON.parse(body || '{}') } catch { throw new HttpError(400, 'invalid JSON body') }
}

const withUsageTotal = usage => usage && { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens }

const mcpSessions = new Map()
const continuationAliases = new Map()
let activeServerPort = port
const sessionTtlMs = Number(env.AGENT_RUNNER_MCP_SESSION_TTL_SECONDS ?? 1800) * 1000
const maxMcpSessions = Number(env.AGENT_RUNNER_MCP_MAX_SESSIONS ?? 16)
const nativeCallId = id => typeof id === 'string' ? id.split('|', 1)[0] : id

function retireSession(entry, error = new Error('Pi MCP session retired')) {
  clearTimeout(entry.timer)
  entry.session.close(error)
  mcpSessions.delete(entry.session.id)
  for (const [id, target] of continuationAliases) if (target === entry) continuationAliases.delete(id)
}

function parkSession(session) {
  for (const permit of session.runnerPermits ?? []) {
    // Teams share one persistent workspace; its exclusive lease lasts across MCP waits.
    if (permit.held && permit.id !== 'agent-team') { running.set(permit.id, running.get(permit.id) - 1); permit.held = false }
  }
}

function wakeSession(session) {
  const permits = [...session.runnerPermits ?? []].filter(permit => !permit.held)
  for (const permit of permits) {
    if ((running.get(permit.id) ?? 0) >= (agents[permit.id].maxConcurrent ?? maxConcurrent)) {
      throw new HttpError(429, `${agents[permit.id].name} is busy`)
    }
  }
  for (const permit of permits) {
    running.set(permit.id, (running.get(permit.id) ?? 0) + 1); permit.held = true
  }
}

function normalizeTools(tools = []) {
  return tools.filter(tool => tool.type === 'function').map(tool => tool.function ? tool : {
    type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  })
}

// Resume only the newest bridge call batch, never an older call merely present in chat history.
function bridgeContinuation(messages) {
  const index = messages.findLastIndex(message => message.role === 'assistant')
  if (index < 0 || !messages[index].tool_calls?.some(call => sessionIdFromCallId(call.id)) ||
      messages.slice(index + 1).some(message => message.role !== 'tool')) return undefined
  const calls = messages[index].tool_calls.filter(call => sessionIdFromCallId(call.id))
  const sessionId = sessionIdFromCallId(calls[0].id)
  if (calls.some(call => sessionIdFromCallId(call.id) !== sessionId)) {
    throw new HttpError(400, 'mixed Pi MCP sessions in one tool result batch')
  }
  const ids = new Set(calls.map(call => nativeCallId(call.id)))
  const results = messages.slice(index + 1).filter(message => message.role === 'tool' &&
    ids.has(nativeCallId(message.tool_call_id))).map(message => ({
    tool_call_id: nativeCallId(message.tool_call_id), content: contentText(message.content),
  }))
  if (!results.length) return undefined
  if (new Set(results.map(result => result.tool_call_id)).size !== ids.size) {
    throw new HttpError(400, 'incomplete Pi MCP tool result batch')
  }
  const unique = new Map()
  for (const result of results) {
    if (unique.has(result.tool_call_id) && unique.get(result.tool_call_id).content !== result.content) {
      throw new HttpError(400, 'conflicting duplicate Pi MCP tool result')
    }
    unique.set(result.tool_call_id, result)
  }
  return { sessionId, results: [...unique.values()].sort((a, b) => a.tool_call_id.localeCompare(b.tool_call_id)) }
}

async function modelTurn(model, messages, tools, { signal, onDelta } = {}) {
  const normalized = normalizeTools(tools)
  const continuation = bridgeContinuation(messages)
  if (!normalized.length) {
    const obsolete = continuation && (mcpSessions.get(continuation.sessionId) ?? continuationAliases.get(continuation.sessionId))
    if (obsolete) retireSession(obsolete, new Error('Pi tools removed from current request'))
    return runAgent(model, buildPrompt(messages), { signal, onDelta })
  }
  const signature = JSON.stringify({ tools: normalized,
    context: messages.filter(message => ['system', 'developer'].includes(message.role)) })
  let entry = continuation && (mcpSessions.get(continuation.sessionId) ?? continuationAliases.get(continuation.sessionId))
  if (entry && entry.model !== model) throw new HttpError(400, 'Pi MCP session belongs to another model')
  if (entry?.expired || entry?.failed) { retireSession(entry); entry = undefined }
  const cacheKey = continuation ? JSON.stringify(continuation.results) : 'initial'
  if (entry && entry.signature !== signature) {
    retireSession(entry, new Error('Pi chat tools or binding context changed'))
    entry = undefined
  }
  if (entry?.turns.has(cacheKey)) return entry.turns.get(cacheKey)

  if (!entry) {
    if (mcpSessions.size >= maxMcpSessions) {
      const retired = [...mcpSessions.values()].find(candidate => candidate.finished || candidate.expired)
      if (retired) retireSession(retired)
    }
    if (mcpSessions.size >= maxMcpSessions) throw new HttpError(429, 'Pi MCP session capacity reached')
    const abort = new AbortController()
    let created
    const session = new PiMcpSession(normalized, {
      ttlMs: sessionTtlMs,
      onClose: error => {
        if (created && !created.finished) { created.expired = true; created.abort.abort(error) }
      },
    })
    entry = created = { model, signature, session, abort, turns: new Map(), buffer: '', streamed: false,
      expired: false, deltaListener: onDelta }
    if (continuation) continuationAliases.set(continuation.sessionId, entry)
    mcpSessions.set(session.id, entry)
    // Retain completed responses for duplicate result delivery, bounded by the same lifetime.
    entry.timer = setTimeout(() => {
      retireSession(entry, new Error('Pi MCP session expired'))
    }, sessionTtlMs)
    entry.timer.unref()
    const endpoint = `http://127.0.0.1:${activeServerPort}/mcp/${session.id}`
    const bridge = { endpoint, token: session.token }
    // A recorded bridge call anchors follow-up file continuity. New chats have no such ID and
    // receive independent directories, while restarts retain this chat's original workspace.
    const anchor = messages.flatMap(message => message.tool_calls ?? [])
      .map(call => sessionIdFromCallId(call.id)).find(Boolean) ?? session.id
    let prompt = buildPrompt(messages, { hasTools: true }) +
      '\n\nCloudflare OS tools are available through the cloudflare_os MCP server. Use describeBinding ' +
      'to learn the current chat bindings, then executeCode to call their APIs. Pi applies tool ' +
      'validation, binding scopes, observation logging, and write approvals. Native filesystem ' +
      'edits only affect the runner workspace; use the OS tools when the task targets a Gadget. ' +
      'Completed tool results in the transcript are recorded work: do not repeat those calls.'
    if (continuation) prompt += '\nA previous native session expired. Continue from the recorded results; ' +
      'do not rerun completed tools or writes. Request only the next necessary action.'
    entry.native = runAgent(model, prompt, {
      signal: abort.signal, workspace: `pi-${anchor}`, bridge, mcpSession: session,
      onDelta: delta => { entry.streamed = true; entry.buffer += delta; entry.deltaListener?.(delta) },
    }).then(result => { entry.finished = true; return { kind: 'final', result } }, error => {
      entry.finished = true
      entry.failed = true
      entry.session.close(error)
      return { kind: 'error', error }
    })
  } else {
    // The exact batch is validated atomically by PiMcpSession before any paused call is resumed.
    try { entry.session.validateResults(continuation.results) } catch (error) {
      throw new HttpError(400, error.message)
    }
    wakeSession(entry.session)
    entry.deltaListener = onDelta
    entry.session.submitResults(continuation.results)
  }
  const current = entry
  const turn = (async () => {
    const waitAbort = new AbortController()
    const abortWait = () => {
      // A model HTTP request can be retried after disconnect. The native MCP call and its cached
      // turn survive it; native timeout, session TTL and registry capacity bound their lifetime.
      if (current.deltaListener === onDelta) current.deltaListener = undefined
    }
    signal?.addEventListener('abort', abortWait, { once: true })
    if (signal?.aborted) abortWait()
    try {
      const outcome = await Promise.race([
        current.native,
        current.session.waitForCalls({ signal: waitAbort.signal }).then(() => ({ kind: 'tools' }), error => ({ kind: 'error', error })),
      ])
      if (outcome.kind === 'error') { current.session.close(outcome.error); throw outcome.error }
      const text = current.buffer
      current.buffer = ''
      if (outcome.kind === 'tools') {
        parkSession(current.session)
        return { text, toolCalls: current.session.takeCalls(), usage: {
          prompt_tokens: Math.max(1, Math.ceil(buildPrompt(messages, { hasTools: true }).length / 4)),
          completion_tokens: 1,
        } }
      }
      current.session.close()
      return { ...outcome.result, text: current.streamed ? text : outcome.result.text }
    } finally {
      waitAbort.abort()
      signal?.removeEventListener('abort', abortWait)
      if (current.deltaListener === onDelta) current.deltaListener = undefined
    }
  })()
  current.turns.set(cacheKey, turn)
  return turn
}

async function mcpRequest(req, res, id) {
  const entry = mcpSessions.get(id)
  if (!entry || entry.expired) throw new HttpError(404, 'Pi MCP session expired or unavailable')
  if (req.headers.authorization !== `Bearer ${entry.session.token}`) throw new HttpError(401, 'invalid Pi MCP session token')
  const message = await readJson(req)
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') throw new HttpError(400, 'invalid MCP request')
  if (message.id === undefined) {
    res.writeHead(202); return res.end()
  }
  let result
  try {
    switch (message.method) {
      case 'initialize': result = { protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18'].includes(message.params?.protocolVersion)
        ? message.params.protocolVersion : '2025-06-18', capabilities: { tools: {} },
        serverInfo: { name: 'cloudflare_os', version: '1.0.0' } }; break
      case 'ping': result = {}; break
      case 'tools/list': result = { tools: entry.session.mcpTools }; break
      case 'tools/call': {
        if (entry.finished) throw new Error('native agent turn already completed')
        result = { content: [{ type: 'text',
          text: await entry.session.callTool(message.params?.name, message.params?.arguments ?? {}) }] }; break
      }
      default: return sendJson(res, 200, { jsonrpc: '2.0', id: message.id,
        error: { code: -32601, message: 'method not found' } })
    }
    return sendJson(res, 200, { jsonrpc: '2.0', id: message.id, result })
  } catch (error) {
    return sendJson(res, 200, { jsonrpc: '2.0', id: message.id,
      error: { code: -32602, message: error.message } })
  }
}

async function chatCompletions(req, res) {
  const body = await readJson(req)
  const model = String(body.model ?? '').replace(/^[a-z_]+\//, '')
  if (!agents[model]) throw new HttpError(404, `unknown model "${body.model}"`)
  const prompt = buildPrompt(body.messages, { hasTools: Boolean(body.tools?.length) })
  const id = `chatcmpl-${randomUUID()}`
  const created = Math.floor(Date.now() / 1000)
  const abort = new AbortController()
  res.on('close', () => { if (!res.writableFinished) abort.abort() })
  log(`${model} <- ${prompt.length} chars${body.stream ? ' (stream)' : ''}`)

  if (!body.stream) {
    const { text, usage, toolCalls } = await modelTurn(model, body.messages, body.tools, { signal: abort.signal })
    return sendJson(res, 200, {
      id, object: 'chat.completion', created, model,
      choices: [{ index: 0, message: { role: 'assistant', content: text || (toolCalls ? null : ''),
        ...(toolCalls ? { tool_calls: toolCalls } : {}) }, finish_reason: toolCalls ? 'tool_calls' : 'stop' }],
      usage: withUsageTotal(usage),
    })
  }

  // Streaming: open the stream at once and keep it alive while the agent works. The CLIs run in
  // print mode, so their answer comes in one piece; the agent team streams each finished stage.
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  const chunk = (delta, finish = null, extra = {}) => res.write(`data: ${JSON.stringify({
    id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`)
  chunk({ role: 'assistant', content: '' })
  const keepAlive = setInterval(() => res.write(': working\n\n'), 10_000)
  let streamed = false
  const onDelta = content => { streamed = true; chunk({ content }) }
  try {
    const { text, usage, toolCalls } = await modelTurn(model, body.messages, body.tools, { signal: abort.signal, onDelta })
    if (!streamed) chunk({ content: text })
    if (toolCalls) chunk({ tool_calls: toolCalls.map((call, index) => ({ index, ...call })) })
    chunk({}, toolCalls ? 'tool_calls' : 'stop', usage ? { usage: withUsageTotal(usage) } : {})
  } catch (err) {
    if (err.status === 499) return
    log(`${model} error: ${err.message}`)
    chunk({ content: `${streamed ? '\n\n' : ''}[agent-runner] ${err.message}` })
    chunk({}, 'stop')
  } finally {
    clearInterval(keepAlive)
    if (!res.writableEnded) res.end('data: [DONE]\n\n')
  }
}

// Responses API items -> chat-style messages, so both APIs share buildPrompt. LiteLLM's `openai/`
// provider forwards Cloudflare OS's /v1/responses calls here unchanged.
export function responsesInputToMessages(input) {
  if (typeof input === 'string') return [{ role: 'user', content: input }]
  const messages = []
  for (const item of input ?? []) {
    if (item.type === 'function_call') {
      const call = { id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } }
      // Consecutive function items form one assistant batch, matching chat-completions semantics.
      const previous = messages.at(-1)
      if (previous?.role === 'assistant' && previous.tool_calls) previous.tool_calls.push(call)
      else messages.push({ role: 'assistant', content: '', tool_calls: [call] })
    } else if (item.type === 'function_call_output') {
      messages.push({ role: 'tool', tool_call_id: item.call_id,
        content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output) })
    } else if (item.role) {
      messages.push({ role: item.role, content: item.content })
    }
  }
  return messages
}

async function responses(req, res) {
  const body = await readJson(req)
  const model = String(body.model ?? '').replace(/^[a-z_]+\//, '')
  if (!agents[model]) throw new HttpError(404, `unknown model "${body.model}"`)
  const messages = responsesInputToMessages(body.input)
  if (body.instructions) messages.unshift({ role: 'system', content: body.instructions })
  const prompt = buildPrompt(messages, { hasTools: Boolean(body.tools?.length) })
  const responseId = `resp_${randomUUID().replaceAll('-', '')}`
  const messageId = `msg_${randomUUID().replaceAll('-', '')}`
  const createdAt = Math.floor(Date.now() / 1000)
  const abort = new AbortController()
  res.on('close', () => { if (!res.writableFinished) abort.abort() })
  log(`${model} <- ${prompt.length} chars via responses${body.stream ? ' (stream)' : ''}`)

  const message = text => ({ id: messageId, type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }] })
  const response = (status, output, usage) => ({
    id: responseId, object: 'response', created_at: createdAt, status, model, output,
    ...(usage ? { usage: { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens,
      total_tokens: usage.prompt_tokens + usage.completion_tokens } } : {}),
  })
  const functionItems = calls => (calls ?? []).map(call => ({
    id: `fc_${nativeCallId(call.id)}`, type: 'function_call', status: 'completed',
    call_id: nativeCallId(call.id), name: call.function.name, arguments: call.function.arguments,
  }))

  if (!body.stream) {
    const { text, usage, toolCalls } = await modelTurn(model, messages, body.tools, { signal: abort.signal })
    return sendJson(res, 200, response('completed', [...(text || !toolCalls ? [message(text)] : []), ...functionItems(toolCalls)], usage))
  }

  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  let sequence = 0
  const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...data })}\n\n`)
  const part = { item_id: messageId, output_index: 0, content_index: 0 }
  event('response.created', { response: response('in_progress', []) })
  event('response.in_progress', { response: response('in_progress', []) })
  const keepAlive = setInterval(() => res.write(': working\n\n'), 10_000)
  let text = '', usage, toolCalls, messageStarted = false
  const startMessage = () => {
    if (messageStarted) return
    messageStarted = true
    event('response.output_item.added', { output_index: 0, item: { ...message(''), status: 'in_progress', content: [] } })
    event('response.content_part.added', { ...part, part: { type: 'output_text', text: '', annotations: [] } })
  }
  const onDelta = delta => { startMessage(); text += delta; event('response.output_text.delta', { ...part, delta }) }
  try {
    const result = await modelTurn(model, messages, body.tools, { signal: abort.signal, onDelta })
    usage = result.usage
    toolCalls = result.toolCalls
    if (!text && (result.text || !toolCalls)) onDelta(result.text)
  } catch (err) {
    if (err.status === 499) { clearInterval(keepAlive); return }
    log(`${model} error: ${err.message}`)
    onDelta(`${text ? '\n\n' : ''}[agent-runner] ${err.message}`)
  }
  clearInterval(keepAlive)
  if (res.writableEnded) return
  const output = []
  if (messageStarted) {
    event('response.output_text.done', { ...part, text })
    event('response.content_part.done', { ...part, part: { type: 'output_text', text, annotations: [] } })
    event('response.output_item.done', { output_index: 0, item: message(text) })
    output.push(message(text))
  }
  for (const item of functionItems(toolCalls)) {
    const output_index = output.length
    event('response.output_item.added', { output_index, item: { ...item, status: 'in_progress', arguments: '' } })
    event('response.function_call_arguments.delta', { item_id: item.id, output_index, delta: item.arguments })
    event('response.function_call_arguments.done', { item_id: item.id, output_index, arguments: item.arguments })
    event('response.output_item.done', { output_index, item })
    output.push(item)
  }
  event('response.completed', { response: response('completed', output, usage) })
  res.end()
}

export function createRunnerServer({ authorizationToken = token, agentOverrides = {} } = {}) {
  if (!authorizationToken) throw new Error('AGENT_RUNNER_TOKEN is not set; refusing an unauthenticated runner')
  const originals = Object.fromEntries(Object.keys(agentOverrides).map(id => [id, agents[id]]))
  Object.assign(agents, agentOverrides)
  const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, agents: Object.fromEntries(Object.entries(agents)
        .map(([agentId, a]) => [agentId, { available: a.available(), running: running.get(agentId) ?? 0 }])) })
    }
    const mcp = /^\/mcp\/([a-f0-9-]{36})$/.exec(url.pathname)
    if (req.method === 'POST' && mcp) return await mcpRequest(req, res, mcp[1])
    const auth = req.headers.authorization ?? ''
    if (auth !== `Bearer ${authorizationToken}` && req.headers['x-api-key'] !== authorizationToken) throw new HttpError(401, 'invalid runner token')
    if (req.method === 'GET' && url.pathname === '/v1/models') {
      return sendJson(res, 200, { object: 'list', data: Object.entries(agents).filter(([, a]) => a.available())
        .map(([agentId, a]) => ({ id: agentId, object: 'model', owned_by: 'agent-runner', name: a.name })) })
    }
    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') return await chatCompletions(req, res)
    if (req.method === 'POST' && url.pathname === '/v1/responses') return await responses(req, res)
    throw new HttpError(404, 'not found')
  } catch (err) {
    const status = err.status ?? 500
    if (status >= 500) log(`error: ${err.stack ?? err.message}`)
    if (!res.headersSent) sendJson(res, status, { error: { message: err.message, type: 'agent_runner_error' } })
    else if (!res.writableEnded) res.end()
  }
  })
  server.requestTimeout = 0
  server.nativeTeardown = Promise.resolve()
  server.on('listening', () => { activeServerPort = server.address().port })
  server.on('close', () => {
    const entries = [...mcpSessions.values()]
    for (const entry of entries) retireSession(entry)
    server.nativeTeardown = Promise.allSettled([...entries.map(entry => entry.native), ...childTeardowns])
    for (const [id, original] of Object.entries(originals)) {
      if (original) agents[id] = original
      else delete agents[id]
    }
  })
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createRunnerServer()
  server.listen(port, '0.0.0.0', () => {
    log(`agent-runner listening on :${port} (workspace ${workspaceRoot})`)
    for (const [agentId, a] of Object.entries(agents)) log(`  ${agentId.padEnd(16)} ${a.available() ? 'ready' : 'not configured'}`)
  })
}
