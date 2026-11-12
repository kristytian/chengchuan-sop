// Demo state: the demo date and what has been done in the change loop
// (changes initiated, edits on the AI 影响评估报告, 审阅). Kept in
// localStorage so a reload keeps the demo where it was; 「重置演示」 clears it.
// Everything the rules can derive (impact candidates, diffs, issues) is not
// stored here — only people's actions are.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { domainChange, libraryModel, versionByKey } from '@/data/model'
import { emptyPointEdits, type AddedEntry, type Decision, type EntryPointEdits, type EvaluationConclusion, type PersonPoint } from '@/domain/assessment'
import type { PointClosure } from '@/domain/revision'
import { clearDrafts } from './drafts'
import { clearUploads, type UploadRef } from './uploads'
import { DEMO } from '@/domain/settings'
import { TERMS } from '@/domain/source-terms'
import i18n from '@/i18n'
import { scriptedConclusions, scriptedEdits, scriptedPoints, scriptedReviews, scriptedRollout, scriptedTraining } from './demo-script'

/**
 * The one user (UX-51): the product is for QA / QC and document control, so
 * there are no department accounts — every action is theirs. Departments are
 * what decisions and requests are recorded against, not who signs in.
 */
export const USER_DEPARTMENT = TERMS.departments.qa

/** A change initiated in the demo. Its source and equipment swap come from the domain Change (changeId). */
export interface ChangeRecord {
  /** Route id, e.g. `c1`. */
  id: string
  /** Domain change: `revision:SOP-SB-021:02->03`. */
  changeId: string
  /** 变更控制单号, as the user typed it (from OA). */
  controlNo: string
  title: string
  reason: string
  /** 申请部门: the department that raised the change in OA. QA records it here. */
  requestedBy: string
  initiatedOn: string
  /** 关闭: the day the QA head signed the 变更控制单 (recorded by QA); absent while open. */
  closedOn?: string
}

export interface RevisionInput {
  changeId: string
  controlNo: string
  title: string
  reason: string
  requestedBy: string
}

/**
 * 影响评估 of one change (UX-50): AI and the rules generate the report; people
 * take entries off (with a reason), put documents on, write a 备注, and give
 * each 需评估 entry its 评估结论; then QA confirms and exports it once —
 * version 1, locked.
 */
export interface Assessment {
  /** Version key → who decided to take it off the report. */
  removed: Record<string, Decision>
  added: AddedEntry[]
  /** Version key → a person's 备注 on that entry. */
  comments: Record<string, string>
  /** Version key → 评估结论 on a 需评估 entry. */
  conclusions: Record<string, EvaluationConclusion>
  /** Version key → 修改要点 people wrote, rewrote or took out (UX-57). */
  points: Record<string, EntryPointEdits>
  /** 起草检查 of the source's new version (UX-58), by finding id: sent back to its drafter, or kept with why. */
  sourceChecks: Record<string, SourceCheck>
  exportedOn: string | null
}

/** Where a finding on the source's new version went: the draft came from Word, so it is changed there or kept. */
export interface SourceCheck {
  state: 'returned' | 'kept'
  note: string
  by: string
  on: string
}

export const emptyAssessment = (): Assessment => ({ removed: {}, added: [], comments: {}, conclusions: {}, points: {}, sourceChecks: {}, exportedOn: null })

/** A 修改要点 as a person writes it: one sentence, or 原文 → 改成 (UX-57). */
export type PointInput = Pick<PersonPoint, 'clause' | 'text' | 'from' | 'to'>

/**
 * 审阅 of one document's draft (UX-50): when QA confirmed it, and how each
 * 修改要点 the draft did not carry out was closed (UX-57; by pointKey). The
 * draft itself is a .docx working copy (store/drafts).
 */
export interface DocReview {
  reviewedOn: string | null
  closures: Record<string, PointClosure>
}

export const emptyReview = (): DocReview => ({ reviewedOn: null, closures: {} })

/**
 * 换版追踪 of one change (UX-52): what QA registered — approval per 文件组 (OA
 * approved it), issue per holder (the sign-off sheet went out), and per old
 * copy the scan uploaded when it came back — plus a log of every step.
 */
