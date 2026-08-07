import type { editor } from 'monaco-editor'
import {
  type ChangeRun,
  type DiffModel,
  type LineSlice,
  DELETED_HEAD_TAIL,
  forEachLineSliceOfCharChange,
  MAX_DELETED_ROWS,
  MAX_INLINE_DIFF_LINE_LENGTH,
} from './diffModel'

/** Editor line height in px; matches CSS `.gadgets-deleted-num-row` height. */
const LINE_HEIGHT_PX = 20

export type RenderArgs = {
  editor: editor.IStandaloneCodeEditor
  monaco: typeof import('monaco-editor')
  model: DiffModel
  expandedDeletions: Set<string>
  decorationCollection: editor.IEditorDecorationsCollection | null
  /** View zone IDs from the previous render; will be removed before adding new ones. */
  previousViewZoneIds: readonly string[]
  onExpandDeletion: (deletionKey: string) => void
}

/**
 * Apply decorations and view zones for the given diff model. Returns the IDs
 * of the newly created view zones; the caller should pass these back as
 * `previousViewZoneIds` on the next render so they can be removed.
 */
export function renderDiffLayer({
  editor: ed,
  monaco,
  model,
  expandedDeletions,
  decorationCollection,
  previousViewZoneIds,
  onExpandDeletion,
}: RenderArgs): string[] {
  const editorModel = ed.getModel()
  if (!editorModel) return []

  const decorations: editor.IModelDeltaDecoration[] = []
  const deletions: ChangeRun[] = []
  const editorLineCount = editorModel.getLineCount()

  const stickiness = monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges

  for (const run of model.changes) {
    // Whole-line decorations: yellow for paired (replacement) lines, green
    // for pure inserts.
    for (let line = run.modifiedStart; line < run.modifiedStart + run.modifiedCount; line++) {
      if (line < 1 || line > editorLineCount) continue
      const paired = run.pairedModifiedLines.has(line)
      decorations.push({
        range: new monaco.Range(line, 1, line, editorModel.getLineMaxColumn(line)),
        options: {
          isWholeLine: true,
          className: 'gadgets-diff-line-add',
          marginClassName: paired ? 'gadgets-diff-margin-modified' : 'gadgets-diff-margin-add',
          lineNumberClassName: 'gadgets-diff-num-add',
          stickiness,
        },
      })
    }

    const pushModifiedInline = (line: number, startCol: number, endCol: number) => {
      if (line < 1 || line > editorLineCount) return
      if (!run.pairedModifiedLines.has(line)) return
      if (editorModel.getLineLength(line) > MAX_INLINE_DIFF_LINE_LENGTH) return
      const clampedEnd = Math.min(endCol, editorModel.getLineMaxColumn(line))
      if (startCol >= clampedEnd) return
      decorations.push({
        range: new monaco.Range(line, startCol, line, clampedEnd),
        options: { inlineClassName: 'gadgets-diff-inline-add', stickiness },
      })
    }
    for (const cc of run.charChanges) {
      forEachLineSliceOfCharChange(cc, 'modified', pushModifiedInline)
    }
    for (const [line, slices] of run.whitespaceModifiedRanges) {
      for (const slice of slices) pushModifiedInline(line, slice.startCol, slice.endCol)
    }

    if (run.originalCount > 0) deletions.push(run)
  }

  decorationCollection?.set(decorations)

  const newViewZoneIds: string[] = []
  ed.changeViewZones(accessor => {
    for (const id of previousViewZoneIds) accessor.removeZone(id)

    for (const run of deletions) {
      const nodes = createDeletionZoneNodes({
        run,
        expanded: expandedDeletions.has(run.key),
        onExpand: () => onExpandDeletion(run.key),
      })
      // Anchor before the change run's added lines (or before the next line
      // for pure deletions).
      const anchor = run.modifiedStart - 1
      newViewZoneIds.push(accessor.addZone({
        afterLineNumber: Math.max(0, Math.min(anchor, editorLineCount)),
        heightInPx: nodes.heightInPx,
        domNode: nodes.domNode,
        marginDomNode: nodes.marginDomNode,
      }))
    }
  })

  return newViewZoneIds
}

export type SplitRenderArgs = {
  editor: editor.IStandaloneCodeEditor
  monaco: typeof import('monaco-editor')
  model: DiffModel
  side: 'original' | 'modified'
  decorationCollection: editor.IEditorDecorationsCollection | null
  previousViewZoneIds: readonly string[]
}

