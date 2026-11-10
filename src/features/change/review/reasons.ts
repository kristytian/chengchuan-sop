// Why each tracked change in a revision draft is there (审阅, UX-50): AI's
// operations carry their reason; anything else AI wrote is 「AI 修订」, and
// whatever a person typed is theirs.
import type { DraftOperations, DraftReason } from '@/domain/revision'

/** Tracked changes AI writes carry this author; the reviewer's carry their department. */
export const AI_AUTHOR = 'AI'

/** How the editor joins the pieces of one change in its excerpt. */
const PIECES = ' … '

/** A tracked change as the editor lists it. */
export interface TrackedChange {
  id: string
  author: string
  type: string
  /** The editor's finer kind: text-replacement, paragraph-split, table-row-insertion… */
  subtype: string
  inserted: string | null
  deleted: string | null
  /** For a formatting change, what it changed (see `formattedOf`). */
  formatted: FormatKey[]
  address: unknown
}

export type ChangeReason = DraftReason | { kind: 'person' } | { kind: 'ai' }

/**
 * Why a tracked change is there: the operation AI made it from, or that a
 * person typed it. The editor keeps only what differs (「2500–3000 rpm」 →
 * 「2800–3400 rpm」 is listed as 2500–3000 → 2800–3400) and joins separate
 * pieces of one replacement with 「 … 」, so a change belongs to the
 * operation whose texts hold every piece of it.
 */
export function reasonOf(ops: DraftOperations, change: TrackedChange): ChangeReason {
  if (change.author !== AI_AUTHOR) return { kind: 'person' }
  const { replacements, historyRow } = ops
  const exact = replacements.find((r) => r.find === change.deleted && r.replace === change.inserted)
  if (exact) return exact.why
  if (historyRow && change.inserted?.includes(historyRow.at(-1) ?? '')) return { kind: 'history' }
  const holds = (whole: string, piece: string | null) => !piece || piece.split(PIECES).every((p) => whole.includes(p.trim()))
  const op = (change.deleted || change.inserted) && replacements.find((r) => holds(r.find, change.deleted) && holds(r.replace, change.inserted))
  return op ? op.why : { kind: 'ai' }
}

export type FormatKey = 'bold' | 'italic' | 'underline' | 'strike' | 'font' | 'size' | 'color' | 'highlight' | 'indent' | 'spacing' | 'line' | 'align' | 'other'

const FORMAT_KEYS: Record<string, FormatKey> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strike',
  font: 'font',
  fontSize: 'size',
  color: 'color',
  highlight: 'highlight',
  spacingBefore: 'spacing',
  spacingAfter: 'spacing',
  spacingLine: 'line',
  spacingLineRule: 'line',
  justification: 'align',
  alignment: 'align',
}

/**
 * What a formatting change changed, from the editor's own summary — 「run
 * formatting revision: bold: off → on, fontSize: 21 → 23, font: 宋体 → 黑体」 —
 * as keys the page names in Chinese.
 */
export function formattedOf(summary: string | null | undefined): FormatKey[] {
  const body = summary?.split('revision:')[1] ?? ''
  const keys = body.split(',').flatMap((part) => {
    const name = part.split(':')[0].trim()
    if (!name) return []
    return [FORMAT_KEYS[name] ?? (name.startsWith('indent') ? 'indent' : 'other')]
  })
  return [...new Set(keys)]
}