export interface Rollout {
  /** Group id → when OA approved it and when the new versions take effect. */
  approvals: Record<string, { approvedOn: string; effectiveOn: string }>
  /** Holder → when its new copies went out (one sheet per holder). */
  issued: Record<string, { on: string }>
  /** Old copy number → when it came back, and its scan. */
  returns: Record<string, { on: string; file: UploadRef | null }>
  /** Old copy number → 备注 (a legacy copy said to be destroyed …). */
  notes: Record<string, string>
  log: RolloutLogEntry[]
}

export interface RolloutLogEntry {
  on: string
  action: 'approve' | 'withdrawApproval' | 'issue' | 'undoIssue' | 'return' | 'undoReturn' | 'note'
  /** Group id, holder or copy number. */
  target: string
  file?: string
  /** An issue registered by the first old copy's scan: new and old changed hands together. */
  withReturn?: boolean
}

export const emptyRollout = (): Rollout => ({ approvals: {}, issued: {}, returns: {}, notes: {}, log: [] })

/** The two documents of a training pack, in the order they are handed out. */
export type PackDocId = 'material' | 'questions'

/**
 * 培训 of one pack (UX-53): when QA confirmed each document — the 培训资料
 * and 考核题 Word documents themselves are working copies like 审阅 drafts
 * (store/drafts.ts); the answer key is AI's, shown only (R1, 11-10) — and the
 * training records (签到表、考核记录) scanned in; the first marks it trained.
 */
export interface PackRecord {
  confirmed: Partial<Record<PackDocId, string>>
  records: { on: string; file: UploadRef }[]
}

export const emptyPack = (): PackRecord => ({ confirmed: {}, records: [] })

/** Points of the demo timeline one can jump to from 演示工具. Later segments add more. */
export const CHECKPOINTS = ['start', 'assessing', 'exported', 'reviewed', 'returning', 'closable'] as const
export type Checkpoint = (typeof CHECKPOINTS)[number]

interface DemoData {
  date: string
  changes: ChangeRecord[]
  /** By change record id. */
  assessments: Record<string, Assessment>
  /** By change record id, then version key of the document being revised. */
  reviews: Record<string, Record<string, DocReview>>
  /** By change record id. */
  rollouts: Record<string, Rollout>
  /** By change record id, then audience (乳化岗位操作人员). */
  trainings: Record<string, Record<string, PackRecord>>
}

interface DemoActions {
  setDate: (date: string) => void
  /** Creates the change and returns its route id. */
  initiateRevision: (input: RevisionInput) => string
  reset: () => void
  jumpTo: (checkpoint: Checkpoint) => void
  // 影响评估报告
  /** 移出报告, decided by a department (with an optional 备注), dated today. */
  removeEntry: (changeId: string, versionKey: string, by: string, note: string) => void
  restoreEntry: (changeId: string, versionKey: string) => void
  addEntry: (changeId: string, entry: AddedEntry) => void
  dropAdded: (changeId: string, versionKey: string) => void
  setComment: (changeId: string, versionKey: string, comment: string) => void
  /** 修改要点 (UX-57), written by the account's department, dated today. pointId: an AI point's id, or a person's. */
  addPoint: (changeId: string, versionKey: string, point: PointInput) => void
  editPoint: (changeId: string, versionKey: string, pointId: string, point: PointInput) => void
  deletePoint: (changeId: string, versionKey: string, pointId: string) => void
  /** Brings back AI's own point after a person rewrote or took it out. */
  restorePoint: (changeId: string, versionKey: string, pointId: string) => void
  /** Demo tools: the scenario's points, written in one go. */
  fillScriptedPoints: (changeId: string) => void
  /** 起草检查 of the source's new version (UX-58). */
  setSourceCheck: (changeId: string, findingId: string, state: SourceCheck['state'], note: string) => void
  clearSourceCheck: (changeId: string, findingId: string) => void
  /** 评估结论 on a 需评估 entry, decided by a department (with an optional 备注), dated today. */
  concludeEntry: (changeId: string, versionKey: string, tier: EvaluationConclusion['tier'], by: string, note: string) => void
  withdrawConclusion: (changeId: string, versionKey: string) => void
  exportReport: (changeId: string) => void
  // 审阅
  setReviewed: (changeId: string, versionKey: string, reviewed: boolean) => void
  /** A 修改要点 the draft did not carry out: done by hand, or 不按这条改 with why (UX-57). */
  closePoint: (changeId: string, versionKey: string, key: string, state: PointClosure['state'], note: string) => void
  reopenPoint: (changeId: string, versionKey: string, key: string) => void
  // 换版追踪
  approveGroup: (changeId: string, group: string, approvedOn: string, effectiveOn: string) => void
  withdrawApproval: (changeId: string, group: string) => void
  /** New copies went out; withReturn when it is registered by the first returned copy's scan. */
  issueTo: (changeId: string, holder: string, withReturn?: boolean) => void
  undoIssue: (changeId: string, holder: string) => void
  /** An old copy came back: its scan is kept and it counts as returned today. */
  returnCopy: (changeId: string, copyNo: string, file: UploadRef) => void
  undoReturn: (changeId: string, copyNo: string) => void
  setCopyNote: (changeId: string, copyNo: string, note: string) => void
  // 培训
  confirmPackDoc: (changeId: string, role: string, doc: PackDocId) => void
  unconfirmPackDoc: (changeId: string, role: string, doc: PackDocId) => void
  /** A training record (签到表 / 考核记录) scanned in, dated today. */
  addTrainingRecord: (changeId: string, role: string, file: UploadRef) => void
  dropTrainingRecord: (changeId: string, role: string, index: number) => void
  // 收尾
  closeChange: (changeId: string, on: string) => void
  reopenChange: (changeId: string) => void
}

