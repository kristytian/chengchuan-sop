import { useTranslation } from 'react-i18next'
import { Tag } from '@/components/common'
import { displayCode } from '@/data/model'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AiProgress } from '../ai-progress'
import { AiItemState } from '../AiWorking'
import { concludedText, reportPlaces } from './labels'
import type { ReviewTarget } from './model'
import { plannedStatuses } from './points'

const COLS = ['file', 'places', 'summary', 'status', 'action'] as const
const WIDTH: Record<(typeof COLS)[number], string> = { file: 'w-[30%]', places: 'w-[22%]', summary: '', status: 'w-32', action: 'w-24' }

/**
 * 审阅's entry: every revision draft AI made from the exported report, by the
 * department that reviews it — the account's own first — with where the
 * report says it must change, what AI changed, and where it stands. A row
 * opens the draft. A 需评估 document whose 评估结论 is 必须改 is here too, marked so.
 */
/** While AI is still revising (R1-02), the drafts it has not finished are listed but cannot be opened yet. */
export function ReviewList({ targets, onOpen, progress }: { targets: ReviewTarget[]; onOpen: (i: number) => void; progress: AiProgress | null }) {
  const { t } = useTranslation()
  // Grouped by 起草部门, for reference: QA reviews them all (UX-51).
  const departments = [...new Set(targets.map((x) => x.department))]
  const done = targets.filter((x) => x.review.reviewedOn).length
  const ready = (i: number) => !progress || i < progress.done

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold">{t('review.list.title')}</h1>
          <span className="text-sm text-muted-foreground">{t('review.list.count', { total: targets.length, done })}</span>
          {progress && <span className="text-sm text-ai">{t('station.revise.ai', { ...progress })}</span>}
        </div>
        <div className="mt-4 rounded-lg border bg-background">
          <table className="w-full table-fixed text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                {COLS.map((c) => (
                  <th key={c} className={cn('px-3 py-2 font-normal first:pl-4', WIDTH[c])}>
                    {c === 'action' ? '' : t(`review.list.col.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            {departments.map((department) => {
              const rows = targets.flatMap((x, i) => (x.department === department ? [{ x, i }] : []))
              return (
                <tbody key={department} className="border-b last:border-0">
                  <tr className="bg-muted/40">
                    <td colSpan={COLS.length} className="px-4 py-1.5 text-xs">
                      <span className="font-medium">{department}</span>
                      <span className="ml-2 text-muted-foreground">{t('review.list.group', { total: rows.length, done: rows.filter((r) => r.x.review.reviewedOn).length })}</span>
                    </td>
                  </tr>
                  {rows.map(({ x, i }) => {
                    return (
                      <tr
                        key={x.version.key}
                        onClick={ready(i) ? () => onOpen(i) : undefined}
                        className={cn('border-t align-top', ready(i) ? 'cursor-pointer hover:bg-muted/60' : 'text-muted-foreground')}
                      >
                        <td className="py-2.5 pr-3 pl-4">
                          <span className="block font-mono text-xs whitespace-nowrap">
                            {displayCode(x.version)} → {x.newVersion}
                          </span>
                          <span className="block truncate">{x.version.name}</span>
                          {x.entry.conclusion && <Tag className="mt-1">{t('review.list.concludedTag')}</Tag>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="line-clamp-2" title={x.entry.conclusion ? concludedText(t, x.entry.conclusion) : undefined}>
                            {x.entry.conclusion
                              ? concludedText(t, x.entry.conclusion)
                              : x.entry.origin === 'added'
                                ? t('review.whyAdded', { reason: x.entry.reason })
                                : reportPlaces(t, x)}
                          </span>
                          <PointCounts target={x} />
                        </td>
                        <td className="px-3 py-2.5 text-ai">
                          <span className="line-clamp-2" title={x.summary.map((s) => s.text).join('\n')}>
                            {x.summary.length > 0 ? x.summary.map((s) => s.text).join(t('common.pointSep')) : t('review.list.noSummary')}
                          </span>
                        </td>
                        {ready(i) ? (
                          <>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {x.review.reviewedOn ? (
                            <Tag tone="strong">{t('review.list.reviewedOn', { date: shortDate(x.review.reviewedOn) })}</Tag>
                          ) : (
                            <span className="text-muted-foreground">{t('review.status.pending')}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 pl-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onOpen(i)
                            }}
                            className={cn('hover:underline', !x.review.reviewedOn ? 'font-medium' : 'text-muted-foreground')}
                          >
                            {t(!x.review.reviewedOn ? 'review.list.open' : 'review.list.view')}
                          </button>
                        </td>
                          </>
                        ) : (
                          <td colSpan={2} className="py-2.5 pr-4 pl-3 text-right">
                            <span className="inline-flex">
                              <AiItemState index={i} progress={progress!} />
                            </span>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              )
            })}
          </table>
        </div>
      </div>
    </div>
  )
}

/** 「未改到 1 · 不按要点改 1」 under the places: the report's 修改要点 the draft does not carry out (UX-57). */
function PointCounts({ target }: { target: ReviewTarget }) {
  const { t } = useTranslation()
  const states = plannedStatuses(target.points, target.ops, target.review.closures)
  const open = states.filter((s) => s.status === 'open').length
  const declined = states.filter((s) => s.status === 'declined').length
  if (open + declined === 0) return null
  return (
    <span className="mt-0.5 block text-xs">
      {[open > 0 && t('review.list.pointsOpen', { count: open }), declined > 0 && t('review.list.pointsDeclined', { count: declined })].filter(Boolean).join(t('common.pointSep'))}
    </span>
  )
}
