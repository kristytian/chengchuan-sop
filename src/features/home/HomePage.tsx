import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { shortDate } from '@/lib/format'
import { Link, useNavigate } from 'react-router'
import { Section } from '@/components/common'
import { MiniProgress } from '@/components/MiniProgress'
import { displayCode, libraryModel, versionByKey } from '@/data/model'
import { fixOf, type IssueFix } from '@/domain/issues'
import { documentPath } from '@/features/library/paths'
import { useDemo } from '@/store/demo'
import { type ChangeView, changeNumber, stationLine, stepsOf } from '@/features/change/view'
import { type Task, useChangeViews, useMyTasks } from './tasks'

const FIXES: IssueFix[] = ['reviseDocument', 'fixLedger', 'review']
const ROLLOUT_TASK = { approve: 'rolloutApprove', issue: 'rolloutIssue', overdue: 'rolloutOverdue' } as const
const TASK_STATION = { confirmReport: 'assess', review: 'revise', rollout: 'rollout', training: 'training', close: 'overview' } as const
const TASK_GO = { confirmReport: 'confirmGo', review: 'reviewGo', rollout: 'rolloutGo', training: 'trainingGo', close: 'closeGo' } as const

function taskLine(t: TFunction, task: Extract<Task, { view: ChangeView }>): string {
  const { view } = task
  const base = { no: changeNumber(t, view.record), title: view.record.title }
  if (task.kind === 'review') return t('home.tasks.review', { ...base, count: task.count })
  if (task.kind === 'rollout') return t(`home.tasks.${ROLLOUT_TASK[task.what]}`, { ...base, count: task.count })
  if (task.kind === 'training') return t(task.what === 'confirm' ? 'home.tasks.trainingConfirm' : 'home.tasks.trainingRecord', { ...base, count: task.count })
  if (task.kind === 'close') return t('home.tasks.closable', base)
  const report = { ...base, count: view.report.entries.length, look: view.lookTwice }
  return view.unevaluated > 0 ? t('home.tasks.confirmReportEvaluate', { ...report, evaluate: view.unevaluated }) : t('home.tasks.confirmReport', report)
}

/** 首页 · 日常: 待处理、提醒、正在进行的变更 (01 画面 2、3). */
export function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const tasks = useMyTasks()
  // 正在进行的变更: closed ones are in the change list's 已关闭.
  const views = useChangeViews().filter((v) => !v.record.closedOn)
  // Worded against the demo date: the library judges on the sample cut-off (10-31), the demo starts later.
  const today = useDemo((s) => s.date)
  const reminders = libraryModel.reminders.map((r) => ({ ...r, v: versionByKey(r.version) })).filter(({ v }) => v)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <Section title={t('home.tasks.title')} count={tasks.length}>
        {tasks.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">{t('home.tasks.empty')}</p>}
        <ul className="divide-y">
          {tasks.map((task) =>
            task.kind === 'issues' ? (
              <li key="issues" className="px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span>{t('home.tasks.issues', { count: task.count })}</span>
                  {/* The issues page is out of this round; until then this opens the library filtered to files with issues. */}
                  <Link to="/library?view=issues" className="ml-auto shrink-0 font-medium hover:underline">
                    {t('home.tasks.handle')}
                  </Link>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {FIXES.map((fix) => t(`home.tasks.fix.${fix}`, { count: libraryModel.issues.filter((i) => fixOf(i.kind) === fix).length })).join(' · ')}
                </p>
              </li>
            ) : (
              <li key={`${task.kind}-${task.view.record.id}-${task.kind === 'rollout' || task.kind === 'training' ? task.what : ''}`} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span>{taskLine(t, task)}</span>
                <Link to={`/changes/${task.view.record.id}/${TASK_STATION[task.kind]}`} className="ml-auto shrink-0 font-medium hover:underline">
                  {t(`home.tasks.${TASK_GO[task.kind]}`)}
                </Link>
              </li>
            ),
          )}
        </ul>
      </Section>

      <Section title={t('home.reminders.title')} count={reminders.length}>
        {reminders.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">{t('home.reminders.empty')}</p>}
        <ul className="divide-y">
          {reminders.map(({ v, date }) =>
            v ? (
              <li key={v.key} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span>{t(date > today ? 'home.reminders.dueSoon' : date === today ? 'home.reminders.dueToday' : 'home.reminders.due', { code: displayCode(v), name: v.name, date })}</span>
                <Link to={documentPath(v)} className="ml-auto shrink-0 font-medium hover:underline">
                  {t('home.reminders.open')}
                </Link>
              </li>
            ) : null,
          )}
        </ul>
      </Section>

      <Section title={t('home.changes.title')} count={views.length}>
        {views.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t('home.changes.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-normal">{t('home.changes.col.change')}</th>
                <th className="px-4 py-2 font-normal">{t('home.changes.col.station')}</th>
                <th className="px-4 py-2 font-normal">{t('home.changes.col.now')}</th>
                <th className="px-4 py-2 font-normal">{t('home.changes.col.initiated')}</th>
              </tr>
            </thead>
            <tbody>
              {views.map((v) => (
                <tr key={v.record.id} onClick={() => navigate(`/changes/${v.record.id}/overview`)} className="cursor-pointer border-b last:border-0 hover:bg-muted/60">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs">{changeNumber(t, v.record)}</span>
                    {' '}
                    <Link to={`/changes/${v.record.id}/overview`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                      {v.record.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <MiniProgress current={v.current} stations={stepsOf(v)} />
                  </td>
                  <td className="px-4 py-2.5">{stationLine(t, v, v.current)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {v.record.requestedBy} · {shortDate(v.record.initiatedOn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}
