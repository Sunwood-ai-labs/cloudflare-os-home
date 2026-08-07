import type { editor } from 'monaco-editor'

export type DiffStatus = 'Added' | 'Deleted' | 'Modified' | 'Unchanged'

export type DiffModel = {
  status: DiffStatus
  additions: number
  deletions: number
  /** Flat list of change runs in document order. Unchanged lines are not modeled. */
  changes: ChangeRun[]
}

/** A single-line column range. 1-based; startCol inclusive, endCol exclusive. */
export type LineSlice = {
  startCol: number
  endCol: number
}

export type ChangeRun = {
  /** Stable identifier across rebuilds while editing in the same session. */
  key: string
  /** 1-based modified-doc line. `modifiedCount === 0` ⇒ pure deletion. */
  modifiedStart: number
  modifiedCount: number
  /** 1-based original-doc line. `originalCount === 0` ⇒ pure addition. */
  originalStart: number
  originalCount: number
  /** Original text for each deleted line, indexed [0, originalCount). */
  deletedText: string[]
  charChanges: editor.ICharChange[]
  /** Lines paired with an opposite-side line (replacement). Unpaired lines are pure adds/deletes. */
  pairedModifiedLines: Set<number>
  pairedOriginalLines: Set<number>
  /** Leading-whitespace highlights synthesized to fill `ignoreTrimWhitespace` gaps. */
  whitespaceModifiedRanges: Map<number, LineSlice[]>
  whitespaceOriginalRanges: Map<number, LineSlice[]>
}

export type Side = 'modified' | 'original'

/** Max line length (chars) eligible for inline char-level highlighting. */
export const MAX_INLINE_DIFF_LINE_LENGTH = 1024

/** Max deleted lines shown in a single change before truncation kicks in. */
export const MAX_DELETED_ROWS = 120

/** When truncating, how many rows to keep at each end. */
export const DELETED_HEAD_TAIL = 48

/** Minimum non-whitespace preservation on both sides to count as a real replacement. */
const MIN_REPLACEMENT_PRESERVATION = 0.3

export type BuildArgs = {
  original: string
  modified: string
  hasOriginal: boolean
  hasModified: boolean
  lineChanges: editor.ILineChange[] | null
}

export function buildDiffModel({
  original,
  modified,
  hasOriginal,
  hasModified,
  lineChanges,
}: BuildArgs): DiffModel {
  const originalLines = splitLines(original)
  const modifiedLines = splitLines(modified)

  if (!hasOriginal && hasModified) {
    return {
      status: 'Added',
      additions: modifiedLines.length,
      deletions: 0,
      changes: [],
    }
  }

  if (hasOriginal && !hasModified) {
    if (originalLines.length === 0) {
      return { status: 'Deleted', additions: 0, deletions: 0, changes: [] }
    }
    return {
      status: 'Deleted',
      additions: 0,
      deletions: originalLines.length,
      changes: [{
        key: 'deleted',
        modifiedStart: 1,
        modifiedCount: 0,
        originalStart: 1,
        originalCount: originalLines.length,
        deletedText: originalLines,
        charChanges: [],
        ...emptyChangeRunFields(),
      }],
    }
  }

  if (lineChanges === null || lineChanges.length === 0) {
    return { status: 'Unchanged', additions: 0, deletions: 0, changes: [] }
  }

  const changes: ChangeRun[] = []
  let additions = 0
  let deletions = 0

  for (let i = 0; i < lineChanges.length; i++) {
    const change = lineChanges[i]
    const modCount = lineCount(change, 'modified')
    const origCount = lineCount(change, 'original')
    additions += modCount
    deletions += origCount

    const deletedText: string[] = []
    if (origCount > 0) {
      const start = change.originalStartLineNumber
      for (let j = 0; j < origCount; j++) {
        deletedText.push(originalLines[start - 1 + j] ?? '')
      }
    }

    const charChanges = change.charChanges ? [...change.charChanges] : []

    for (const run of splitChangeIntoRuns({
      change,
      changeIndex: i,
      charChanges,
      modCount,
      origCount,
      deletedText,
      modifiedLines,
    })) {
      changes.push(run)
    }
  }

  return {
    status: additions === 0 && deletions === 0 ? 'Unchanged' : 'Modified',
    additions,
    deletions,
    changes,
  }
}

/** Walk each line covered by an `ICharChange` on the given side, splitting multi-line ranges. */
export function forEachLineSliceOfCharChange(
  cc: editor.ICharChange,
  side: Side,
  fn: (line: number, startCol: number, endCol: number) => void,
) {
  const startLine = side === 'modified' ? cc.modifiedStartLineNumber : cc.originalStartLineNumber
  const startCol = side === 'modified' ? cc.modifiedStartColumn : cc.originalStartColumn
  const endLine = side === 'modified' ? cc.modifiedEndLineNumber : cc.originalEndLineNumber
  const endCol = side === 'modified' ? cc.modifiedEndColumn : cc.originalEndColumn

  if (startLine === 0 || endLine === 0 || endLine < startLine) return
  if (startLine === endLine) {
    if (startCol < endCol) fn(startLine, startCol, endCol)
    return
  }
  fn(startLine, startCol, Number.MAX_SAFE_INTEGER)
  for (let line = startLine + 1; line < endLine; line++) {
    fn(line, 1, Number.MAX_SAFE_INTEGER)
  }
  if (endCol > 1) fn(endLine, 1, endCol)
}

