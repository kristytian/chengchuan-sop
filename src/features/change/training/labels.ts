import type { TFunction } from 'i18next'
import { shortDate } from '@/lib/format'
import type { ChangeView } from '../view'
import { type Pack, trainingDeadline } from './model'

/** Search params of a pack's page. */
export const packLink = (role: string) => ({ search: `?pack=${encodeURIComponent(role)}` })

/** 「12-10 生效前」, or 「新版生效前」 before 换版追踪 has an effective date. */
export function deadlineText(t: TFunction, view: ChangeView): string {
  const due = trainingDeadline(view)
  return due ? t('training.deadline', { date: shortDate(due) }) : t('training.deadlinePending')
}

/** 「AI 示例 · 7 道题」, or that there is no AI draft yet. */
export function questionOrigin(t: TFunction, p: Pack): string {
  return p.ai ? t(p.example ? 'training.fromAIExample' : 'training.fromAI', { count: p.ai.questions.length }) : t('training.noAI')
}
