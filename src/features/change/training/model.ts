// 培训 (UX-53): one pack per audience the rules find in the new version's
// 职责 chapter; AI's 改动摘要 and questions for it (an example until the
// pre-run) become two Word documents QA edits and confirms one by one
// (docs.ts); with both confirmed the pack is, and it is trained once a
// training record is scanned in.
import { aiRuns, changeAnalysis, libraryModel } from '@/data/model'
import { lookupRun } from '@/domain/ai'
import { impactChangeForAI, inputHash, trainingPackInput, trainingSubject } from '@/domain/ai-inputs'
import type { AIStatus, TrainingPackSuggestion } from '@/domain/model'
import { TERMS } from '@/domain/source-terms'
import { type Audience, currentHolders, trainingAudiences } from '@/domain/training'
import { emptyPack, type PackDocId, type PackRecord } from '@/store/demo'
import { findClause } from '../citations'
import { planOf, rolloutOpen } from '../rollout/model'
import type { ChangeView } from '../view'

export interface Pack {
  audience: Audience
  /** AI's 改动摘要 and questions, when there is a current run. */
  ai: TrainingPackSuggestion | null
  aiStatus: AIStatus
  /** AI's pack is a hand-written example (ai-examples/), shown as 「AI 示例」. */
  example: boolean
  record: PackRecord
  /** Both documents confirmed. */
  confirmed: boolean
  /** When the later of the two was confirmed. */
  confirmedOn: string | null
  /** Confirmed, and at least one training record scanned in. */
  trained: boolean
}

/** SMP-RY-004 §4.2: training before the new version takes effect, with a 培训签到表. */
export const TRAINING_RULE = findClause(TERMS.trainingRule)

const audiences = new Map<string, Audience[]>()

/** Who is trained on this change: the duty holders who carry out the new version (rules). */
/** QA decided this change needs no training (UX-59): the station is done as soon as the report is out. */
export const trainingSkipped = (view: ChangeView) => view.assessment.training?.needed === false

export function audiencesOf(view: ChangeView): Audience[] {
  if (trainingSkipped(view)) return []
  let found = audiences.get(view.change.id)
  if (!found) {
    found = view.newVersion.document ? trainingAudiences(view.newVersion.document, currentHolders(view.oldVersion)) : []
    audiences.set(view.change.id, found)
  }
  return found
}

function aiPack(view: ChangeView, a: Audience) {
  const change = impactChangeForAI(view.change, changeAnalysis(view.change.id).diff, libraryModel.catalog)
  const input = trainingPackInput(change, view.newVersion, { role: a.role, duty: a.duty, executor: a.executor })
  return lookupRun<TrainingPackSuggestion>(aiRuns, 'trainingPack', trainingSubject(view.change, a.role), inputHash(input))
}

/** The pack's two documents, in the order they are handed out: ① 培训资料, ② 考核题. */
export const PACK_DOCS: readonly PackDocId[] = ['material', 'questions']

export function packsOf(view: ChangeView): Pack[] {
  return audiencesOf(view).map((audience) => {
    const { status, run } = aiPack(view, audience)
    const record = view.training[audience.role] ?? emptyPack()
    const dates = PACK_DOCS.map((d) => record.confirmed[d])
    const confirmed = dates.every(Boolean)
    return {
      audience,
      ai: status === 'current' && run ? run.output : null,
      aiStatus: status,
      example: run?.mode === 'example',
      record,
      confirmed,
      confirmedOn: confirmed ? (dates as string[]).sort().at(-1)! : null,
      trained: confirmed && record.records.length > 0,
    }
  })
}

/** Training starts once every revision draft is confirmed: the questions are on the final text. */
export const trainingOpen = rolloutOpen

export function trainingSummary(view: ChangeView) {
  const packs = packsOf(view)
  return { packs: packs.length, confirmed: packs.filter((p) => p.confirmed).length, trained: packs.filter((p) => p.trained).length }
}

export function trainingDone(view: ChangeView): boolean {
  if (trainingSkipped(view)) return view.stage === 'exported'
  const s = trainingSummary(view)
  return trainingOpen(view) && s.packs > 0 && s.trained === s.packs
}

/** When training must be done by: the source's effective date as registered in 换版追踪, else null (新版生效前). */
export function trainingDeadline(view: ChangeView): string | null {
  const group = view.stage === 'exported' ? planOf(view).groups[0]?.id : undefined
  return (group && view.rollout.approvals[group]?.effectiveOn) || null
}
