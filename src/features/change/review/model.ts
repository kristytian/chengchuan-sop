// 审阅 (UX-50): for every 必须改 entry of the exported report, what AI does to
// its .docx (rules from the report, AI's example for rewrites, the summary and
// the 变更历史 row), and why each tracked change in the editor is there.
import { aiRuns, changeAnalysis, libraryModel, versionByKey } from '@/data/model'
import type { ReportEntry } from '@/domain/assessment'
import { lookupRun } from '@/domain/ai'
import { impactChangeForAI, impactSubject, inputHash, revisionDraftInput, stableJson } from '@/domain/ai-inputs'
import type { DocumentVersion, RevisionDraftSuggestion } from '@/domain/model'
import { applicableRewrites, bumpedCode, type DraftOperations, draftOperations, nextVersion, pointLabel } from '@/domain/revision'
import { type DocReview, emptyReview } from '@/store/demo'
import type { ChangeView } from '../view'
import type { DraftFinding } from '@/domain/draft-check'
import { draftCheckOf } from '../draft-check'
import type { ReviewPoint } from './points'

export interface ReviewTarget {
  entry: ReportEntry
  /** The version in force, being revised. */
  version: DocumentVersion
  newVersion: string
  newCode: string
  department: string
  /** What AI does to the .docx the first time it is opened. */
  ops: DraftOperations
  /** AI's 修改前后总结, each with where it is. */
  summary: RevisionDraftSuggestion['summary']
  /** The report's 修改要点 the draft is to carry out (UX-57), for 报告要点. */
  points: ReviewPoint[]
  /** 起草检查 of the version being revised (UX-58). */
  checks: DraftFinding[]
  example: boolean
  review: DocReview
}

const EMPTY_REVIEW: DocReview = emptyReview()
const made = new Map<string, Omit<ReviewTarget, 'entry' | 'review'>>()

/** The documents to revise, in report order. Empty until the report is exported. */
export function reviewTargets(view: ChangeView, reviews: Readonly<Record<string, DocReview>>): ReviewTarget[] {
  if (view.stage !== 'exported') return []
  // Includes the 需评估 entries whose 评估结论 is 必须改.
  const entries = view.report.entries.filter((e) => e.group === 'mustChange')
  const versions = entries.map((e) => versionByKey(e.version)).filter((v): v is DocumentVersion => !!v?.document)
  // Every versioned number of a document revised in this change moves on with it — the source included.
  const codes = new Map<string, string>(versions.flatMap((v) => (v.printedCode ? [[v.printedCode, bumpedCode(v.printedCode, v.version)] as [string, string]] : [])))
  if (view.oldVersion.printedCode && view.newVersion.printedCode) codes.set(view.oldVersion.printedCode, view.newVersion.printedCode)

  const targets = entries.flatMap((entry) => {
    const version = versionByKey(entry.version)
    if (!version?.document) return []
    // A 需评估 entry concluded 必须改 applies what its evaluated places carry too (the rule points, and people's).
    const lines = entry.lines.filter((l) => l.conclusion === 'change' || entry.conclusion)
    const points = lines.flatMap((l) => l.points.map((p) => ({ clause: l.ref, text: p.text, from: p.from, to: p.to, source: p.source, origin: p.origin, by: p.by })))
    const key = `${view.change.id}|${version.key}|${stableJson(points.map(({ clause, text, from, to }) => [clause, text, from, to]))}`
    let target = made.get(key)
    if (!target) {
      const ai = draftSuggestion(view, version, entry)
      target = {
        version,
        newVersion: nextVersion(version.version),
        newCode: bumpedCode(version.printedCode ?? version.identity, version.version),
        department: version.document.header.department,
        ops: draftOperations(version.document, {
          oldVersion: version.version,
          codes,
          points,
          // AI's rewrites stand while the points they carry out are on the report as they were (UX-57).
          rewrites: applicableRewrites(ai?.output.rewrites ?? [], points),
          history: ai?.output.history ?? null,
        }),
        summary: ai?.output.summary ?? [],
        points: points.map((p) => ({ clause: p.clause, label: pointLabel(p), origin: p.origin, ...(p.by && { by: p.by }) })),
        checks: draftCheckOf(version).findings,
        example: ai?.mode === 'example',
      }
      made.set(key, target)
    }
    return [{ ...target, entry, review: reviews[version.key] ?? EMPTY_REVIEW }]
  })
  // In the order the list shows them — by department, as each first appears — so 下一份 walks the list.
  const departments = [...new Set(targets.map((x) => x.department))]
  return targets.sort((a, b) => departments.indexOf(a.department) - departments.indexOf(b.department))
}

function draftSuggestion(view: ChangeView, version: DocumentVersion, entry: ReportEntry) {
  const input = revisionDraftInput(impactChangeForAI(view.change, changeAnalysis(view.change.id).diff, libraryModel.catalog), version, {
    tier: entry.group,
    lines: entry.lines,
  })
  const state = lookupRun<RevisionDraftSuggestion>(aiRuns, 'revisionDraft', impactSubject(view.change, version), inputHash(input))
  // A hand-written example stands for AI on the demo's report: when people's points differ, it is still used,
  // and only its rewrites whose points are gone drop (applicableRewrites). A real AI run must be current.
  return state.status === 'current' || (state.status === 'stale' && state.run?.mode === 'example') ? state.run : null
}
