import type { TFunction } from 'i18next'
import type { HolderStatus } from '@/domain/rollout'

/** A holder's status in a few words: 「待交回 4 + 遗留 1」, 「已全部交回」, 「等批准」. */
export function holderText(t: TFunction, s: HolderStatus): string {
  const parts: string[] = []
  if (s.reviewing > 0) parts.push(t('rollout.dept.reviewing'))
  else if (s.awaiting > 0) parts.push(t('rollout.dept.awaiting'))
  else if (!s.issuedOn) parts.push(t('rollout.dept.toIssue'))
  else if (s.overdue > 0) parts.push(t('rollout.dept.overdue', { count: s.overdue }))
  else if (s.open > 0) parts.push(t('rollout.dept.toReturn', { count: s.open }))
  if (s.legacy > 0) parts.push(t('rollout.dept.legacy', { count: s.legacy }))
  if (parts.length === 0) return t('rollout.dept.done')
  return parts.join(t('rollout.dept.join'))
}

/** Something needs chasing: late copies or a legacy copy still out. */
export const holderAlert = (s: HolderStatus) => s.overdue > 0 || s.legacy > 0
