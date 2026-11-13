import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext } from 'react-router'
import { NotThisRound, Tag } from '@/components/common'
import { shortDate } from '@/lib/format'
import { Closing, ClosingSummary } from './closing'
import { effectiveDate, rolloutOpen, summaryOf } from './rollout/model'
import { trainingOpen, trainingSkipped, trainingSummary } from './training/model'
import { type ChangeView, changeNumber, closable, sourceLabel, stationDone } from './view'

/** 概览: what was filed at 发起, one line per station (03 画面 4), and 收尾 — 可关闭 and the 收尾总览 to print (画面 23). */
export function OverviewPage() {
  const { t } = useTranslation()
  const view = useOutletContext<ChangeView>()
  const { record } = view
  const base = `/changes/${record.id}`
  const effective = effectiveDate(view) ?? t('overview.effectivePending')
  const summary = closable(view) || !!record.closedOn

  return (
    <div className="print:p-0">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_1fr] gap-4 p-6 print:hidden">
        <section className="rounded-lg border bg-background">
          <h2 className="border-b px-4 py-2.5 text-sm font-semibold">{t('overview.info')}</h2>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2.5 px-4 py-3 text-sm">
            <Item label={t('overview.controlNo')}>
              <span className="font-mono text-xs">{changeNumber(t, record)}</span>
            </Item>
            <Item label={t('overview.title')}>{record.title}</Item>
            <Item label={t('overview.type')}>{t('overview.typeRevision')}</Item>
            <Item label={t('overview.source')}>
              {sourceLabel(view)} · {t('overview.sourceHow')} ·{' '}
              <Link to={`${base}/assess/compare`} className="font-medium hover:underline">
                {t('overview.compare')}
              </Link>
            </Item>
            <Item label={t('overview.reason')}>{record.reason}</Item>
            <Item label={t('overview.initiated')}>
              {record.requestedBy} · {record.initiatedOn}
            </Item>
            <Item label={t('overview.effective')}>{effective}</Item>
          </dl>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            {t('overview.history')} <NotThisRound>{t('overview.edit')}</NotThisRound>
          </p>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg border bg-background">
            <h2 className="border-b px-4 py-2.5 text-sm font-semibold">{t('overview.stations')}</h2>
            <ul className="divide-y text-sm">
              <StationRow
                name={t('overview.row.assess')}
                summary={view.ai.assess ? t('station.assess.ai', { ...view.ai.assess }) : assessSummary(t, view)}
                state={t(view.ai.assess ? 'overview.state.inProgress' : view.stage === 'exported' ? 'overview.state.done' : 'overview.state.toConfirm')}
                to={`${base}/assess`}
              />
              <StationRow
                name={t('overview.row.revise')}
                summary={
                  view.ai.revise
                    ? t('station.revise.ai', { ...view.ai.revise })
                    : view.stage === 'exported'
                      ? t('overview.row.reviseReady', { total: view.toRevise, done: view.reviewed })
                      : t('overview.row.reviseSummary')
                }
                state={t(view.stage !== 'exported' ? 'overview.state.notStarted' : !view.ai.revise && stationDone(view, 'revise') ? 'overview.state.done' : 'overview.state.inProgress')}
                to={`${base}/revise`}
              />
              <StationRow name={t('overview.row.rollout')} summary={rolloutSummaryText(t, view)} state={t(!rolloutOpen(view) ? 'overview.state.notStarted' : stationDone(view, 'rollout') ? 'overview.state.done' : 'overview.state.inProgress')} to={`${base}/rollout`} />
              {/* No training row when QA decided this change needs none (UX-62); the reason is in the report and the closing summary. */}
              {!trainingSkipped(view) && (
                <StationRow
                  name={t('overview.row.training')}
                  summary={view.ai.training ? t('station.training.ai', { ...view.ai.training }) : trainingSummaryText(t, view)}
                  state={t(!trainingOpen(view) ? 'overview.state.notStarted' : stationDone(view, 'training') ? 'overview.state.done' : 'overview.state.inProgress')}
                  to={`${base}/training`}
                />
              )}
            </ul>
          </section>
          <Closing view={view} />
        </div>
      </div>
      {summary && <ClosingSummary view={view} />}
    </div>
  )
}

function trainingSummaryText(t: TFunction, view: ChangeView): string {
  if (!trainingOpen(view)) return t('overview.row.trainingSummary')
  return t('overview.row.trainingProgress', trainingSummary(view))
}

function assessSummary(t: TFunction, view: ChangeView): string {
  const count = view.report.entries.length
  if (view.stage === 'draft') return t('overview.row.draftSummary', { count, look: view.lookTwice })
  return t('overview.row.exportedSummary', { count, date: shortDate(view.assessment.exportedOn ?? '') })
}

function rolloutSummaryText(t: TFunction, view: ChangeView): string {
  if (!rolloutOpen(view)) return t('overview.row.rolloutSummary')
  const s = summaryOf(view)
  const line = t('overview.row.rolloutProgress', { ...s })
  return s.overdue > 0 ? `${line} · ${t('overview.row.rolloutOverdue', { count: s.overdue })}` : line
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

function StationRow({ name, summary, state, to }: { name: string; summary: string; state: string; to: string }) {
  const { t } = useTranslation()
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="w-24 shrink-0 font-medium">{name}</span>
      <span className="min-w-0 flex-1 text-muted-foreground">{summary}</span>
      <Tag tone="muted">{state}</Tag>
      <Link to={to} className="shrink-0 font-medium hover:underline">
        {t('common.open')}
      </Link>
    </li>
  )
}
