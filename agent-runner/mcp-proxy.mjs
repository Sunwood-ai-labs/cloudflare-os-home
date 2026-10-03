#!/usr/bin/env node
// MCP stdio transport shared by Claude Code, Codex, Hermes and Antigravity.
// The loopback runner endpoint holds calls until Pi supplies its tool result.
import { StringDecoder } from 'node:string_decoder'
import { request as httpRequest } from 'node:http'
import { pathToFileURL } from 'node:url'
import { validateMcpBridge } from './mcp-config.mjs'

const MAX_MESSAGE_BYTES = 20_000_000
const MAX_PENDING_REQUESTS = 128

function requestLoopback(endpoint, { method, headers, body, signal }) {
  // A tool call can wait for a user's Pi approval. Native fetch applies its own
  // header timeout; Node HTTP lets the runner's session deadline govern the wait.
  return new Promise((resolve, reject) => {
    const request = httpRequest(endpoint, { method, headers, signal }, response => {
      const chunks = []
      let bytes = 0
      response.on('data', chunk => {
        bytes += chunk.length
        if (bytes > MAX_MESSAGE_BYTES) { request.destroy(new Error('MCP response is too large')); return }
        chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('end', () => resolve({
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
        json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }))
    })
    request.on('error', reject)
    request.end(body)
  })
}

export function startMcpProxy({
  input = process.stdin, output = process.stdout,
  endpoint = process.env.CFOS_MCP_ENDPOINT,
  token = process.env.CFOS_MCP_TOKEN,
  fetchImpl = requestLoopback,
} = {}) {
  validateMcpBridge({ endpoint, token })
  const decoder = new StringDecoder('utf8')
  const pending = new Set()
  let buffer = '', closed = false
  const write = message => {
    if (!closed) output.write(JSON.stringify(message) + '\n')
  }
  const error = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } })
  const close = () => {
    if (closed) return
    closed = true
    for (const controller of pending) controller.abort()
    pending.clear()
    input.off('data', onData)
    input.off('end', onEnd)
    input.off('close', close)
    input.off('error', close)
    output.off('error', close)
  }

  const handleLine = async line => {
    if (!line.trim() || closed) return
    let message
    try { message = JSON.parse(line) } catch { error(null, -32700, 'Invalid JSON'); return }
    if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string'
        || ('id' in message && typeof message.id !== 'string' && typeof message.id !== 'number')) {
      error(null, -32600, 'Invalid JSON-RPC request')
      return
    }
    const hasId = Object.hasOwn(message, 'id')
    if (pending.size >= MAX_PENDING_REQUESTS) {
      if (hasId) error(message.id, -32000, 'MCP bridge is busy')
      return
    }
    const controller = new AbortController()
    pending.add(controller)
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(message), signal: controller.signal,
      })
      if (!response.ok) {
        if (hasId) error(message.id, -32603, `MCP bridge request failed (HTTP ${response.status})`)
        return
      }
      if (!hasId) return
      const result = await response.json()
      if (!result || result.jsonrpc !== '2.0' || result.id !== message.id
          || !(Object.hasOwn(result, 'result') !== Object.hasOwn(result, 'error'))) {
        error(message.id, -32603, 'Invalid MCP bridge response')
        return
      }
      write(result)
    } catch {
      // Never echo fetch errors, endpoint URLs, headers or credentials.
      if (!closed && hasId) error(message.id, -32603, 'MCP bridge request failed')
    } finally {
      pending.delete(controller)
    }
  }

  const onData = chunk => {
    buffer += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    let newline
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) {
        error(null, -32600, 'MCP message is too large')
        close()
        return
      }
      void handleLine(line)
    }
    if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
      error(null, -32600, 'MCP message is too large')
      close()
    }
  }
  const onEnd = () => { close() }
  input.on('data', onData)
  input.on('end', onEnd)
  input.on('close', close)
  input.on('error', close)
  output.on('error', close)
  return { close, get pendingRequests() { return pending.size } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { startMcpProxy() } catch {
    process.stderr.write('Invalid MCP bridge configuration\n')
    process.exitCode = 1
  }
}