function emptyChangeRunFields() {
  return {
    pairedModifiedLines: new Set<number>(),
    pairedOriginalLines: new Set<number>(),
    whitespaceModifiedRanges: new Map<number, LineSlice[]>(),
    whitespaceOriginalRanges: new Map<number, LineSlice[]>(),
  }
}

function sideLines(change: editor.ILineChange, side: Side): { start: number, end: number } {
  return side === 'modified'
    ? { start: change.modifiedStartLineNumber, end: change.modifiedEndLineNumber }
    : { start: change.originalStartLineNumber, end: change.originalEndLineNumber }
}

function lineCount(change: editor.ILineChange, side: Side): number {
  const { start, end } = sideLines(change, side)
  if (start === 0 || end === 0 || end < start) return 0
  return end - start + 1
}

/** 1-based anchor; for empty ranges, shifts past Monaco's "line before insertion" convention. */
function changeStart(change: editor.ILineChange, side: Side): number {
  const { start } = sideLines(change, side)
  return lineCount(change, side) > 0 ? start : start + 1
}

function changeKey(change: editor.ILineChange, suffix: string): string {
  return `${change.modifiedStartLineNumber}-${change.originalStartLineNumber}-${change.modifiedEndLineNumber}-${change.originalEndLineNumber}-${suffix}`
}

/**
 * A real replacement returns one run; unrelated deletion+addition pairs
 * (Monaco merged adjacent chunks) return separate deletion and addition runs.
 */
function splitChangeIntoRuns({
  change,
  changeIndex,
  charChanges,
  modCount,
  origCount,
  deletedText,
  modifiedLines,
}: {
  change: editor.ILineChange
  changeIndex: number
  charChanges: editor.ICharChange[]
  modCount: number
  origCount: number
  deletedText: string[]
  modifiedLines: string[]
}): ChangeRun[] {
  if (modCount === 0 || origCount === 0) {
    return [{
      key: changeKey(change, `${changeIndex}`),
      modifiedStart: changeStart(change, 'modified'),
      modifiedCount: modCount,
      originalStart: changeStart(change, 'original'),
      originalCount: origCount,
      deletedText,
      charChanges,
      ...emptyChangeRunFields(),
    }]
  }

  const isReplacement = isRealReplacement({
    charChanges,
    origStart: change.originalStartLineNumber,
    origCount,
    modStart: change.modifiedStartLineNumber,
    modCount,
    deletedText,
    modifiedLines,
  })

  if (isReplacement) {
    const pairedModifiedLines = new Set<number>()
    const pairedOriginalLines = new Set<number>()
    for (const cc of charChanges) {
      if (cc.originalStartLineNumber === 0 || cc.modifiedStartLineNumber === 0) continue
      for (let l = cc.modifiedStartLineNumber; l <= cc.modifiedEndLineNumber; l++) {
        pairedModifiedLines.add(l)
      }
      for (let l = cc.originalStartLineNumber; l <= cc.originalEndLineNumber; l++) {
        pairedOriginalLines.add(l)
      }
    }
    // Fallback when Monaco skipped char-level analysis: pair positionally.
    if (pairedModifiedLines.size === 0) {
      const pairCount = Math.min(modCount, origCount)
      for (let i = 0; i < pairCount; i++) {
        pairedModifiedLines.add(change.modifiedStartLineNumber + i)
        pairedOriginalLines.add(change.originalStartLineNumber + i)
      }
    }

    const { whitespaceModifiedRanges, whitespaceOriginalRanges } = computeWhitespaceRanges({
      modStart: change.modifiedStartLineNumber,
      modCount,
      origStart: change.originalStartLineNumber,
      origCount,
      modifiedLines,
      deletedText,
    })

    return [{
      key: changeKey(change, `${changeIndex}`),
      modifiedStart: change.modifiedStartLineNumber,
      modifiedCount: modCount,
      originalStart: change.originalStartLineNumber,
      originalCount: origCount,
      deletedText,
      charChanges,
      pairedModifiedLines,
      pairedOriginalLines,
      whitespaceModifiedRanges,
      whitespaceOriginalRanges,
    }]
  }

  // Anchor both runs at the same modified line so red renders directly above green.
  return [
    {
      key: changeKey(change, `${changeIndex}-d`),
      modifiedStart: change.modifiedStartLineNumber,
      modifiedCount: 0,
      originalStart: change.originalStartLineNumber,
      originalCount: origCount,
      deletedText,
      charChanges: [],
      ...emptyChangeRunFields(),
    },
    {
      key: changeKey(change, `${changeIndex}-a`),
      modifiedStart: change.modifiedStartLineNumber,
      modifiedCount: modCount,
      originalStart: change.originalStartLineNumber + origCount + 1,
      originalCount: 0,
      deletedText: [],
      charChanges: [],
      ...emptyChangeRunFields(),
    },
  ]
}

