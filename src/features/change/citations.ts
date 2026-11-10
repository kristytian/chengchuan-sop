// Clauses of the library's documents in force that a station cites:
// 「SMP-WJ-001 §4.4.2：新版生效后 10 个工作日内……」. Found by their words, so a
// renumbered or reworded SMP is followed, not hard-coded.
import { libraryModel } from '@/data/model'

/** A clause of a document in force, as cited: 「SMP-WJ-001 §4.4.2」 and its words. */
export interface ClauseRef {
  code: string
  clause: string | null
  text: string
}

export function findClause(test: RegExp): ClauseRef | null {
  for (const v of libraryModel.catalog.versions) {
    if (v.status !== 'current' || !v.document) continue
    for (const c of v.document.clauses) {
      // 「4.4.2 新版生效后 10 个工作日内…」: the words are often on the numbered line itself.
      if (test.test(c.heading)) return { code: v.identity, clause: c.number, text: c.heading }
      const b = c.body.find((x) => x.kind === 'paragraph' && test.test(x.text))
      if (b?.kind === 'paragraph') return { code: v.identity, clause: c.number, text: b.text }
    }
  }
  return null
}

export const citation = (r: ClauseRef) => (r.clause ? `${r.code} §${r.clause}` : r.code)
