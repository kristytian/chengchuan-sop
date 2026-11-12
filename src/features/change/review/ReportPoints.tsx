import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tag } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TERMS } from '@/domain/source-terms'
import { cn } from '@/lib/utils'
import { useDemo } from '@/store/demo'
import type { ChangeView } from '../view'
import { whyLine } from './labels'
import type { ReviewTarget } from './model'
import type { PointState } from './points'
import type { TrackedChange } from './reasons'

/**
 * 报告要点 (UX-57): the report's 修改要点 for this document, each 已改 (jump to
 * it), or 未改到 — closed by hand as 已改 or 不按这条改 with why. The
 * document's 备注 and 评估结论 stand above them. Opens by itself while any
 * point is still 未改到.
 */
export function ReportPoints({ view, target, states, editable, onGo }: { view: ChangeView; target: ReviewTarget; states: PointState[]; editable: boolean; onGo: (c: TrackedChange) => void }) {
  const { t } = useTranslation()
  const { closePoint, reopenPoint } = useDemo()
  const open = states.filter((s) => s.status === 'open').length
  const [shown, setShown] = useState(open > 0)
  const [declining, setDeclining] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const id = view.record.id
  const key = target.version.key
  const count = (status: PointState['status']) => states.filter((s) => s.status === status).length
  const place = (ref: string) => (ref === 'header' ? t('assess.note.header') : ref === 'body' ? t('assess.note.body') : t('doc.place.clause', { number: ref }))
  const link = 'underline-offset-2 hover:underline'

  return (
    <div className="shrink-0 border-b bg-muted/30 text-xs">
      <button type="button" aria-expanded={shown} onClick={() => setShown(!shown)} className="flex w-full items-center gap-4 px-5 py-1.5 text-left">
        <span className="min-w-0 truncate">{whyLine(t, target)}</span>
        {states.length > 0 && (
          <span className={cn('ml-auto shrink-0', open > 0 && 'font-medium')}>
            {t('review.points.summary', { total: states.length, changed: count('changed') + count('done'), open })}
            {count('declined') > 0 && t('review.points.declinedCount', { count: count('declined') })}
          </span>
        )}
        <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', states.length === 0 && 'ml-auto', shown && 'rotate-180')} />
      </button>
      {shown && (
        <div className="max-h-60 space-y-1 overflow-auto border-t bg-background px-5 py-2">
          {target.entry.comment && <p>{t('assess.report.comment', { department: TERMS.departments.qa, text: target.entry.comment })}</p>}
          <table className="w-full">
            <tbody>
              {states.map((s) => (
                <tr key={s.key} className="align-top">
                  <td className="w-24 py-1 pr-3 whitespace-nowrap text-muted-foreground">{place(s.clause)}</td>
                  <td className="py-1 pr-3">
                    {s.label}
                    {s.origin === 'person' && s.by && <span className="ml-1 text-muted-foreground">{t('assess.report.byPerson', { by: s.by })}</span>}
                    {s.status === 'declined' && s.closure?.note && <p className="text-muted-foreground">{t('review.points.declinedWhy', { note: s.closure.note })}</p>}
                    {declining === s.key && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <Input aria-label={t('review.points.reason')} value={reason} onChange={(e) => setReason(e.target.value)} className="h-7 text-xs" />
                        <Button
                          size="sm"
                          disabled={!reason.trim()}
                          onClick={() => {
                            closePoint(id, key, s.key, 'declined', reason.trim())
                            setDeclining(null)
                            setReason('')
                          }}
                        >
                          {t('review.points.save')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeclining(null)}>
                          {t('review.points.cancel')}
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="w-56 py-1 text-right whitespace-nowrap">
                    {s.status === 'changed' && s.change ? (
                      <button type="button" className={link} onClick={() => onGo(s.change!)}>
                        {t('review.points.status.changed')} →
                      </button>
                    ) : s.status === 'changed' ? (
                      t('review.points.status.changed')
                    ) : s.status === 'open' ? (
                      <span className="inline-flex items-center gap-2">
                        <Tag tone="strong">{t('review.points.status.open')}</Tag>
                        {editable && declining !== s.key && (
                          <>
                            <button type="button" className={link} onClick={() => closePoint(id, key, s.key, 'done', '')}>
                              {t('review.points.markDone')}
                            </button>
                            <button type="button" className={link} onClick={() => setDeclining(s.key)}>
                              {t('review.points.decline')}
                            </button>
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        {t(`review.points.status.${s.status}`)}
                        {editable && (
                          <button type="button" className={cn(link, 'text-muted-foreground')} onClick={() => reopenPoint(id, key, s.key)}>
                            {t('review.points.undo')}
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
