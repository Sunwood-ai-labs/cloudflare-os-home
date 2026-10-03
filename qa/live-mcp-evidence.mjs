// Evidence derived only from assistant messages and successful Pi tool executions.
const stageNames = {
  Plan: 'plan', Implement: 'implement', Review: 'review', Fix: 'fix',
  'Re-review': 'review', Summary: 'summary',
  計画: 'plan', 実装: 'implement', レビュー: 'review', 修正: 'fix', 再レビュー: 'review', まとめ: 'summary',
}
const labels = Object.keys(stageNames).sort((a, b) => b.length - a.length).join('|')
const canonicalId = id => String(id ?? '').split('|')[0]
const officialUrl = /https:\/\/(?:developers\.openai\.com|platform\.openai\.com)\//

export function createLiveMcpEvidenceTracker(evidence) {
  evidence.assistantTranscript = []
  evidence.stages = []
  const stageTexts = new Map()
  let currentStage
  return {
    stageForCall() {
      return currentStage && { stageId: currentStage.id, stage: currentStage.name, agent: currentStage.agent }
    },
    recordAssistant(message) {
      const text = message.content?.filter(part => part.type === 'text').map(part => part.text).join('') ?? ''
      const toolCalls = message.content?.filter(part => part.type === 'toolCall')
        .map(part => ({ id: part.id, name: part.name, arguments: part.arguments })) ?? []
      const segments = []
      const addSegment = segment => {
        if (!segment) return
        segments.push({ stageId: currentStage?.id, text: segment })
        if (currentStage) stageTexts.set(currentStage.id, (stageTexts.get(currentStage.id) ?? '') + segment)
      }
      let cursor = 0
      const headings = new RegExp(`^##[^\\n]*?\\s(${labels})([^\\n]*?)\\s+—\\s+([^\\n]+)$`, 'gm')
      for (const match of text.matchAll(headings)) {
        // A resumed response starts with the previous stage's result. Attribute it
        // before switching to the next header, so omitted final-summary tokens are fine.
        addSegment(text.slice(cursor, match.index))
        currentStage = { id: `stage_${evidence.stages.length + 1}`, name: stageNames[match[1]],
          label: (match[1] + match[2]).trim(), agent: match[3].trim() }
        evidence.stages.push(currentStage)
        cursor = match.index
      }
      addSegment(text.slice(cursor))
      evidence.assistantTranscript.push({ stopReason: message.stopReason, text, toolCalls, segments })
    },
    finish(final) {
      const transcript = evidence.assistantTranscript.map(message => message.text).join('\n')
      const declaredCalls = evidence.assistantTranscript.flatMap(message => message.toolCalls)
      evidence.consumedVerifierTokens = evidence.nativeToolCalls.filter(call => transcript.includes(call.verifier)).map(call => call.verifier)
      evidence.finalAnswerVerifierTokens = evidence.nativeToolCalls.filter(call => evidence.finalAnswer.includes(call.verifier)).map(call => call.verifier)
      evidence.stageResults = evidence.stages.map(stage => {
        const calls = evidence.nativeToolCalls.filter(call => call.stageId === stage.id)
        const consumed = calls.filter(call => (stageTexts.get(stage.id) ?? '').includes(call.verifier))
        return { ...stage, realPublicMcpCalls: calls.length, consumedOwnVerifierTokens: consumed.map(call => call.verifier),
          success: calls.length > 0 && consumed.length > 0 }
      })
      if (evidence.model === 'agent-team') {
        const required = ['plan', 'implement', 'review', 'summary']
        const rowLabel = new RegExp(`\\s(${labels})(?:\\s+\\(round \\d+\\)|（[^）]+）)?\\s*$`)
        const loggedStages = transcript.split('\n').filter(line => line.startsWith('| ')).flatMap(line => {
          const cells = line.split('|')
          const match = cells[1]?.match(rowLabel)
          return match ? [{ label: cells[1].slice(match.index).trim(), name: stageNames[match[1]], agent: cells[2]?.trim() }] : []
        })
        const logMatches = loggedStages.length === evidence.stages.length && loggedStages.every((stage, index) =>
          stage.name === evidence.stages[index].name && stage.agent === evidence.stages[index].agent)
        evidence.teamStageCoverage = { required, loggedStages, logMatches,
          missing: required.filter(name => !evidence.stageResults.some(stage => stage.name === name)),
          failed: evidence.stageResults.filter(stage => !stage.success).map(stage => stage.id),
          unmappedCalls: evidence.nativeToolCalls.filter(call => !call.stageId).length }
      }
      evidence.pathVerified = evidence.nativeToolCalls.length > 0 &&
        evidence.publicMcpCalls.length === evidence.nativeToolCalls.length &&
        evidence.publicMcpCalls.every(call => call.status === 200 && call.method === 'tools/call' && !call.result?.isError) &&
        evidence.nativeToolCalls.every(call => declaredCalls.some(declared =>
          canonicalId(declared.id) === canonicalId(call.callId) && declared.name === call.name)) &&
        evidence.consumedVerifierTokens.length > 0
      const coverage = evidence.teamStageCoverage
      evidence.success = evidence.pathVerified && final?.stopReason === 'stop' && officialUrl.test(transcript) &&
        (!coverage || (coverage.missing.length === 0 && coverage.failed.length === 0 && coverage.unmappedCalls === 0 && coverage.logMatches))
    },
  }
}
