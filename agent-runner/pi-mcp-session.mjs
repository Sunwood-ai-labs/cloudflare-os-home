// A native agent's MCP calls become ordinary OpenAI tool calls. Pi remains the executor:
// it applies the chat's binding scopes, observations, and approval rules, then sends each
// result back with the same call ID on its next model request.
import { randomBytes, randomUUID } from 'node:crypto'

const CALL_PREFIX = 'cfos_'
const DIRECT_MUTATIONS = new Set([
  'writeFile', 'editFile', 'createGadget', 'createWorktree', 'setGadgetBinding', 'requestConnection',
])

/** Responses clients may append their item ID; the function call ID remains the authority. */
export function canonicalToolCallId(callId) {
  if (typeof callId !== 'string') return undefined
  return /^(cfos_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_[a-f0-9]{16})(?:\|[^|]+)?$/.exec(callId)?.[1]
}

/** Recover the bridge session from a call ID, without accepting another provider's IDs. */
export function sessionIdFromCallId(callId) {
  return canonicalToolCallId(callId)?.slice(CALL_PREFIX.length, CALL_PREFIX.length + 36)
}

/** One paused native agent run. Its token only grants access to its own original Pi tools. */
export class PiMcpSession {
  constructor(tools, { ttlMs = 900_000, maxPending = 64, maxCalls = 4096, maxBytes = 16_777_216, onClose } = {}) {
    if (!Array.isArray(tools)) throw new Error('Pi tools must be an array')
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Pi MCP lifetime must be positive')
    if (![maxPending, maxCalls, maxBytes].every(limit => Number.isSafeInteger(limit) && limit > 0)) {
      throw new Error('Pi MCP limits must be positive integers')
    }
    this.id = randomUUID()
    this.token = randomBytes(32).toString('base64url')
    this.tools = []
    this.calls = new Map()
    this.waiters = new Set()
    this.closed = false
    this.maxPending = maxPending
    this.maxCalls = maxCalls
    this.maxBytes = maxBytes
    this.dataBytes = Buffer.byteLength(JSON.stringify(tools))
    if (this.dataBytes > this.maxBytes) throw new Error('Pi MCP data limit reached')
    this.onClose = onClose
    this.readOnly = false
    this.names = new Set()
    for (const item of tools) {
      const tool = item?.function
      if (item?.type !== 'function' || typeof tool?.name !== 'string' || !tool.name ||
          !tool.parameters || typeof tool.parameters !== 'object' || Array.isArray(tool.parameters)) {
        throw new Error('Pi tools must use OpenAI function declarations')
      }
      if (this.names.has(tool.name)) throw new Error('Pi tools contain duplicate names')
      this.names.add(tool.name)
      this.tools.push(structuredClone(item))
    }
    this.timer = setTimeout(() => this.close(new Error('Pi MCP session expired')), ttlMs)
    this.timer.unref()
  }

