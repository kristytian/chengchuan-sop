// Glue between 换版追踪 and the domain (UX-52): what this change reissues — the
// source draft and every 必须改 document confirmed in 审阅 — and the plan the
// rules make of it; plus the clauses of the document-control SMPs the board
// and the sign-off sheet cite.
import { libraryModel } from '@/data/model'
import { type HolderStatus, holderStatus, type LegacyCopy, type Reissue, type RolloutPlan, type RolloutSummary, returnWorkdays, rolloutPlan, rolloutSummary } from '@/domain/rollout'
import type { DraftOperations } from '@/domain/revision'
import { TERMS } from '@/domain/source-terms'
import { findClause } from '../citations'
import { reviewTargets } from '../review/model'
import type { ChangeView } from '../view'

/** The source and the documents of the report's 必须改, each ready once its draft is confirmed. */
export function reissuesOf(view: ChangeView): Reissue[] {
  if (view.stage !== 'exported') return []
  const source: Reissue = { old: view.oldVersion, newVersion: view.newVersion.version, newName: view.newVersion.name, ready: true }
  return [
    source,
    ...reviewTargets(view, view.reviews).map((t): Reissue => ({ old: t.version, newVersion: t.newVersion, newName: renamed(t.version.name, t.ops), ready: !!t.review.reviewedOn })),
  ]
}

/** The name after AI's replacements that touch it (a device model in the title); rewrites never fit inside a name. */
function renamed(name: string, ops: DraftOperations): string {
  return ops.replacements.reduce((n, r) => (r.find.length < n.length && n.includes(r.find) ? n.replaceAll(r.find, r.replace) : n), name)
}

const plans = new Map<string, { key: string; plan: RolloutPlan }>()

/** The plan of a change; rebuilt only when which documents are ready changes. */
export function planOf(view: ChangeView): RolloutPlan {
  const reissues = reissuesOf(view)
  const key = reissues.map((r) => `${r.old.key}:${r.ready}`).join('|')
  const cached = plans.get(view.record.id)
  if (cached?.key === key) return cached.plan
  const plan = rolloutPlan(reissues, libraryModel.setOf, libraryModel.catalog)
  plans.set(view.record.id, { key, plan })
  return plan
}

/** Old copies come back within … working days of the new version taking effect (SMP-WJ-001 in the samples). */
export const RETURN_RULE = findClause(TERMS.returnDeadline)
/** Ten working days when no document says otherwise. */
export const RETURN_WORKDAYS = (RETURN_RULE && returnWorkdays([RETURN_RULE.text])) ?? 10
/** Blank old record forms come back with the procedure (SMP-WJ-003 in the samples). */
export const BLANK_RECORD_RULE = findClause(TERMS.blankRecordReturn)

export const summaryOf = (view: ChangeView): RolloutSummary => rolloutSummary(planOf(view), view.rollout, view.today, RETURN_WORKDAYS)
export const holderOf = (view: ChangeView, holder: string): HolderStatus => holderStatus(planOf(view), view.rollout, holder, view.today, RETURN_WORKDAYS)

/** The new version's effective date: as registered in 换版追踪, else as the draft prints it; null while 待定. */
export function effectiveDate(view: ChangeView): string | null {
  const group = view.stage === 'exported' ? planOf(view).groups[0]?.id : undefined
  const registered = group ? view.rollout.approvals[group]?.effectiveOn : undefined
  const printed = view.newVersion.effectiveDate && /^\d{4}-/.test(view.newVersion.effectiveDate) ? view.newVersion.effectiveDate : null
  return registered ?? printed
}

/** 审阅 is done: every draft confirmed, so the documents can go to OA and be tracked here. */
export const rolloutOpen = (view: ChangeView) => view.stage === 'exported' && view.toRevise > 0 && view.reviewed === view.toRevise

/** The year a legacy copy's version went out of force: when the next version took effect. */
export function obsoletedYear(copy: LegacyCopy): string | null {
  const versions = libraryModel.catalog.byIdentity.get(copy.identity) ?? []
  const next = versions.filter((v) => v.version > copy.version && v.effectiveDate && /^\d{4}-/.test(v.effectiveDate)).sort((a, b) => a.version.localeCompare(b.version))[0]
  return next?.effectiveDate?.slice(0, 4) ?? null
}

/** 「BG-2026-018-03」: the change's control number and the holder's place on the board. */
export function slipNumber(view: ChangeView, holder: string): string {
  const i = planOf(view).departments.indexOf(holder)
  return `${view.record.controlNo || view.record.id}-${String(i + 1).padStart(2, '0')}`
}
