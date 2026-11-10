// What QA does to the AI report in the demo before exporting it (scenario 1,
// 03 画面 14): puts on one document AI did not list — the cleaning record,
// since the new equipment cleans in place — and notes who evaluates the
// validation protocol by when. People's words; text in demo.script.
import { libraryModel } from '@/data/model'
import type { AddedEntry, Decision, EvaluationConclusion } from '@/domain/assessment'
import { rolloutPlan } from '@/domain/rollout'
import { currentHolders, trainingAudiences } from '@/domain/training'
import { DEMO } from '@/domain/settings'
import { TERMS } from '@/domain/source-terms'
import i18n from '@/i18n'
import { type DocReview, emptyPack, type PackRecord, type Rollout, type RolloutLogEntry } from './demo'

const current = (identity: string) => libraryModel.catalog.byIdentity.get(identity)?.find((v) => v.origin === 'library' && v.status === 'current')

export function scriptedEdits(): { removed: Record<string, Decision>; added: AddedEntry[]; comments: Record<string, string> } {
  const record = current('SOR-SC-041-R01')
  const validation = current('VP-QJ-003')
  return {
    removed: {},
    added: record ? [{ version: record.key, tier: 'mustChange', note: i18n.t('demo.script.cleaningNote'), reason: i18n.t('demo.script.cleaningReason') }] : [],
    comments: validation ? { [validation.key]: i18n.t('demo.script.validationComment') } : {},
  }
}

/**
 * 11-18: the two 需评估 documents have their answers — the validation group
 * (质量管理部) has the protocol revised for the new equipment; 生产技术部's
 * training lead keeps the training material as it is.
 */
export function scriptedConclusions(): Record<string, EvaluationConclusion> {
  const out: Record<string, EvaluationConclusion> = {}
  const add = (identity: string, tier: EvaluationConclusion['tier'], by: string, note: 'demo.script.validationConclusion' | 'demo.script.trainingConclusion') => {
    const v = current(identity)
    if (v) out[v.key] = { tier, by, on: DEMO.evaluatedDate, note: i18n.t(note) }
  }
  add('VP-QJ-003', 'mustChange', TERMS.departments.qa, 'demo.script.validationConclusion')
  add('PX-SC-031', 'inform', TERMS.departments.production, 'demo.script.trainingConclusion')
  return out
}

/** The documents scenario 1's report sends to 审阅 (必须改, with the one put on by hand and the one evaluated). */
const REVISED = ['SOR-SB-021-R01', 'SOP-SC-041', 'SOR-SC-041-R01', 'STP-GY-010', 'SOR-SC-010-R01', 'SOR-SC-011-R01', 'SOR-SC-012-R01', 'VP-QJ-003']

/** 11-20: QA has confirmed every draft. */
export function scriptedReviews(): Record<string, DocReview> {
  return Object.fromEntries(REVISED.flatMap((id) => (current(id) ? [[current(id)!.key, { reviewedOn: DEMO.reviewedDate }]] : [])))
}

/**
 * 12-25 (03 画面 17): every group approved 11-21 and in force 12-10, the new
 * copies issued 12-03; every old copy back on 12-10 except 乙班's of the
 * cleaning SOP and the process instruction groups (due 12-24, a day late) —
 * its 克霉唑 batch record came back 12-23. Complete (12-28): those four came
 * back 12-26 with the destruction record of the legacy copy. Demo scans carry no file.
 */
export function scriptedRollout(complete = false): Rollout {
  const reissues = ['SOP-SB-021', ...REVISED].flatMap((id) => (current(id) ? [{ old: current(id)!, newVersion: '', ready: true }] : []))
  const plan = rolloutPlan(reissues, libraryModel.setOf, libraryModel.catalog)
  const late = new Set(['SOP-SC-041', 'STP-GY-010'])
  const owed = (c: { holder: string; group: string }) => c.holder === TERMS.departments.shiftB && late.has(c.group)
  const returned = complete ? plan.copies : plan.copies.filter((c) => !owed(c))
  const on = (c: { copyNo: string; identity: string; holder: string; group: string }) =>
    owed(c) ? DEMO.lastReturnDate : c.holder === TERMS.departments.shiftB && c.identity === 'SOR-SC-011-R01' ? DEMO.lateReturnDate : DEMO.effectiveDate
  const scan = (copyNo: string) => ({ id: null, name: `${copyNo}.jpg`, size: 0, type: 'image/jpeg' })
  const legacy = complete ? plan.legacy : []
  const destruction = (copyNo: string) => ({ id: null, name: i18n.t('demo.script.destructionRecord', { copy: copyNo }), size: 0, type: 'image/jpeg' })
  const log: RolloutLogEntry[] = [
    ...plan.groups.map((g): RolloutLogEntry => ({ on: DEMO.approvedDate, action: 'approve', target: g.id })),
    ...plan.departments.map((d): RolloutLogEntry => ({ on: DEMO.issuedDate, action: 'issue', target: d })),
    ...returned.map((c): RolloutLogEntry => ({ on: on(c), action: 'return', target: c.copyNo, file: scan(c.copyNo).name })),
    ...legacy.flatMap((l): RolloutLogEntry[] => [
      { on: DEMO.lastReturnDate, action: 'return', target: l.copyNo, file: destruction(l.copyNo).name },
      { on: DEMO.lastReturnDate, action: 'note', target: l.copyNo },
    ]),
  ].sort((a, b) => a.on.localeCompare(b.on))
  return {
    approvals: Object.fromEntries(plan.groups.map((g) => [g.id, { approvedOn: DEMO.approvedDate, effectiveOn: DEMO.effectiveDate }])),
    issued: Object.fromEntries(plan.departments.map((d) => [d, { on: DEMO.issuedDate }])),
    returns: Object.fromEntries([
      ...returned.map((c) => [c.copyNo, { on: on(c), file: scan(c.copyNo) }]),
      ...legacy.map((l) => [l.copyNo, { on: DEMO.lastReturnDate, file: destruction(l.copyNo) }]),
    ]),
    notes: Object.fromEntries(legacy.map((l) => [l.copyNo, i18n.t('demo.script.legacyNote')])),
    log,
  }
}

/**
 * Both packs (operators, 设备工程部) confirmed as AI wrote them on 11-24;
 * trained before the new version took effect, the records scanned in 12-08 —
 * the operators also sat the written test (SMP-RY-004 §4.3).
 */
export function scriptedTraining(): Record<string, PackRecord> {
  const old = current('SOP-SB-021')
  const draft = libraryModel.catalog.byIdentity.get('SOP-SB-021')?.find((v) => v.origin === 'draft')
  if (!old || !draft?.document) return {}
  const scan = (name: string) => ({ on: DEMO.trainedDate, file: { id: null, name, size: 0, type: 'image/jpeg' } })
  return Object.fromEntries(
    trainingAudiences(draft.document, currentHolders(old)).map((a, i) => [
      a.role,
      {
        ...emptyPack(),
        confirmed: { material: DEMO.trainingConfirmedDate, questions: DEMO.trainingConfirmedDate },
        records: [
          scan(i18n.t('demo.script.signInSheet', { role: a.role })),
          ...(i === 0 ? [scan(i18n.t('demo.script.examRecord', { role: a.role }))] : []),
        ],
      },
    ]),
  )
}
