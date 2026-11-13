import { useTranslation } from 'react-i18next'
import { PROGRESS_STATIONS, type ProgressStation } from '@/features/change/view'
import { cn } from '@/lib/utils'

/**
 * Four short bars — 影响评估、审阅、换版追踪、培训 — with the station work is at
 * written underneath (01 画面 2): the current bar darkest, the ones passed mid
 * grey, the ones ahead light. Three when the change needs no 培训 (UX-62).
 */
export function MiniProgress({ current, stations = PROGRESS_STATIONS }: { current: ProgressStation; stations?: readonly ProgressStation[] }) {
  const { t } = useTranslation()
  const at = stations.indexOf(current)
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="flex gap-0.5" aria-hidden>
        {stations.map((s, i) => (
          <span key={s} className={cn('h-1.5 w-6 rounded-full', i === at ? 'bg-foreground' : i < at ? 'bg-foreground/45' : 'bg-foreground/12')} />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">{t(`station.${current}.name`)}</span>
    </span>
  )
}