export function renderSplitDiffLayer({
  editor: ed,
  monaco,
  model,
  side,
  decorationCollection,
  previousViewZoneIds,
}: SplitRenderArgs): string[] {
  const editorModel = ed.getModel()
  if (!editorModel) return []

  const decorations: editor.IModelDeltaDecoration[] = []
  const blankZones: Array<{ afterLineNumber: number, heightInPx: number }> = []
  const editorLineCount = editorModel.getLineCount()
  const stickiness = monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges

  for (const run of model.changes) {
    if (side === 'modified') {
      renderModifiedSideDecorations({ run, monaco, editorModel, decorations, stickiness })

      if (run.originalCount > run.modifiedCount) {
        blankZones.push({
          afterLineNumber: run.modifiedStart + run.modifiedCount - 1,
          heightInPx: (run.originalCount - run.modifiedCount) * LINE_HEIGHT_PX,
        })
      }
    } else {
      renderOriginalSideDecorations({ run, monaco, editorModel, decorations, stickiness })

      if (run.modifiedCount > run.originalCount) {
        blankZones.push({
          afterLineNumber: run.originalStart + run.originalCount - 1,
          heightInPx: (run.modifiedCount - run.originalCount) * LINE_HEIGHT_PX,
        })
      }
    }
  }

  decorationCollection?.set(decorations)

  const newViewZoneIds: string[] = []
  ed.changeViewZones(accessor => {
    for (const id of previousViewZoneIds) accessor.removeZone(id)

    for (const zone of blankZones) {
      const nodes = createBlankZoneNodes()
      newViewZoneIds.push(accessor.addZone({
        afterLineNumber: Math.max(0, Math.min(zone.afterLineNumber, editorLineCount)),
        heightInPx: Math.max(LINE_HEIGHT_PX, zone.heightInPx),
        domNode: nodes.domNode,
        marginDomNode: nodes.marginDomNode,
      }))
    }
  })

  return newViewZoneIds
}

function renderModifiedSideDecorations({
  run,
  monaco,
  editorModel,
  decorations,
  stickiness,
}: {
  run: ChangeRun
  monaco: typeof import('monaco-editor')
  editorModel: editor.ITextModel
  decorations: editor.IModelDeltaDecoration[]
  stickiness: editor.TrackedRangeStickiness
}) {
  const editorLineCount = editorModel.getLineCount()

  for (let line = run.modifiedStart; line < run.modifiedStart + run.modifiedCount; line++) {
    if (line < 1 || line > editorLineCount) continue
    const paired = run.pairedModifiedLines.has(line)
    decorations.push({
      range: new monaco.Range(line, 1, line, editorModel.getLineMaxColumn(line)),
      options: {
        isWholeLine: true,
        className: 'gadgets-diff-line-add',
        marginClassName: paired ? 'gadgets-diff-margin-modified' : 'gadgets-diff-margin-add',
        lineNumberClassName: 'gadgets-diff-num-add',
        stickiness,
      },
    })
  }

  const pushModifiedInline = (line: number, startCol: number, endCol: number) => {
    if (line < 1 || line > editorLineCount) return
    if (!run.pairedModifiedLines.has(line)) return
    if (editorModel.getLineLength(line) > MAX_INLINE_DIFF_LINE_LENGTH) return
    const clampedEnd = Math.min(endCol, editorModel.getLineMaxColumn(line))
    if (startCol >= clampedEnd) return
    decorations.push({
      range: new monaco.Range(line, startCol, line, clampedEnd),
      options: { inlineClassName: 'gadgets-diff-inline-add', stickiness },
    })
  }
  for (const cc of run.charChanges) {
    forEachLineSliceOfCharChange(cc, 'modified', pushModifiedInline)
  }
  for (const [line, slices] of run.whitespaceModifiedRanges) {
    for (const slice of slices) pushModifiedInline(line, slice.startCol, slice.endCol)
  }
}

function renderOriginalSideDecorations({
  run,
  monaco,
  editorModel,
  decorations,
  stickiness,
}: {
  run: ChangeRun
  monaco: typeof import('monaco-editor')
  editorModel: editor.ITextModel
  decorations: editor.IModelDeltaDecoration[]
  stickiness: editor.TrackedRangeStickiness
}) {
  const editorLineCount = editorModel.getLineCount()

  for (let line = run.originalStart; line < run.originalStart + run.originalCount; line++) {
    if (line < 1 || line > editorLineCount) continue
    const paired = run.pairedOriginalLines.has(line)
    decorations.push({
      range: new monaco.Range(line, 1, line, editorModel.getLineMaxColumn(line)),
      options: {
        isWholeLine: true,
        className: 'gadgets-diff-line-delete',
        marginClassName: paired ? 'gadgets-diff-margin-delete-modified' : 'gadgets-diff-margin-delete',
        lineNumberClassName: 'gadgets-diff-num-delete',
        stickiness,
      },
    })
  }

  const pushOriginalInline = (line: number, startCol: number, endCol: number) => {
    if (line < 1 || line > editorLineCount) return
    if (!run.pairedOriginalLines.has(line)) return
    if (editorModel.getLineLength(line) > MAX_INLINE_DIFF_LINE_LENGTH) return
    const clampedEnd = Math.min(endCol, editorModel.getLineMaxColumn(line))
    if (startCol >= clampedEnd) return
    decorations.push({
      range: new monaco.Range(line, startCol, line, clampedEnd),
      options: { inlineClassName: 'gadgets-diff-inline-delete', stickiness },
    })
  }
  for (const cc of run.charChanges) {
    forEachLineSliceOfCharChange(cc, 'original', pushOriginalInline)
  }
  for (const [line, slices] of run.whitespaceOriginalRanges) {
    for (const slice of slices) pushOriginalInline(line, slice.startCol, slice.endCol)
  }
}

