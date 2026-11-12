// 起草检查 in 审阅 (UX-58): each finding on the version being revised, and
// whether the draft has dealt with it. A finding is 已改 while a change in the
// draft removes its words (a person's typing counts too); otherwise it is
// closed by hand — 已改, or 不改 with why. 确认审阅 waits until none is open.
import type { DraftFinding } from '@/domain/draft-check'
import type { DraftOperations, PointClosure } from '@/domain/revision'
import type { TrackedChange } from './reasons'

export type CheckStatus = 'fixed' | 'open' | 'done' | 'declined'

export interface CheckState extends DraftFinding {
  key: string
  status: CheckStatus
  change: TrackedChange | null
  closure: PointClosure | null
}

/** Closures of findings sit in the review's closures beside the report's points, under this key. */
export const checkKey = (f: Pick<DraftFinding, 'id'>) => `check|${f.id}`

export function checkStatuses(findings: readonly DraftFinding[], changes: readonly TrackedChange[], closures: Readonly<Record<string, PointClosure>>): CheckState[] {
  return findings.map((f) => {
    const key = checkKey(f)
    const change = changes.find((c) => c.deleted?.includes(f.word) && !c.inserted?.includes(f.word)) ?? null
    const closure = closures[key] ?? null
    return { ...f, key, status: change ? 'fixed' : (closure?.state ?? 'open'), change, closure }
  })
}

/** The same before the editor is open (the review list): 已改 when AI's operations already take the words out. */
export function plannedCheckStatuses(
  findings: readonly DraftFinding[],
  ops: DraftOperations,
  closures: Readonly<Record<string, PointClosure>>,
  settled?: Readonly<Record<string, string>>,
): CheckState[] {
  return findings.map((f) => {
    const key = checkKey(f)
    const closure = closures[key] ?? null
    const fixed = ops.replacements.some((r) => r.find.includes(f.word) && !r.replace.includes(f.word))
    // Once confirmed, the finding stands as it stood then — a word the reviewer typed away included.
    const kept = settled?.[key] as CheckStatus | undefined
    return { ...f, key, status: kept ?? (fixed ? 'fixed' : (closure?.state ?? 'open')), change: null, closure }
  })
}
