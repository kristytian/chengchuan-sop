import { Check, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useParams } from 'react-router'
import { cn } from '@/lib/utils'
import { useAssessment, useChangeRecord, useDemo, useReviews, useRollout, useTraining } from '@/store/demo'
import { useAiClock } from './ai-progress'
import { CHANGE_SIDE } from './layout'
import { type ChangeView, changeView, STATIONS, stationDone, stationLine } from './view'

/**
 * A change (R1-03, 11-10): 概览 is the change's home and the four stations
 * are steps under it. The left block — the title, 「← 概览」 — is the way
 * back to 概览 from any station (as wide as every
 * station's left column, UX-43); the rest is a step bar ① 影响评估 → ②
 * 审阅 → ③ 换版追踪 → ④ 培训, each with its status line, a finished one
 * ticked, the open one highlighted.
 */
export function ChangeLayout() {
  const { t } = useTranslation()
  const { id } = useParams()
  const record = useChangeRecord(id)
  const assessment = useAssessment(id)
  const reviews = useReviews(id)
  const rollout = useRollout(id)
  const today = useDemo((s) => s.date)
  const training = useTraining(id)
  const clock = useAiClock()
  const view = record ? changeView(record, assessment, reviews, rollout, today, training, clock) : null
  if (!view) return <p className="p-8 text-sm text-muted-foreground">{t('change.notFound')}</p>
  const steps = STATIONS.filter((s) => s !== 'overview')
  const active = 'bg-muted shadow-[inset_0_-2px_0_var(--foreground)]'

  return (
    <div className="flex h-full flex-col print:block print:h-auto">
      <div className="flex shrink-0 items-stretch border-b bg-background print:hidden">
        <NavLink to={`/changes/${view.record.id}/overview`} className={({ isActive }) => cn(CHANGE_SIDE, 'flex shrink-0 flex-col justify-center gap-0.5 border-r px-4 py-2 hover:bg-muted/60', isActive && active)}>
          {({ isActive }) => (
            <>
              <span title={view.record.title} className="truncate text-[13px] font-semibold">
                {view.record.title}
              </span>
              <span className="text-xs text-muted-foreground">{t(isActive ? 'change.overview' : 'change.backToOverview')}</span>
            </>
          )}
        </NavLink>
        <nav aria-label={t('change.steps')} className="flex min-w-0 flex-1">
          {steps.map((s, i) => {
            const done = stationDone(view, s)
            return (
              <NavLink key={s} to={`/changes/${view.record.id}/${s}`} className={({ isActive }) => cn('flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-4 hover:bg-muted/60', isActive && active)}>
                <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] tabular-nums', done && 'border-foreground bg-foreground text-background')}>
                  {done ? <Check className="size-3" aria-label={t('change.stepDone')} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t(`station.${s}.name`)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{stationLine(t, view, s)}</span>
                </span>
                {i < steps.length - 1 && <ChevronRight className="mr-1 size-4 shrink-0 text-muted-foreground/50" aria-hidden />}
              </NavLink>
            )
          })}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-auto print:overflow-visible">
        <Outlet context={view satisfies ChangeView} />
      </div>
    </div>
  )
}