/** Where AI works in front of the user (R1-02). */
export type AiStage = 'assess' | 'revise' | 'training'

/**
 * When AI started on a change's stage (ms), keyed `${changeId}:${stage}` —
 * kept in memory only: after a reload, a reset or a jump it has finished.
 */
export interface AiRuns {
  generating: Record<string, number>
  startGeneration: (changeId: string, stage: AiStage) => void
  /** 演示工具 · 跳过 AI 等待. */
  skipGeneration: () => void
}

export type DemoState = DemoData & DemoActions & AiRuns

const initial = (): DemoData => ({ date: DEMO.startDate, changes: [], assessments: {}, reviews: {}, rollouts: {}, trainings: {} })

/** The form defaults for revising a document: title read from the equipment swap, demo reason and control number, 申请部门 the document's own. */
export function revisionDefaults(changeId: string): RevisionInput {
  const change = domainChange(changeId)
  const oldVersion = change?.source.kind === 'revision' ? versionByKey(change.source.oldVersion) : undefined
  const equipment = libraryModel.equipment.find((e) => e.mainSop === oldVersion?.identity)
  const swap = change?.equipment
  return {
    changeId,
    controlNo: DEMO.controlNo,
    title: swap && equipment ? i18n.t('initiate.defaultTitle', { name: equipment.name, from: swap.from, to: swap.to }) : '',
    reason: swap && equipment ? i18n.t('initiate.defaultReason', { name: equipment.name, from: swap.from, to: swap.to }) : '',
    requestedBy: oldVersion?.document?.header.department ?? USER_DEPARTMENT,
  }
}

/** The scenario's revision change (SOP-SB-021 02 → 03): the only draft in scenario-inputs/. */
export function scenarioRevision(): string | undefined {
  return libraryModel.changes.find((c) => c.source.kind === 'revision')?.id
}

export function checkpointState(checkpoint: Checkpoint): DemoData {
  const base = initial()
  const changeId = scenarioRevision()
  if (checkpoint === 'start' || !changeId) return base
  const record: ChangeRecord = { id: 'c1', ...revisionDefaults(changeId), initiatedOn: DEMO.startDate }
  // 发起后 AI 已出报告，QA 确认.
  const assessing = { ...base, changes: [record] }
  if (checkpoint === 'assessing') return assessing
  // 已导出: on 11-18 the two 需评估 documents have their 评估结论, so QA exports (version 1); AI's drafts wait for 审阅.
  const report = { ...emptyAssessment(), ...scriptedEdits(), conclusions: scriptedConclusions(), points: scriptedPoints(), exportedOn: DEMO.evaluatedDate }
  const exported = { ...assessing, date: DEMO.evaluatedDate, assessments: { c1: report } }
  if (checkpoint === 'exported') return exported
  // 审阅已确认: QA confirmed every draft on 11-20; OA approval is next.
  const reviewed = { ...exported, date: DEMO.reviewedDate, reviews: { c1: scriptedReviews() } }
  if (checkpoint === 'reviewed') return reviewed
  // 12-25: approved 11-21, issued 12-03, in force 12-10; both packs confirmed 11-24 and trained 12-08; 乙班 still owes four old copies (due 12-24).
  const returning = { ...reviewed, date: DEMO.overdueDate, rollouts: { c1: scriptedRollout() }, trainings: { c1: scriptedTraining() } }
  if (checkpoint === 'returning') return returning
  // 12-28: 乙班 brought the rest back on 12-26 with the destruction record of the legacy copy; every station is done.
  return { ...returning, date: DEMO.closableDate, rollouts: { c1: scriptedRollout(true) } }
}

