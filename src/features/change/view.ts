// What a change looks like right now: its source versions, the impact report
// and which station it is at. Derived from the domain change and the demo
// state; later segments add the review, rollout and training states.
import type { TFunction } from 'i18next'
import { changeAnalysis, displayCode, domainChange, versionByKey } from '@/data/model'
import { needsLook, type Report, type ReportEntry, type ReportGroup, unevaluated } from '@/domain/assessment'
import type { Change, DocumentVersion, ImpactItem } from '@/domain/model'
import { shortDate } from '@/lib/format'
import { type AiStage, type Assessment, type ChangeRecord, type DocReview, emptyRollout, type PackRecord, type Rollout } from '@/store/demo'
import { reportOf } from './assess/model'
import { rolloutOpen, summaryOf } from './rollout/model'
import { audiencesOf, trainingDone, trainingOpen, trainingSummary } from './training/model'
import { type AiClock, type AiProgress, aiProgress } from './ai-progress'

/** The five tabs of a change (UX-47); the third is 审阅 since UX-50, route still `revise`. */
export const STATIONS = ['overview', 'assess', 'revise', 'rollout', 'training'] as const
export type StationId = (typeof STATIONS)[number]

/** The four stations the mini progress bar shows (首页、变更列表). */
export const PROGRESS_STATIONS = ['assess', 'revise', 'rollout', 'training'] as const
export type ProgressStation = (typeof PROGRESS_STATIONS)[number]

/** Where 影响评估 stands: AI's report waiting for QA, or exported (locked, version 1). */
export type AssessStage = 'draft' | 'exported'

export interface ChangeView {
  record: ChangeRecord
  change: Change
  oldVersion: DocumentVersion
  newVersion: DocumentVersion
  /** Every candidate the rules found. */
  impact: ImpactItem[]
  assessment: Assessment
  /** The report as people left it: generated entries minus removed, plus added, with 备注 and 评估结论. */
  report: Report
  /** 需评估 entries still without a 评估结论; the report cannot go out while there are any. */
  unevaluated: number
  /** Clause and header changes between the two versions. */
  changeCount: number
  /** The station work is at now. */
  current: ProgressStation
  stage: AssessStage
  /** Entries that ask for a person's look (AI undecided, model only, low confidence, not found). */
  lookTwice: number
  /** Documents to revise: 必须改 entries. */
  toRevise: number
  /** 审阅: how many of them the drafting departments have confirmed, by version key. */
  reviews: Readonly<Record<string, DocReview>>
  reviewed: number
  /** 换版追踪: what QA registered (approvals, issues, returns). */
  rollout: Rollout
  /** 培训: QA's changes to each pack, confirmation, training records, by audience. */
  training: Readonly<Record<string, PackRecord>>
  /** The demo date, for deadlines. */
  today: string
  /** Where AI is still working in front of the user (R1-02), and how far it is. */
  ai: Record<AiStage, AiProgress | null>
}

export function changeView(
  record: ChangeRecord,
  assessment: Assessment,
  reviews: Readonly<Record<string, DocReview>> = {},
  rollout: Rollout = emptyRollout(),
  today = record.initiatedOn,
  training: Readonly<Record<string, PackRecord>> = {},
  clock?: AiClock,
): ChangeView | null {
  const change = domainChange(record.changeId)
  if (change?.source.kind !== 'revision') return null
  const oldVersion = versionByKey(change.source.oldVersion)
  const newVersion = versionByKey(change.source.newVersion)
  if (!oldVersion || !newVersion) return null
  const { diff, impact } = changeAnalysis(change.id)
  const report = reportOf(change, assessment)
  const stage: AssessStage = assessment.exportedOn ? 'exported' : 'draft'
  const toRevise = report.entries.filter((e) => e.group === 'mustChange')
  const reviewed = stage === 'exported' ? toRevise.filter((e) => reviews[e.version]?.reviewedOn).length : 0
  const allReviewed = toRevise.length > 0 && reviewed === toRevise.length
  const view: ChangeView = {
    record,
    change,
    oldVersion,
    newVersion,
    impact,
    assessment,
    report,
    unevaluated: unevaluated(report).length,
    changeCount: (diff?.header.length ?? 0) + (diff?.clauses.length ?? 0),
    current: stage !== 'exported' ? 'assess' : allReviewed ? 'rollout' : 'revise',
    stage,
    lookTwice: report.entries.filter(needsLook).length,
    toRevise: toRevise.length,
    reviews,
    reviewed,
    rollout,
    training,
    today,
    ai: { assess: null, revise: null, training: null },
  }
  view.ai = {
    assess: aiProgress(clock, record.id, 'assess', report.entries.filter((e) => e.origin === 'generated').length),
    revise: stage === 'exported' ? aiProgress(clock, record.id, 'revise', toRevise.length) : null,
    training: allReviewed ? aiProgress(clock, record.id, 'training', audiencesOf(view).length) : null,
  }
  // Every old copy back: the change moves on to 培训.
  if (view.current === 'rollout' && rolloutDone(view)) view.current = 'training'
  return view
}

