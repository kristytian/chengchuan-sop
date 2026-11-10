import type { Clause, SourceDocument } from '../data/schema.ts'
import { TERMS } from './source-terms.ts'

/** Clauses with content: everything but the 文件变更历史 chapter, which records history. */
export function contentClauses(doc: SourceDocument): Clause[] {
  const history = doc.clauses.find((c) => c.number && !c.number.includes('.') && c.heading === TERMS.historyChapter)?.number
  if (history === undefined) return doc.clauses
  return doc.clauses.filter((c) => c.number === null || (c.number !== history && !c.number.startsWith(`${history}.`)))
}

export interface DocumentText {
  location: 'header' | 'body'
  clause: string | null
  text: string
}

/**
 * Every piece of text a reference can sit in: the header's 对应文件 and 依据,
 * then each clause's heading, paragraphs and table cells. The 文件变更历史
 * chapter records history, not dependencies, and is left out.
 */
export function documentTexts(doc: SourceDocument): DocumentText[] {
  const texts: DocumentText[] = []
  for (const text of [doc.header.correspondingDoc, doc.header.basis]) {
    if (text) texts.push({ location: 'header', clause: null, text })
  }

  for (const c of contentClauses(doc)) {
    const push = (text: string) => {
      if (text) texts.push({ location: 'body', clause: c.number, text })
    }
    push(c.heading)
    for (const block of c.body) {
      if (block.kind === 'paragraph') push(block.text)
      else block.rows.flat().forEach(push)
    }
  }
  return texts
}
