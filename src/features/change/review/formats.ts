// 本文件格式 (UX-50): the samples set their paragraphs by direct formatting,
// not Word styles, and every level looks the same throughout a document —
// 「1 目的」 黑体 bold, 「3.1 …」 宋体 indented, and so on. So a new paragraph is
// put in the document's own format by copying a paragraph of the same level,
// found by how its number is written.
import type { SourceDocument } from '@/data/schema'

export type DocFormat = 'chapter' | 'clause' | 'subclause' | 'body'

/** A leading clause number — 「1 目的」「3.1 …」「4.3.1 …」, the first followed by a full-width space — and how deep it is. */
const NUMBER = /^(\d+(?:\.\d+)*)[\s\u3000]/

export function levelOf(text: string): DocFormat {
  const m = NUMBER.exec(text)
  if (!m) return 'body'
  const depth = m[1].split('.').length
  return depth === 1 ? 'chapter' : depth === 2 ? 'clause' : 'subclause'
}

/** The levels a document has, from its numbered clauses; none for a record without them. */
export function docFormats(doc: SourceDocument): DocFormat[] {
  const depths = new Set(doc.clauses.flatMap((c) => (c.number ? [c.number.split('.').length] : [])))
  if (!depths.has(1)) return []
  return (['chapter', 'clause', 'subclause', 'body'] as const).filter((f) => f === 'chapter' || f === 'body' || depths.has(f === 'clause' ? 2 : 3))
}

/**
 * The paragraph to copy for a level: the first of that level outside the
 * paragraphs being formatted; for 正文, the first unnumbered one straight
 * after a chapter heading (a 目的 or 适用范围 sentence).
 */
export function referenceOf(texts: readonly string[], level: DocFormat, skip: ReadonlySet<number>): number {
  return texts.findIndex((text, i) => {
    if (skip.has(i) || !text.trim() || levelOf(text) !== level) return false
    return level !== 'body' || (i > 0 && levelOf(texts[i - 1]) === 'chapter')
  })
}

/** The editor reads paragraph sizes in points and writes them in twentieths of a point. */
export const twips = (points: number) => Math.round(points * 20)
/** Line spacing read as a multiple (1.25) is written in 240ths. */
export const lineTwips = (multiple: number) => Math.round(multiple * 240)
