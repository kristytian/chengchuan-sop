// 报告要点 in 审阅 (UX-57): each 修改要点 of the exported report, and whether
// the draft carries it out. A point is 已改 while a tracked change made for it
// is still in the draft (rejecting that change makes it open again); an open
// point is closed by hand — 已改 (the reviewer typed it) or 不按这条改 with a
// reason. 确认审阅 waits until none is open.
import type { DraftOperations, DraftReplacement, PointClosure } from '@/domain/revision'
import { reasonOf, type TrackedChange } from './reasons'

export type { PointClosure }

export interface ReviewPoint {
  /** Clause ref: "header", "4.2", "body". */
  clause: string
  /** pointLabel of the report's point. */
  label: string
  origin: 'rule' | 'ai' | 'person'
  /** A person's point: the department that wrote it. */
  by?: string
}

export type PointStatus = 'changed' | 'open' | 'done' | 'declined'

export interface PointState extends ReviewPoint {
  key: string
  status: PointStatus
  /** The tracked change that carries it out, to jump to. */
  change: TrackedChange | null
  closure: PointClosure | null
}

export const pointKey = (p: { clause: string; label: string }) => `${p.clause}|${p.label}`

export function pointStatuses(
  points: readonly ReviewPoint[],
  ops: DraftOperations,
  changes: readonly TrackedChange[],
  closures: Readonly<Record<string, PointClosure>>,
): PointState[] {
  const reasons = changes.map((c) => ({ c, r: reasonOf(ops, c) }))
  return points.map((p) => {
    const key = pointKey(p)
    const change = reasons.find(({ r }) => carries(r, p.label))?.c ?? null
    const closure = closures[key] ?? null
    return { ...p, key, status: change ? 'changed' : (closure?.state ?? 'open'), change, closure }
  })
}

/** Whether a change made for this reason carries out the point with this label. */
const carries = (r: ReturnType<typeof reasonOf> | DraftReplacement['why'], label: string) => (r.kind === 'point' && r.text === label) || (r.kind === 'rewrite' && r.basis.includes(label))

/**
 * The same, before the editor is open (the review list, 收尾): a point counts
 * as 已改 when AI made an operation for it — a rejection only shows in the editor.
 */
export function plannedStatuses(
  points: readonly ReviewPoint[],
  ops: DraftOperations,
  closures: Readonly<Record<string, PointClosure>>,
  settled?: Readonly<Record<string, string>>,
): PointState[] {
  return points.map((p) => {
    const key = pointKey(p)
    const closure = closures[key] ?? null
    const planned = ops.replacements.some((r) => carries(r.why, p.label))
    // Once confirmed, the point stands as it stood then.
    const kept = settled?.[key] as PointStatus | undefined
    return { ...p, key, status: kept ?? (planned ? 'changed' : (closure?.state ?? 'open')), change: null, closure }
  })
}

/** Every point carried out or closed by hand: 确认审阅 may go ahead. */
export const allSettled = (states: readonly PointState[]) => states.every((s) => s.status !== 'open')
