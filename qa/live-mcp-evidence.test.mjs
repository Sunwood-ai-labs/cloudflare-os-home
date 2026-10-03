import assert from 'node:assert/strict'
import test from 'node:test'
import { createLiveMcpEvidenceTracker } from './live-mcp-evidence.mjs'

const agents = { Plan: 'Antigravity', Implement: 'Claude Code (GLM)', Review: 'Codex', Fix: 'Claude Code (GLM)', 'Re-review': 'Codex', Summary: 'Hermes Agent' }
function teamRun({ skipped = [], labels = ['Plan', 'Implement', 'Review', 'Summary'], summaryToken = true } = {}) {
  const evidence = { model: 'agent-team', nativeToolCalls: [], publicMcpCalls: [], finalAnswer: '' }
  const tracker = createLiveMcpEvidenceTracker(evidence)
  let previousResult = ''
  for (const [index, label] of labels.entries()) {
    const name = label.replace(/ \(round \d+\)/, '')
    const call = { id: `cfos_00000000-0000-0000-0000-000000000000_${String(index).padStart(16, '0')}`, name: 'search_openai_docs', arguments: { query: 'schema' } }
    tracker.recordAssistant({ stopReason: 'toolUse', content: [
      { type: 'text', text: `${previousResult}\n## ![icon](https://icons.invalid/icon.svg) ${label} — ${agents[name]}\n` },
      ...(skipped.includes(label) ? [] : [{ type: 'toolCall', ...call }]),
    ] })
    previousResult = ''
    if (!skipped.includes(label)) {
      const verifier = `PUBLIC_MCP_VERIFIED_secret_from_actual_result_${index}`
      evidence.nativeToolCalls.push({ callId: call.id, name: call.name, verifier, ...tracker.stageForCall() })
      evidence.publicMcpCalls.push({ method: 'tools/call', status: 200, result: { content: [{ type: 'text', text: 'actual docs' }] } })
      previousResult = `Native stage consumed ${verifier}; https://developers.openai.com/api/docs/guides/structured-outputs\n`
    }
  }
  evidence.finalAnswer = (summaryToken ? previousResult : '') + '\n## Team log\n' + labels.map(label => {
    const name = label.replace(/ \(round \d+\)/, '')
    return `| ![icon](https://icons.invalid/icon.svg) ${label} | ${agents[name]} | 1s | done |`
  }).join('\n')
  const final = { stopReason: 'stop', content: [{ type: 'text', text: evidence.finalAnswer }] }
  tracker.recordAssistant(final)
  tracker.finish(final)
  return evidence
}

test('all four stages must consume their own actual tool result', () => {
  const evidence = teamRun()
  assert.equal(evidence.success, true)
  assert.equal(evidence.stageResults.length, 4)
  assert.equal(evidence.consumedVerifierTokens.length, 4)
  // Earlier tokens disappear from the final summary without losing their evidence.
  assert.equal(evidence.finalAnswerVerifierTokens.length, 1)
})

test('implementation and summary success cannot conceal skipped planner/reviewer MCP calls', () => {
  const evidence = teamRun({ skipped: ['Plan', 'Review'] })
  assert.equal(evidence.pathVerified, true)
  assert.equal(evidence.success, false)
  assert.deepEqual(evidence.teamStageCoverage.failed, ['stage_1', 'stage_3'])
})

test('every optional fix and re-review stage is checked independently', () => {
  const labels = ['Plan', 'Implement', 'Review', 'Fix (round 1)', 'Re-review (round 1)', 'Summary']
  assert.equal(teamRun({ labels }).success, true)
  const evidence = teamRun({ labels, skipped: ['Re-review (round 1)'] })
  assert.equal(evidence.success, false)
  assert.deepEqual(evidence.teamStageCoverage.failed, ['stage_5'])
})

test('summary cannot borrow a prior stage token instead of consuming its own result', () => {
  const evidence = teamRun({ summaryToken: false })
  assert.equal(evidence.success, false)
  assert.deepEqual(evidence.teamStageCoverage.failed, ['stage_4'])
})

test('public MCP execution without a declared native assistant call is not proof', () => {
  const evidence = { model: 'codex', finalAnswer: 'PUBLIC_MCP_VERIFIED_x https://developers.openai.com/api/docs/',
    nativeToolCalls: [{ callId: 'cfos_unproven', name: 'search_openai_docs', verifier: 'PUBLIC_MCP_VERIFIED_x' }],
    publicMcpCalls: [{ method: 'tools/call', status: 200, result: {} }] }
  const tracker = createLiveMcpEvidenceTracker(evidence)
  const final = { stopReason: 'stop', content: [{ type: 'text', text: evidence.finalAnswer }] }
  tracker.recordAssistant(final)
  tracker.finish(final)
  assert.equal(evidence.pathVerified, false)
  assert.equal(evidence.success, false)
})
