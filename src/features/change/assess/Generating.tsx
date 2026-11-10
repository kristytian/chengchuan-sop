// 影响评估 while AI writes the report (R1-02): the files the rules found are
// listed at once, each marked as AI gets through it; the report comes when
// every one is done.
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { displayCode, versionByKey } from '@/data/model'
import { cn } from '@/lib/utils'
import type { AiProgress } from '../ai-progress'
import { AiItemState, AiWorkingPanel } from '../AiWorking'
import { CHANGE_SIDE } from '../layout'
import { type ChangeView, sourceLabel } from '../view'

export function AssessGenerating({ view, progress }: { view: ChangeView; progress: AiProgress }) {
  const { t } = useTranslation()
  const entries = view.report.entries.filter((e) => e.origin === 'generated')
  return (
    <div className="flex h-full">
      <aside className={cn(CHANGE_SIDE, 'flex shrink-0 flex-col border-r bg-background text-sm')}>
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <span className="text-muted-foreground">{t('assess.source')}</span>
          <span className="font-mono text-xs">{sourceLabel(view)}</span>
          <span className="text-muted-foreground">{t('assess.changes', { count: view.changeCount })}</span>
          <Link to="compare" className="ml-auto font-medium hover:underline">
            {t('assess.compareLink')}
          </Link>
        </div>
        <div className="border-b px-4 py-2.5">
          <p className="flex items-baseline gap-2">
            <span className="font-semibold">{t('assess.listTitle')}</span>
            <span>{t('assess.count', { count: entries.length })}</span>
          </p>
          <p className="text-xs text-ai">{t('station.assess.ai', { ...progress })}</p>
        </div>
        <ul className="min-h-0 flex-1 divide-y overflow-auto">
          {entries.map((e, i) => {
            const v = versionByKey(e.version)
            return (
              <li key={e.version} className={cn('flex items-center gap-3 px-4 py-2', i > progress.done && 'text-muted-foreground')}>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs">{v ? displayCode(v) : e.version}</span>
                  <span className="block truncate">{v?.name}</span>
                </span>
                <AiItemState index={i} progress={progress} />
              </li>
            )
          })}
        </ul>
      </aside>
      <div className="min-w-0 flex-1 overflow-auto">
        <AiWorkingPanel title={t('ai.working.assess')} count={t('ai.count.assess', { ...progress })} progress={progress} />
      </div>
    </div>
  )
}