  /** MCP catalog derived only from the declarations in this model request. */
  get mcpTools() {
    return this.tools.filter(({ function: tool }) => !this.readOnly || !DIRECT_MUTATIONS.has(tool.name))
      .map(({ function: tool }) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: structuredClone(tool.parameters),
      }))
  }

  /** Team read-only roles cannot request direct Pi file writes or connection changes. */
  setReadOnly(readOnly) { this.readOnly = Boolean(readOnly) }

  /** Pause an MCP request until Pi executes the corresponding OpenAI tool call. */
  callTool(name, args = {}) {
    if (this.closed) return Promise.reject(this.closeError)
    if (!this.names.has(name)) return Promise.reject(new Error('Tool is not available in this Pi chat'))
    if (this.readOnly && DIRECT_MUTATIONS.has(name)) {
      return Promise.reject(new Error('Tool is not available to this read-only team role'))
    }
    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
      return Promise.reject(new Error('Pi tool arguments must be an object'))
    }
    if (this.calls.size >= this.maxCalls ||
        [...this.calls.values()].filter(call => !call.resolved).length >= this.maxPending) {
      return Promise.reject(new Error('Pi MCP tool call limit reached'))
    }
    let argumentsJson
    try { argumentsJson = JSON.stringify(args) } catch {
      return Promise.reject(new Error('Pi tool arguments must be JSON serializable'))
    }
    if (typeof argumentsJson !== 'string' || !argumentsJson.startsWith('{')) {
      return Promise.reject(new Error('Pi tool arguments must serialize to an object'))
    }
    const argumentBytes = Buffer.byteLength(argumentsJson)
    if (this.dataBytes + argumentBytes > this.maxBytes) {
      return Promise.reject(new Error('Pi MCP data limit reached'))
    }
    // OpenAI function call IDs must remain under 64 characters. A random per-call suffix
    // avoids predictable IDs while allowing a response to identify its owning session.
    let id
    do { id = `${CALL_PREFIX}${this.id}_${randomBytes(8).toString('hex')}` } while (this.calls.has(id))
    const toolCall = { id, type: 'function', function: { name, arguments: argumentsJson } }
    const promise = new Promise((resolve, reject) => {
      this.calls.set(id, { toolCall, resolve, reject, sent: false, resolved: false })
    })
    this.dataBytes += argumentBytes
    this.#wake()
    return promise
  }

  /** New calls only: already emitted calls must never be executed twice by Pi. */
  pendingCalls() {
    return [...this.calls.values()].filter(call => !call.sent && !call.resolved)
      .map(call => structuredClone(call.toolCall))
  }

  /** Calls already handed to Pi whose results have not arrived, for response retries. */
  emittedCalls() {
    return [...this.calls.values()].filter(call => call.sent && !call.resolved)
      .map(call => structuredClone(call.toolCall))
  }

  /** Atomically mark a batch as emitted, retaining stable IDs while Pi is running it. */
  takeCalls() {
    if (this.closed) throw this.closeError
    const calls = this.pendingCalls()
    for (const call of calls) this.calls.get(call.id).sent = true
    return calls
  }

  /** Validate before reacquiring native capacity, without resuming any paused MCP call. */
  validateResults(results) {
    this.#resultBatch(results)
  }

  #resultBatch(results) {
    if (this.closed) throw this.closeError
    if (!Array.isArray(results)) throw new Error('Pi tool results must be an array')
    const batch = new Map()
    let resultBytes = 0
    for (const result of results) {
      if (result?.role !== undefined && result.role !== 'tool') {
        throw new Error('Pi tool results must have the tool role')
      }
      const id = canonicalToolCallId(result?.tool_call_id ?? result?.toolCallId ?? result?.call_id)
      const call = this.calls.get(id)
      if (!call?.sent) throw new Error('Tool result does not belong to this Pi MCP session')
      const value = result.content ?? result.output ?? ''
      const content = typeof value === 'string' ? value : JSON.stringify(value)
      if (typeof content !== 'string') throw new Error('Pi tool result must be JSON serializable')
      if ((call.resolved && call.content !== content) || (batch.has(id) && batch.get(id) !== content)) {
        throw new Error('Conflicting duplicate Pi tool result')
      }
      if (!call.resolved && !batch.has(id)) resultBytes += Buffer.byteLength(content)
      batch.set(id, content)
    }
    if (this.dataBytes + resultBytes > this.maxBytes) throw new Error('Pi MCP data limit reached')
    return { batch, resultBytes }
  }

  /** Resolve a validated result batch. Identical retransmissions are harmless. */
  submitResults(results) {
    const { batch, resultBytes } = this.#resultBatch(results)
    this.dataBytes += resultBytes
    for (const [id, content] of batch) {
      const call = this.calls.get(id)
      if (call.resolved) continue
      call.resolved = true
      call.content = content
      call.resolve(content)
    }
  }

  /** Wake the HTTP response loop when another native MCP call is queued. */
  waitForCalls({ signal } = {}) {
    if (this.closed) return Promise.reject(this.closeError)
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('Pi MCP wait aborted'))
    if (this.pendingCalls().length) return Promise.resolve(this.pendingCalls())
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, cleanup: () => signal?.removeEventListener('abort', abort) }
      const abort = () => {
        this.waiters.delete(waiter)
        waiter.cleanup()
        reject(signal.reason ?? new Error('Pi MCP wait aborted'))
      }
      this.waiters.add(waiter)
      signal?.addEventListener('abort', abort, { once: true })
    })
  }

  /** Fail closed and release every native call/waiter when a run ends or expires. */
  close(error = new Error('Pi MCP session closed')) {
    if (this.closed) return
    this.closed = true
    this.closeError = error instanceof Error ? error : new Error(String(error))
    clearTimeout(this.timer)
    for (const call of this.calls.values()) {
      if (!call.resolved) call.reject(this.closeError)
    }
    for (const waiter of this.waiters) {
      waiter.cleanup()
      waiter.reject(this.closeError)
    }
    this.waiters.clear()
    this.onClose?.(this.closeError)
  }

  #wake() {
    const calls = this.pendingCalls()
    for (const waiter of this.waiters) {
      waiter.cleanup()
      waiter.resolve(calls)
    }
    this.waiters.clear()
  }
}