/** Every station done (概览 · 可关闭, 03 画面 23): closing is the QA head's signature on paper, recorded here. */
export function closable(view: ChangeView): boolean {
  return view.stage === 'exported' && view.toRevise > 0 && view.reviewed === view.toRevise && rolloutDone(view) && trainingDone(view)
}

/** Every old copy of this change back (legacy copies of earlier changes do not hold it up). */
function rolloutDone(view: ChangeView): boolean {
  const s = summaryOf(view)
  return s.copies > 0 && s.returned === s.copies
}

/** The report entry of a document in this change, if it is on the report. */
export function entryOf(view: ChangeView, versionKey: string): ReportEntry | undefined {
  return view.report.entries.find((e) => e.version === versionKey)
}

/** Where a document sits in the report: tier, indirect, or AI undecided. */
export function groupOf(view: ChangeView, versionKey: string): ReportGroup | null {
  return entryOf(view, versionKey)?.group ?? null
}

/** 「必须改 · 同组 · 待确认」: where a document sits in the report, for the library and file pages. */
export function reportRoleText(t: TFunction, view: ChangeView, versionKey: string): string | null {
  const entry = entryOf(view, versionKey)
  if (!entry) return null
  const item = view.impact.find((i) => i.version === versionKey)
  const parts = [t(`report.group.${entry.group}`)]
  if (item?.inSameSet) parts.push(t('report.role.sameSet'))
  if (entry.origin === 'added') parts.push(t('report.role.added'))
  if (view.stage === 'draft') parts.push(t('report.role.draft'))
  return parts.join(' · ')
}

/** 「BG-2026-018（演示）」 — the control number the user typed, marked as demo data. */
export function changeNumber(t: TFunction, record: ChangeRecord): string {
  return record.controlNo ? t('change.number', { no: record.controlNo }) : t('change.noNumber')
}

/** 「SOP-SB-021 02 → 03」 */
export function sourceLabel(view: ChangeView): string {
  const identity = view.change.source.kind === 'revision' ? view.change.source.identity : ''
  return `${identity} ${view.oldVersion.version} → ${view.newVersion.version}`
}

/** A finished station gets ✓ after its name (03 画面 14–23). */
export function stationDone(view: ChangeView, station: StationId): boolean {
  if (station === 'assess') return view.stage === 'exported'
  if (station === 'revise') return view.stage === 'exported' && view.reviewed === view.toRevise && view.toRevise > 0
  if (station === 'rollout') return rolloutOpen(view) && rolloutDone(view)
  if (station === 'training') return trainingDone(view)
  if (station === 'overview') return !!view.record.closedOn
  return false
}

/** The status line under each tab: 「站名 · 状态」, never who is doing it (UX-43). */
export function stationLine(t: TFunction, view: ChangeView, station: StationId): string {
  switch (station) {
    case 'overview':
      if (view.record.closedOn) return t('station.overview.closed', { date: view.record.closedOn.slice(5) })
      return closable(view) ? t('station.overview.closable') : t('station.overview.initiated', { date: view.record.initiatedOn.slice(5) })
    case 'assess':
      if (view.ai.assess) return t('station.assess.ai', { ...view.ai.assess })
      return view.stage === 'exported' ? t('station.assess.exported', { date: shortDate(view.assessment.exportedOn ?? '') }) : t('station.assess.draft', { count: view.report.entries.length })
    case 'revise':
      if (view.stage !== 'exported') return t('station.revise.waiting')
      if (view.ai.revise) return t('station.revise.ai', { ...view.ai.revise })
      return view.reviewed === view.toRevise ? t('station.revise.done', { total: view.toRevise }) : t('station.revise.inProgress', { done: view.reviewed, total: view.toRevise })
    case 'rollout': {
      if (!rolloutOpen(view)) return t('station.rollout.waiting')
      const s = summaryOf(view)
      if (s.approved === 0) return t('station.rollout.toApprove')
      if (s.approved < s.groups) return t('station.rollout.approving', { approved: s.approved, groups: s.groups })
      if (s.returned < s.copies) return t(s.overdue > 0 ? 'station.rollout.overdue' : 'station.rollout.returning', { returned: s.returned, copies: s.copies, overdue: s.overdue })
      return t('station.rollout.done', { copies: s.copies })
    }
    case 'training': {
      if (!trainingOpen(view)) return t('station.training.waiting')
      if (view.ai.training) return t('station.training.ai', { ...view.ai.training })
      const s = trainingSummary(view)
      if (s.confirmed < s.packs) return t('station.training.confirming', { confirmed: s.confirmed, packs: s.packs })
      if (s.trained < s.packs) return t('station.training.recording', { trained: s.trained, packs: s.packs })
      return t('station.training.done', { packs: s.packs })
    }
  }
}

export const versionCode = (v: DocumentVersion) => displayCode(v)