const editPack = (state: DemoData, changeId: string, role: string, edit: (p: PackRecord) => PackRecord): Partial<DemoData> => {
  const packs = state.trainings[changeId] ?? {}
  return { trainings: { ...state.trainings, [changeId]: { ...packs, [role]: edit(packs[role] ?? emptyPack()) } } }
}

const editChange = (state: DemoData, changeId: string, edit: (c: ChangeRecord) => ChangeRecord): Partial<DemoData> => ({
  changes: state.changes.map((c) => (c.id === changeId ? edit(c) : c)),
})

const editRollout = (state: DemoData, changeId: string, edit: (r: Rollout) => Rollout, entry: Omit<RolloutLogEntry, 'on'>): Partial<DemoData> => {
  const r = edit(state.rollouts[changeId] ?? emptyRollout())
  return { rollouts: { ...state.rollouts, [changeId]: { ...r, log: [...r.log, { on: state.date, ...entry }] } } }
}

const without = <T,>(record: Record<string, T>, key: string) => {
  const copy = { ...record }
  delete copy[key]
  return copy
}

const editReview = (state: DemoData, changeId: string, key: string, edit: (r: DocReview) => DocReview): Partial<DemoData> => {
  const forChange = state.reviews[changeId] ?? {}
  return { reviews: { ...state.reviews, [changeId]: { ...forChange, [key]: edit(forChange[key] ?? emptyReview()) } } }
}

/** Applies a change to one assessment, creating it on first touch. */
const editAssessment = (state: DemoData, changeId: string, edit: (a: Assessment) => Assessment): Partial<DemoData> => ({
  assessments: { ...state.assessments, [changeId]: edit(state.assessments[changeId] ?? emptyAssessment()) },
})

const editPoints = (state: DemoData, changeId: string, versionKey: string, edit: (e: EntryPointEdits) => EntryPointEdits): Partial<DemoData> =>
  editAssessment(state, changeId, (a) => ({ ...a, points: { ...a.points, [versionKey]: edit(a.points[versionKey] ?? emptyPointEdits()) } }))

