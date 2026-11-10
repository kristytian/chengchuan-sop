// 新旧版差异: header fields, then clauses aligned by number. Changed clauses
// carry a word-level diff (Intl.Segmenter splits Chinese into words). The
// 文件变更历史 chapter is left out — it describes the change, not the content.
import { diffWords } from 'diff'
import type { Clause, SourceDocument } from '../data/schema.ts'
import type { ClauseDiff, DocumentDiff, HeaderChange, TextSegment } from './model.ts'
import { TERMS } from './source-terms.ts'
import { contentClauses } from './texts.ts'

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })

export function diffDocuments(oldDoc: SourceDocument, newDoc: SourceDocument): DocumentDiff {
  return { header: diffHeader(oldDoc, newDoc), clauses: diffClauses(contentClauses(oldDoc), contentClauses(newDoc)) }
}

/** A clause as text: its heading, then one line per paragraph or table row (cells joined by " | "). */
export function clauseText(clause: Clause): string {
  const lines = clause.body.flatMap((b) => (b.kind === 'paragraph' ? [b.text] : b.rows.map((row) => row.join(' | '))))
  return [clause.heading, ...lines].filter(Boolean).join('\n')
}

function diffHeader(oldDoc: SourceDocument, newDoc: SourceDocument): HeaderChange[] {
  const fields: [HeaderChange['field'], (d: SourceDocument) => string][] = [
    ['name', (d) => d.header.name],
    ['version', (d) => d.header.version],
    ['effectiveDate', (d) => d.header.effectiveDate],
    ['department', (d) => d.header.department],
    ['distribution', (d) => d.header.distribution.join(TERMS.listSeparator)],
  ]
  return fields.flatMap(([field, read]) => (read(oldDoc) === read(newDoc) ? [] : [{ field, old: read(oldDoc), new: read(newDoc) }]))
}

/** Walks the new clauses in order; removed old clauses appear where they stood. */
function diffClauses(oldClauses: Clause[], newClauses: Clause[]): ClauseDiff[] {
  const key = (c: Clause) => c.number ?? ''
  const oldByKey = new Map(oldClauses.map((c) => [key(c), c]))
  const newKeys = new Set(newClauses.map(key))
  const diffs: ClauseDiff[] = []
  let oldIndex = 0
  const flushRemoved = (until: number) => {
    for (; oldIndex < until; oldIndex++) {
      const c = oldClauses[oldIndex]
      if (!newKeys.has(key(c))) diffs.push(whole('removed', c))
    }
  }

  for (const next of newClauses) {
    const prev = oldByKey.get(key(next))
    if (!prev) {
      diffs.push(whole('added', next))
      continue
    }
    flushRemoved(oldClauses.indexOf(prev))
    oldIndex = Math.max(oldIndex, oldClauses.indexOf(prev) + 1)
    const [oldText, newText] = [clauseText(prev), clauseText(next)]
    if (oldText !== newText) diffs.push({ number: next.number, type: 'modified', oldText, newText, segments: wordDiff(oldText, newText) })
  }
  flushRemoved(oldClauses.length)
  return diffs
}

function whole(type: 'added' | 'removed', clause: Clause): ClauseDiff {
  const text = clauseText(clause)
  return {
    number: clause.number,
    type,
    oldText: type === 'removed' ? text : null,
    newText: type === 'added' ? text : null,
    segments: [{ text, op: type }],
  }
}

/** Word-level diff of two texts (Chinese split into words); also used per cell by 源头对比. */
export function wordDiff(oldText: string, newText: string): TextSegment[] {
  return diffWords(oldText, newText, { intlSegmenter: segmenter }).map((part) => ({
    text: part.value,
    op: part.added ? 'added' : part.removed ? 'removed' : 'same',
  }))
}
