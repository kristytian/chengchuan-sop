import type { TFunction } from 'i18next'
import type { EvaluationConclusion } from '@/domain/assessment'
import type { ReviewTarget } from './model'

/** 「评估后改为必须改（质量管理部决定）：备注」 */
export function concludedText(t: TFunction, c: EvaluationConclusion): string {
  return t('review.whyConcluded', { by: c.by, note: c.note ? t('review.whyConcludedNote', { note: c.note }) : '' })
}

/** 「§1 目的、§2 适用范围、§4.2」 — the places the report says this document must change (or that were evaluated). */
export function reportPlaces(t: TFunction, target: Pick<ReviewTarget, 'entry'>): string {
  return target.entry.lines
    .filter((l) => l.conclusion === 'change' || target.entry.conclusion || target.entry.group === 'evaluate')
    .map((l) => (l.ref === 'header' ? t('assess.note.header') : l.ref === 'body' ? t('assess.note.body') : t('doc.place.clause', { number: l.ref }) + (l.heading.length <= 12 ? ` ${l.heading}` : '')))
    .join(t('common.listSep'))
}

/** 「报告：必须改 · §1 目的、§4.2」, or why a person added it to the report. */
export function whyLine(t: TFunction, target: ReviewTarget): string {
  const e = target.entry
  if (e.conclusion) return concludedText(t, e.conclusion)
  return e.origin === 'added' ? t('review.whyAdded', { reason: e.reason }) : t('review.why', { places: reportPlaces(t, target) })
}
