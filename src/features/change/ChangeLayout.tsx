import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useParams } from 'react-router'
import { cn } from '@/lib/utils'
import { useAssessment, useChangeRecord, useDemo, useReviews, useRollout, useTraining } from '@/store/demo'
import { CHANGE_SIDE } from './layout'
import { type ChangeView, changeNumber, changeView, STATIONS, stationDone, stationLine } from './view'

/**
 * A change: one title row — number and short title on the left, as wide as
 * every station's left column (UX-43), then five tabs sharing the rest, each
 * with its status line; a finished station gets ✓; only the open tab is
 * highlighted (UX-47).
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
  const view = record ? changeView(record, assessment, reviews, rollout, today, training) : null
  if (!view) return <p className="p-8 text-sm text-muted-foreground">{t('change.notFound')}</p>

  return (
    <div className="flex h-full flex-col print:block print:h-auto">
      <div className="flex shrink-0 items-stretch border-b bg-background print:hidden">
        <div className={cn(CHANGE_SIDE, 'flex shrink-0 items-center gap-2 border-r px-4 py-2')}>
          <span className="shrink-0 rounded-sm border px-1 font-mono text-[11px] leading-5 text-muted-foreground">{changeNumber(t, view.record)}</span>
          <span title={view.record.title} className="truncate text-[13px] font-semibold">
            {view.record.title}
          </span>
        </div>
        <nav className="flex min-w-0 flex-1">
          {STATIONS.map((s) => (
            <NavLink
              key={s}
              to={`/changes/${view.record.id}/${s}`}
              className={({ isActive }) => cn('flex min-w-0 flex-1 flex-col justify-center border-r px-4 py-2 last:border-r-0 hover:bg-muted/60', isActive && 'bg-muted shadow-[inset_0_-2px_0_var(--foreground)]')}
            >
              <span className="text-sm font-medium">{stationDone(view, s) ? t('station.done', { name: t(`station.${s}.name`) }) : t(`station.${s}.name`)}</span>
              <span className="truncate text-xs text-muted-foreground">{stationLine(t, view, s)}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-auto print:overflow-visible">
        <Outlet context={view satisfies ChangeView} />
      </div>
    </div>
  )
}