export const useDemo = create<DemoState>()(
  persist(
    (set, get) => ({
      ...initial(),
      setDate: (date) => set({ date }),
      initiateRevision: (input) => {
        const { changes, date } = get()
        const id = `c${changes.length + 1}`
        set((s) => ({ changes: [...changes, { id, ...input, initiatedOn: date }], generating: { ...s.generating, [`${id}:assess`]: Date.now() } }))
        return id
      },
      reset: () => {
        clearDrafts()
        void clearUploads()
        set({ ...initial(), generating: {} })
      },
      jumpTo: (checkpoint) => {
        clearDrafts()
        void clearUploads()
        set({ ...checkpointState(checkpoint), generating: {} })
      },
      removeEntry: (changeId, key, by, note) => set((s) => editAssessment(s, changeId, (a) => ({ ...a, removed: { ...a.removed, [key]: { by, on: s.date, note } } }))),
      restoreEntry: (changeId, key) =>
        set((s) =>
          editAssessment(s, changeId, (a) => {
            const removed = { ...a.removed }
            delete removed[key]
            return { ...a, removed }
          }),
        ),
      addEntry: (changeId, entry) => set((s) => editAssessment(s, changeId, (a) => ({ ...a, added: [...a.added.filter((x) => x.version !== entry.version), entry] }))),
      dropAdded: (changeId, key) => set((s) => editAssessment(s, changeId, (a) => ({ ...a, added: a.added.filter((x) => x.version !== key) }))),
      setComment: (changeId, key, comment) =>
        set((s) =>
          editAssessment(s, changeId, (a) => {
            const comments = { ...a.comments }
            if (comment) comments[key] = comment
            else delete comments[key]
            return { ...a, comments }
          }),
        ),
      addPoint: (changeId, key, point) =>
        set((s) =>
          editPoints(s, changeId, key, (e) => {
            const n = Math.max(0, ...e.added.map((p) => Number(p.id.split(':')[1]) || 0)) + 1
            return { ...e, added: [...e.added, { ...point, id: `person:${n}`, by: TERMS.departments.qa, on: s.date }] }
          }),
        ),
      editPoint: (changeId, key, id, point) =>
        set((s) =>
          editPoints(s, changeId, key, (e) => {
            const written = { ...point, id, by: TERMS.departments.qa, on: s.date }
            return id.startsWith('person:') ? { ...e, added: e.added.map((p) => (p.id === id ? written : p)) } : { ...e, edited: { ...e.edited, [id]: written } }
          }),
        ),
      deletePoint: (changeId, key, id) =>
        set((s) =>
          editPoints(s, changeId, key, (e) =>
            id.startsWith('person:')
              ? { ...e, added: e.added.filter((p) => p.id !== id) }
              : { ...e, edited: without(e.edited, id), deleted: { ...e.deleted, [id]: { by: TERMS.departments.qa, on: s.date } } },
          ),
        ),
      restorePoint: (changeId, key, id) => set((s) => editPoints(s, changeId, key, (e) => ({ ...e, edited: without(e.edited, id), deleted: without(e.deleted, id) }))),
      fillScriptedPoints: (changeId) =>
        set((s) =>
          editAssessment(s, changeId, (a) => {
            if (a.exportedOn) return a
            // Written now, by the account's department, in place of what the version had.
            const today = Object.fromEntries(Object.entries(scriptedPoints()).map(([key, e]) => [key, { ...e, added: e.added.map((p) => ({ ...p, on: s.date })) }]))
            return { ...a, points: { ...a.points, ...today } }
          }),
        ),
      setSourceCheck: (changeId, id, state, note) =>
        set((s) => editAssessment(s, changeId, (a) => ({ ...a, sourceChecks: { ...a.sourceChecks, [id]: { state, note, by: TERMS.departments.qa, on: s.date } } }))),
      clearSourceCheck: (changeId, id) => set((s) => editAssessment(s, changeId, (a) => ({ ...a, sourceChecks: without(a.sourceChecks, id) }))),
      closePoint: (changeId, key, pointKey, state, note) =>
        set((s) => editReview(s, changeId, key, (r) => ({ ...r, closures: { ...r.closures, [pointKey]: { state, note, by: TERMS.departments.qa, on: s.date } } }))),
      reopenPoint: (changeId, key, pointKey) => set((s) => editReview(s, changeId, key, (r) => ({ ...r, closures: without(r.closures, pointKey) }))),
      setReviewed: (changeId, key, reviewed) => set((s) => editReview(s, changeId, key, (r) => ({ ...r, reviewedOn: reviewed ? s.date : null }))),
      concludeEntry: (changeId, key, tier, by, note) =>
        set((s) => editAssessment(s, changeId, (a) => ({ ...a, conclusions: { ...a.conclusions, [key]: { tier, by, on: s.date, note } } }))),
      withdrawConclusion: (changeId, key) =>
        set((s) =>
          editAssessment(s, changeId, (a) => {
            const conclusions = { ...a.conclusions }
            delete conclusions[key]
            return { ...a, conclusions }
          }),
        ),
      exportReport: (changeId) => set((s) => ({ ...editAssessment(s, changeId, (a) => ({ ...a, exportedOn: s.date })), generating: { ...s.generating, [`${changeId}:revise`]: Date.now() } })),
      generating: {},
      startGeneration: (changeId, stage) => set((s) => ({ generating: { ...s.generating, [`${changeId}:${stage}`]: Date.now() } })),
      skipGeneration: () => set({ generating: {} }),
      approveGroup: (changeId, group, approvedOn, effectiveOn) =>
        set((s) => editRollout(s, changeId, (r) => ({ ...r, approvals: { ...r.approvals, [group]: { approvedOn, effectiveOn } } }), { action: 'approve', target: group })),
      withdrawApproval: (changeId, group) =>
        set((s) => editRollout(s, changeId, (r) => ({ ...r, approvals: without(r.approvals, group) }), { action: 'withdrawApproval', target: group })),
      issueTo: (changeId, holder, withReturn) =>
        set((s) =>
          editRollout(s, changeId, (r) => ({ ...r, issued: { ...r.issued, [holder]: { on: s.date } } }), {
            action: 'issue',
            target: holder,
            ...(withReturn && { withReturn }),
          }),
        ),
      undoIssue: (changeId, holder) =>
        set((s) => editRollout(s, changeId, (r) => ({ ...r, issued: without(r.issued, holder) }), { action: 'undoIssue', target: holder })),
      returnCopy: (changeId, copyNo, file) =>
        set((s) => editRollout(s, changeId, (r) => ({ ...r, returns: { ...r.returns, [copyNo]: { on: s.date, file } } }), { action: 'return', target: copyNo, file: file.name })),
      undoReturn: (changeId, copyNo) =>
        set((s) => editRollout(s, changeId, (r) => ({ ...r, returns: without(r.returns, copyNo) }), { action: 'undoReturn', target: copyNo })),
      setCopyNote: (changeId, copyNo, note) =>
        set((s) =>
          editRollout(s, changeId, (r) => ({ ...r, notes: note ? { ...r.notes, [copyNo]: note } : without(r.notes, copyNo) }), { action: 'note', target: copyNo }),
        ),
      confirmPackDoc: (changeId, role, doc) => set((s) => editPack(s, changeId, role, (p) => ({ ...p, confirmed: { ...p.confirmed, [doc]: s.date } }))),
      unconfirmPackDoc: (changeId, role, doc) =>
        set((s) =>
          editPack(s, changeId, role, (p) => {
            const { [doc]: _, ...rest } = p.confirmed
            return { ...p, confirmed: rest }
          }),
        ),
      addTrainingRecord: (changeId, role, file) => set((s) => editPack(s, changeId, role, (p) => ({ ...p, records: [...p.records, { on: s.date, file }] }))),
      dropTrainingRecord: (changeId, role, index) => set((s) => editPack(s, changeId, role, (p) => ({ ...p, records: p.records.filter((_, i) => i !== index) }))),
      closeChange: (changeId, on) => set((s) => editChange(s, changeId, (c) => ({ ...c, closedOn: on }))),
      reopenChange: (changeId) =>
        set((s) =>
          editChange(s, changeId, (c) => {
            const open = { ...c }
            delete open.closedOn
            return open
          }),
        ),
    }),
    {
      name: 'chengchuan-demo',
      // Bump when DemoData changes shape; an older saved demo starts over.
      version: 16,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ date, changes, assessments, reviews, rollouts, trainings }): DemoData => ({ date, changes, assessments, reviews, rollouts, trainings }),
      migrate: () => initial(),
    },
  ),
)

