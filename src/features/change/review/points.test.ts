import { describe, expect, it } from 'vitest'
import type { DraftOperations, DraftReplacement } from '@/domain/revision'
import { allSettled, pointStatuses } from './points'
import { AI_AUTHOR, type TrackedChange } from './reasons'

const op = (find: string, replace: string, why: DraftReplacement['why']): DraftReplacement => ({ find, replace, first: false, exact: false, margins: true, why })
const ops: DraftOperations = {
  replacements: [
    op('RH-300', 'RH-500', { kind: 'point', text: 'RH-300 → RH-500', source: [] }),
    op('顶置均质头转子 / 定子', '底置均质头转子 / 定子（出料口上方）', { kind: 'rewrite', basis: ['S1 改为底置均质头出料口上方'] }),
  ],
  historyRow: null,
}
const change = (id: string, deleted: string, inserted: string): TrackedChange => ({ id, author: AI_AUTHOR, type: 'trackFormat', subtype: 'text-replacement', inserted, deleted, formatted: [], address: null })
const points = [
  { clause: '1', label: 'RH-300 → RH-500', origin: 'rule' as const },
  { clause: '4.2', label: 'S1 改为底置均质头出料口上方', origin: 'person' as const, by: '质量管理部' },
  { clause: '4.4', label: '验证次数改为连续 3 批', origin: 'person' as const, by: '质量管理部' },
]

describe('报告要点 in 审阅 (UX-57)', () => {
  it('counts a point 已改 while a change made for it is in the draft, by rule or by AI rewrite', () => {
    const states = pointStatuses(points, ops, [change('c1', 'RH-300', 'RH-500'), change('c2', '顶置', '底置')], {})
    expect(states.map((s) => s.status)).toEqual(['changed', 'changed', 'open'])
    expect(states[1].change?.id).toBe('c2')
    expect(allSettled(states)).toBe(false)
  })

  it('opens a point again when its change is rejected, and settles it when closed by hand', () => {
    const closures = { '4.4|验证次数改为连续 3 批': { state: 'declined' as const, note: '验证小组另行出方案', by: '质量管理部', on: '2026-11-20' } }
    const states = pointStatuses(points, ops, [change('c1', 'RH-300', 'RH-500')], closures)
    expect(states.map((s) => s.status)).toEqual(['changed', 'open', 'declined'])
    const done = { ...closures, '4.2|S1 改为底置均质头出料口上方': { state: 'done' as const, note: '', by: '质量管理部', on: '2026-11-20' } }
    expect(allSettled(pointStatuses(points, ops, [change('c1', 'RH-300', 'RH-500')], done))).toBe(true)
  })

  it('does not count a change a person typed as carrying out a point', () => {
    const typed = { ...change('c3', 'RH-300', 'RH-500'), author: '质量管理部' }
    expect(pointStatuses(points, ops, [typed], {})[0].status).toBe('open')
  })
})
