// Also runs at build time inside the Vite plugin (Node), so imports here are
// relative with explicit .ts extensions — no @/ alias.
import type { Block, Clause } from '../data/schema.ts'

// "4\u3000程序" — a chapter: one number, then a full-width space (how the samples print chapters).
const CHAPTER = /^([1-9]\d*)\u3000+(.*)$/s
// "4.2.1 确认设备…" — a sub-clause: dotted number, then whitespace (or nothing).
const SUB_CLAUSE = /^([1-9]\d*(?:\.\d+)+)(?:[ \t\u3000]+(.*))?$/s

/**
 * Cuts a document body into clauses by "4.3.3"-style numbers. Blocks before
 * the first number — or a whole body without numbers — form one clause with
 * `number: null`.
 */
export function splitClauses(blocks: readonly Block[]): Clause[] {
  const clauses: Clause[] = []
  let current: Clause | undefined
  let chapter: string | undefined

  for (const block of blocks) {
    const numbered = block.kind === 'paragraph' ? matchNumber(block.text, chapter) : undefined
    if (numbered) {
      if (!numbered.number.includes('.')) chapter = numbered.number
      current = { number: numbered.number, heading: numbered.heading, body: [] }
      clauses.push(current)
      continue
    }
    if (!current) {
      current = { number: null, heading: '', body: [] }
      clauses.push(current)
    }
    current.body.push(block)
  }
  return clauses
}

function matchNumber(text: string, chapter: string | undefined): { number: string; heading: string } | undefined {
  const asChapter = CHAPTER.exec(text)
  if (asChapter) return { number: asChapter[1], heading: asChapter[2].trim() }

  const asSub = SUB_CLAUSE.exec(text)
  // Inside a chapter, "4.4 …" under chapter 3 is a citation of another
  // document's clause, not a new clause of this one.
  if (!asSub || (chapter !== undefined && asSub[1].split('.')[0] !== chapter)) return undefined
  return { number: asSub[1], heading: (asSub[2] ?? '').trim() }
}