function createBlankZoneNodes() {
  const marginDomNode = document.createElement('div')
  marginDomNode.className = 'gadgets-diff-blank-margin'

  const domNode = document.createElement('div')
  domNode.className = 'gadgets-diff-blank-zone'

  return { domNode, marginDomNode }
}

function createDeletionZoneNodes({
  run,
  expanded,
  onExpand,
}: {
  run: ChangeRun
  expanded: boolean
  onExpand: () => void
}) {
  const margin = document.createElement('div')
  margin.className = 'gadgets-deleted-margin'

  const code = document.createElement('div')
  code.className = 'gadgets-deleted-code-zone'

  const total = run.originalCount
  const truncate = !expanded && total > MAX_DELETED_ROWS
  const visibleIndices: number[] = []
  if (truncate) {
    for (let i = 0; i < DELETED_HEAD_TAIL; i++) visibleIndices.push(i)
    for (let i = total - DELETED_HEAD_TAIL; i < total; i++) visibleIndices.push(i)
  } else {
    for (let i = 0; i < total; i++) visibleIndices.push(i)
  }

  // Bucket inline highlights by original line. Multi-line `ICharChange`s get
  // split into per-line slices; whitespace ranges are already per-line.
  const inlineByLine = new Map<number, LineSlice[]>()
  const getOriginalLineLength = (line: number): number => {
    const idx = line - run.originalStart
    return idx >= 0 && idx < run.deletedText.length ? run.deletedText[idx].length : 0
  }
  const addOriginalSlice = (line: number, startCol: number, endCol: number) => {
    const lineLen = getOriginalLineLength(line)
    const clampedEnd = Math.min(endCol, lineLen + 1)
    if (startCol >= clampedEnd) return
    const arr = inlineByLine.get(line) ?? []
    arr.push({ startCol, endCol: clampedEnd })
    inlineByLine.set(line, arr)
  }
  for (const cc of run.charChanges) {
    forEachLineSliceOfCharChange(cc, 'original', addOriginalSlice)
  }
  for (const [line, slices] of run.whitespaceOriginalRanges) {
    for (const slice of slices) addOriginalSlice(line, slice.startCol, slice.endCol)
  }

  visibleIndices.forEach((localIndex, position) => {
    if (truncate && position === DELETED_HEAD_TAIL) {
      const numRow = document.createElement('div')
      numRow.className = 'gadgets-deleted-num-row gadgets-deleted-omitted-row'
      numRow.textContent = '...'
      margin.append(numRow)

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'gadgets-deleted-code-row gadgets-deleted-omitted-row'
      const hidden = total - 2 * DELETED_HEAD_TAIL
      button.textContent = `Show ${hidden} hidden deleted line${hidden === 1 ? '' : 's'}`
      button.addEventListener("click", onExpand)
      code.append(button)
    }

    const originalLine = run.originalStart + localIndex
    const text = run.deletedText[localIndex] ?? ''
    const isPaired = run.pairedOriginalLines.has(originalLine)

    const numRow = document.createElement('div')
    numRow.className = isPaired
      ? 'gadgets-deleted-num-row gadgets-replacement-num-row'
      : 'gadgets-deleted-num-row'
    numRow.textContent = isPaired ? '' : String(originalLine)
    margin.append(numRow)

    const codeRow = document.createElement('div')
    codeRow.className = 'gadgets-deleted-code-row'
    appendDeletedLineContent(codeRow, text, isPaired ? inlineByLine.get(originalLine) ?? [] : [])
    code.append(codeRow)
  })

  const rowCount = visibleIndices.length + (truncate ? 1 : 0)
  const heightInPx = Math.max(LINE_HEIGHT_PX, rowCount * LINE_HEIGHT_PX)
  return { domNode: code, marginDomNode: margin, heightInPx }
}

function appendDeletedLineContent(
  row: HTMLElement,
  text: string,
  slices: LineSlice[],
) {
  if (slices.length === 0 || text.length > MAX_INLINE_DIFF_LINE_LENGTH) {
    row.textContent = text
    return
  }
  const sorted = [...slices].toSorted((a, b) => a.startCol - b.startCol)
  let column = 1
  for (const slice of sorted) {
    if (slice.startCol > column) {
      row.append(text.slice(column - 1, slice.startCol - 1))
    }
    const span = document.createElement('span')
    span.className = 'gadgets-diff-inline-delete'
    span.textContent = text.slice(slice.startCol - 1, slice.endCol - 1)
    row.append(span)
    column = Math.max(column, slice.endCol)
  }
  if (column - 1 < text.length) {
    row.append(text.slice(column - 1))
  }
}
