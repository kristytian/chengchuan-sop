// 首页「待处理」: what the signed-in account has to act on (01 画面 2、3).
import { useMemo } from 'react'
import { libraryModel } from '@/data/model'
import { rolloutOpen, summaryOf } from '@/features/change/rollout/model'
import { trainingOpen, trainingSummary } from '@/features/change/training/model'
import { type ChangeView, changeView, closable } from '@/features/change/view'
import { emptyAssessment, useDemo } from '@/store/demo'

export type Task =
  | { kind: 'issues'; count: number }
  | { kind: 'confirmReport'; view: ChangeView }
  | { kind: 'review'; view: ChangeView; count: number }
  | { kind: 'rollout'; view: ChangeView; what: 'approve' | 'issue' | 'overdue'; count: number }
  | { kind: 'training'; view: ChangeView; what: 'confirm' | 'record'; count: number }
  | { kind: 'close'; view: ChangeView }

export function useChangeViews(): ChangeView[] {
  const changes = useDemo((s) => s.changes)
  const assessments = useDemo((s) => s.assessments)
  const reviews = useDemo((s) => s.reviews)
  const rollouts = useDemo((s) => s.rollouts)
  const date = useDemo((s) => s.date)
  const trainings = useDemo((s) => s.trainings)
  return useMemo(
    () => changes.map((r) => changeView(r, assessments[r.id] ?? emptyAssessment(), reviews[r.id] ?? {}, rollouts[r.id], date, trainings[r.id])).filter((v) => v !== null),
    [changes, assessments, reviews, rollouts, date, trainings],
  )
}

export function useMyTasks(): Task[] {
  const all = useChangeViews()
  return useMemo(() => {
    // A closed change asks nothing more.
    const views = all.filter((v) => !v.record.closedOn)
    // AI's 影响评估报告 waits for QA to look at the flagged entries and confirm it (UX-50).
    const tasks: Task[] = views.filter((v) => v.stage === 'draft').map((view) => ({ kind: 'confirmReport', view }))
    // Then AI's revision drafts wait for QA's 审阅 (UX-51: QA reviews them all).
    for (const view of views) {
      if (view.stage !== 'exported') continue
      const pending = view.report.entries.filter((e) => e.group === 'mustChange' && !view.reviews[e.version]?.reviewedOn)
      if (pending.length > 0) tasks.push({ kind: 'review', view, count: pending.length })
    }
    // 换版追踪: groups OA approved wait for QA to register; sheets to issue; late copies to chase.
    for (const view of views) {
      if (!rolloutOpen(view)) continue
      const s = summaryOf(view)
      if (s.toApprove > 0) tasks.push({ kind: 'rollout', view, what: 'approve', count: s.toApprove })
      if (s.toIssue > 0) tasks.push({ kind: 'rollout', view, what: 'issue', count: s.toIssue })
      if (s.overdue > 0) tasks.push({ kind: 'rollout', view, what: 'overdue', count: s.overdue })
    }
    // 培训: packs to confirm, then training records to scan in.
    for (const view of views) {
      if (!trainingOpen(view)) continue
      const s = trainingSummary(view)
      if (s.confirmed < s.packs) tasks.push({ kind: 'training', view, what: 'confirm', count: s.packs - s.confirmed })
      else if (s.trained < s.packs) tasks.push({ kind: 'training', view, what: 'record', count: s.packs - s.trained })
    }
    // 收尾: every station done — close it once the QA head has signed.
    for (const view of views) if (closable(view)) tasks.push({ kind: 'close', view })
    if (libraryModel.issues.length > 0) tasks.push({ kind: 'issues', count: libraryModel.issues.length })
    return tasks
  }, [all])
}
