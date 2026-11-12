import { describe, expect, it } from 'vitest'
import type { DraftFinding } from '@/domain/draft-check'
import { checkStatuses, plannedCheckStatuses } from './checks'
import { AI_AUTHOR, type TrackedChange } from './reasons'

const finding: DraftFinding = { id: 'E2:4.3.3:一般', rule: 'E2', clause: '4.3.3', word: '一般', excerpt: '…一般不少于 3 次。', origin: 'rule', suggestion: null }
const change = (author: string, deleted: string, inserted: string): TrackedChange => ({ id: 'c', author, type: 'trackFormat', subtype: 'text-replacement', inserted, deleted, formatted: [], address: null })

describe('起草检查 in 审阅 (UX-58)', () => {
  it('counts a finding 已改 when a change in the draft takes its words out, whoever typed it', () => {
    expect(checkStatuses([finding], [change('质量管理部', '一般不少于', '且不少于')], {})[0].status).toBe('fixed')
    expect(checkStatuses([finding], [change(AI_AUTHOR, 'RH-300', 'RH-500')], {})[0].status).toBe('open')
  })

  it('keeps a finding open until closed by hand, and reads AI’s operations before the editor opens', () => {
    const closures = { 'check|E2:4.3.3:一般': { state: 'declined' as const, note: '下次定期回顾时修订', by: '质量管理部', on: '2026-11-20' } }
    expect(checkStatuses([finding], [], closures)[0]).toMatchObject({ status: 'declined', closure: { note: '下次定期回顾时修订' } })
    const ops = { replacements: [{ find: '一般不少于 3 次', replace: '且不少于 3 次', first: true, exact: false, margins: false, why: { kind: 'rewrite' as const, basis: [] } }], historyRow: null }
    expect(plannedCheckStatuses([finding], ops, {})[0].status).toBe('fixed')
  })
})