/** The change record behind a route id. */
export function useChangeRecord(id: string | undefined): ChangeRecord | undefined {
  return useDemo((s) => s.changes.find((c) => c.id === id))
}

const NO_ASSESSMENT = emptyAssessment()
const NO_REVIEWS: Record<string, DocReview> = {}

/** The 审阅 state of a change record's documents, by version key. */
export function useReviews(id: string | undefined): Record<string, DocReview> {
  return useDemo((s) => (id ? s.reviews[id] : undefined) ?? NO_REVIEWS)
}

const NO_PACKS: Record<string, PackRecord> = {}

/** The 培训 records of a change, by audience. */
export function useTraining(id: string | undefined): Record<string, PackRecord> {
  return useDemo((s) => (id ? s.trainings[id] : undefined) ?? NO_PACKS)
}

const NO_ROLLOUT = emptyRollout()

/** The 换版追踪 record of a change (an empty one before anyone touches it). */
export function useRollout(id: string | undefined): Rollout {
  return useDemo((s) => (id ? s.rollouts[id] : undefined) ?? NO_ROLLOUT)
}

/** The assessment of a change record (an empty one before anyone touches it). */
export function useAssessment(id: string | undefined): Assessment {
  return useDemo((s) => (id ? s.assessments[id] : undefined) ?? NO_ASSESSMENT)
}