/** True iff both sides preserve enough non-whitespace content to be a meaningful edit. */
function isRealReplacement({
  charChanges,
  origStart,
  origCount,
  modStart,
  modCount,
  deletedText,
  modifiedLines,
}: {
  charChanges: editor.ICharChange[]
  origStart: number
  origCount: number
  modStart: number
  modCount: number
  deletedText: string[]
  modifiedLines: string[]
}): boolean {
  if (charChanges.length === 0) return true

  const origPreservation = preservedFraction({
    charChanges,
    side: 'original',
    startLine: origStart,
    count: origCount,
    getLine: idx => deletedText[idx] ?? '',
  })
  const modPreservation = preservedFraction({
    charChanges,
    side: 'modified',
    startLine: modStart,
    count: modCount,
    getLine: idx => modifiedLines[modStart - 1 + idx] ?? '',
  })

  return origPreservation >= MIN_REPLACEMENT_PRESERVATION
    && modPreservation >= MIN_REPLACEMENT_PRESERVATION
}

function preservedFraction({
  charChanges,
  side,
  startLine,
  count,
  getLine,
}: {
  charChanges: editor.ICharChange[]
  side: Side
  startLine: number
  count: number
  getLine: (lineIndex: number) => string
}): number {
  let totalNonWs = 0
  let changedNonWs = 0
  const changesByLine = new Map<number, editor.ICharChange[]>()

  for (const cc of charChanges) {
    const startLn = side === 'original' ? cc.originalStartLineNumber : cc.modifiedStartLineNumber
    const endLn = side === 'original' ? cc.originalEndLineNumber : cc.modifiedEndLineNumber
    if (startLn === 0 || endLn === 0) continue

    const firstLine = Math.max(startLine, startLn)
    const lastLine = Math.min(startLine + count - 1, endLn)
    for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
      const changes = changesByLine.get(lineNumber) ?? []
      changes.push(cc)
      changesByLine.set(lineNumber, changes)
    }
  }

  for (let i = 0; i < count; i++) {
    const lineNumber = startLine + i
    const text = getLine(i)
    totalNonWs += countNonWhitespace(text, 0, text.length)
    for (const cc of changesByLine.get(lineNumber) ?? []) {
      const startLn = side === 'original' ? cc.originalStartLineNumber : cc.modifiedStartLineNumber
      const endLn = side === 'original' ? cc.originalEndLineNumber : cc.modifiedEndLineNumber
      const startCol = lineNumber === startLn
        ? (side === 'original' ? cc.originalStartColumn : cc.modifiedStartColumn)
        : 1
      const endCol = lineNumber === endLn
        ? (side === 'original' ? cc.originalEndColumn : cc.modifiedEndColumn)
        : text.length + 1
      changedNonWs += countNonWhitespace(text, startCol - 1, endCol - 1)
    }
  }

  if (totalNonWs === 0) return 1
  return Math.max(0, totalNonWs - changedNonWs) / totalNonWs
}

function countNonWhitespace(text: string, start: number, end: number): number {
  let count = 0
  const lo = Math.max(0, start)
  const hi = Math.min(text.length, end)
  for (let i = lo; i < hi; i++) {
    const c = text.charCodeAt(i)
    // Fast non-regex whitespace check: space, tab, LF, CR, VT, FF.
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 11 && c !== 12) count++
  }
  return count
}

/** Synthesize highlights for leading-whitespace diffs Monaco skips via `ignoreTrimWhitespace`. */
function computeWhitespaceRanges({
  modStart,
  modCount,
  origStart,
  origCount,
  modifiedLines,
  deletedText,
}: {
  modStart: number
  modCount: number
  origStart: number
  origCount: number
  modifiedLines: string[]
  deletedText: string[]
}): {
  whitespaceModifiedRanges: Map<number, LineSlice[]>
  whitespaceOriginalRanges: Map<number, LineSlice[]>
} {
  const whitespaceModifiedRanges = new Map<number, LineSlice[]>()
  const whitespaceOriginalRanges = new Map<number, LineSlice[]>()
  const pairCount = Math.min(modCount, origCount)

  for (let i = 0; i < pairCount; i++) {
    const modText = modifiedLines[modStart - 1 + i] ?? ''
    const origText = deletedText[i] ?? ''
    const modIndent = leadingWhitespaceLength(modText)
    const origIndent = leadingWhitespaceLength(origText)

    if (modIndent > origIndent) {
      whitespaceModifiedRanges.set(modStart + i, [{
        startCol: origIndent + 1,
        endCol: modIndent + 1,
      }])
    } else if (origIndent > modIndent) {
      whitespaceOriginalRanges.set(origStart + i, [{
        startCol: modIndent + 1,
        endCol: origIndent + 1,
      }])
    }
  }

  return { whitespaceModifiedRanges, whitespaceOriginalRanges }
}

function leadingWhitespaceLength(text: string): number {
  let i = 0
  while (i < text.length) {
    const c = text.charCodeAt(i)
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 11 && c !== 12) break
    i++
  }
  return i
}

function splitLines(value: string): string[] {
  if (value.length === 0) return []
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}
