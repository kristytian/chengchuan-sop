import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog.ts'
import { buildDocumentSets } from './groups.ts'
import { addWorkdays, canIssue, cellState, holderStatus, newCopyNumber, type Reissue, returnWorkdays, rolloutPlan, rolloutSummary } from './rollout.ts'
import { ledgerRow, library, sourceDoc } from './test-fixtures.ts'
import { TERMS } from './source-terms.ts'

const sop = sourceDoc('SOP-SB-021-02')
const log = sourceDoc('SOR-SB-021-R01', { version: '02', correspondingDoc: 'SOP-SB-021-02' })
const clean = sourceDoc('SOP-SC-041-01')
const old = sourceDoc('SOP-SC-031-01')
const lib = library(
  [sop, log, clean, old],
  [
    ledgerRow('SOP-SB-021', '02', { copyNo: 'SOP-SB-021-02-01', holder: 'Equipment' }),
    ledgerRow('SOP-SB-021', '02', { copyNo: 'SOP-SB-021-02-02', holder: 'Shift A' }),
    ledgerRow('SOR-SB-021-R01', '02', { copyNo: 'SOR-SB-021-R01-02-01', holder: 'Shift A' }),
    ledgerRow('SOP-SC-041', '01', { copyNo: 'SOP-SC-041-01-01', holder: 'Shift A' }),
    ledgerRow('SOP-SC-041', '01', { copyNo: 'SOP-SC-041-01-02', holder: 'Shift A', status: TERMS.statusObsolete, returnedDate: '2024-01-01' }),
    ledgerRow('SOP-SC-031', '01', { copyNo: 'SOP-SC-031-01-03', holder: 'Shift A', status: TERMS.statusObsolete, remark: 'lost?' }),
    ledgerRow('SOP-SC-031', '01', { copyNo: 'SOP-SC-031-01-04', holder: 'Elsewhere', status: TERMS.statusObsolete }),
  ],
)
const catalog = buildCatalog(lib)
const { setOf } = buildDocumentSets(catalog)
const v = (identity: string) => catalog.byIdentity.get(identity)![0]
const reissues: Reissue[] = [
  { old: v('SOP-SB-021'), newVersion: '03', ready: true },
  { old: v('SOR-SB-021-R01'), newVersion: '03', ready: true },
  { old: v('SOP-SC-041'), newVersion: '02', ready: false },
]
const plan = rolloutPlan(reissues, setOf, catalog)
const empty = { approvals: {}, issued: {}, returns: {} }

describe('换版追踪', () => {
  it('reissues by 文件组 and lists each holder’s copies in force, with the new copy number', () => {
    expect(plan.groups.map((g) => [g.id, g.members.map((m) => m.old.identity)])).toEqual([
      ['SOP-SB-021', ['SOP-SB-021', 'SOR-SB-021-R01']],
      ['SOP-SC-041', ['SOP-SC-041']],
    ])
    expect(plan.copies.map((c) => [c.copyNo, c.newCopyNo, c.holder])).toEqual([
      ['SOP-SB-021-02-01', 'SOP-SB-021-03-01', 'Equipment'],
      ['SOP-SB-021-02-02', 'SOP-SB-021-03-02', 'Shift A'],
      ['SOR-SB-021-R01-02-01', 'SOR-SB-021-R01-03-01', 'Shift A'],
      // The copy returned long ago is not out any more.
      ['SOP-SC-041-01-01', 'SOP-SC-041-02-01', 'Shift A'],
    ])
    expect(plan.departments).toEqual(['Shift A', 'Equipment'])
    // An obsolete copy never returned, held by a holder in this rollout.
    expect(plan.legacy.map((l) => [l.copyNo, l.holder, l.remark])).toEqual([['SOP-SC-031-01-03', 'Shift A', 'lost?']])
    expect(newCopyNumber('odd-number', 'SOP-SC-041', '01', '02')).toBe('odd-number → 02')
  })

  it('reads the return deadline from the document-control SMP and counts working days', () => {
    expect(returnWorkdays(['4.4.1 …', '4.4.2 新版生效后 10 个工作日内，各持有部门交回旧版受控副本'])).toBe(10)
    expect(returnWorkdays(['nothing'])).toBeNull()
    // 2026-12-10 is a Thursday: ten working days later is Thursday 12-24.
    expect(addWorkdays('2026-12-10', 10)).toBe('2026-12-24')
    expect(addWorkdays('2026-12-11', 1)).toBe('2026-12-14')
  })

  it('moves a cell from review to approval, issue and return; late ones count their days', () => {
    expect(cellState(plan, empty, 'SOP-SC-041', 'Shift A', '2026-11-20', 10)).toEqual({ kind: 'reviewing' })
    expect(cellState(plan, empty, 'SOP-SB-021', 'Shift A', '2026-11-20', 10)).toEqual({ kind: 'awaitingApproval' })
    expect(cellState(plan, empty, 'SOP-SC-041', 'Equipment', '2026-11-20', 10)).toEqual({ kind: 'none' })
    const approved = { ...empty, approvals: { 'SOP-SB-021': { approvedOn: '2026-11-21', effectiveOn: '2026-12-10' } } }
    expect(cellState(plan, approved, 'SOP-SB-021', 'Shift A', '2026-11-21', 10)).toEqual({ kind: 'toIssue', count: 2 })
    // Shift A also holds SOP-SC-041, not approved yet: its sheet waits; Equipment's can go.
    expect(canIssue(plan, approved, 'Shift A')).toBe(false)
    expect(canIssue(plan, approved, 'Equipment')).toBe(true)
    const issued = { ...approved, issued: { 'Shift A': { on: '2026-12-03' } }, returns: { 'SOP-SB-021-02-02': { on: '2026-12-10' } } }
    expect(cellState(plan, issued, 'SOP-SB-021', 'Shift A', '2026-12-25', 10)).toEqual({ kind: 'toReturn', open: 1, due: '2026-12-24', overdueDays: 1 })
    const back = { ...issued, returns: { ...issued.returns, 'SOR-SB-021-R01-02-01': { on: '2026-12-23' } } }
    expect(cellState(plan, back, 'SOP-SB-021', 'Shift A', '2026-12-25', 10)).toEqual({ kind: 'returned', on: '2026-12-23' })
    expect(rolloutSummary(plan, issued, '2026-12-25', 10)).toEqual({ groups: 2, toApprove: 0, approved: 1, toIssue: 1, copies: 4, returned: 1, overdue: 1, legacy: 1 })
    // Shift A: SOP-SC-041 still in review; of its issued copies, two are out and one of them is late (SOP-SC-041 has no due date yet).
    expect(holderStatus(plan, issued, 'Shift A', '2026-12-25', 10)).toEqual({ copies: 3, reviewing: 1, awaiting: 0, issuedOn: '2026-12-03', open: 2, overdue: 1, legacy: 1 })
    expect(holderStatus(plan, approved, 'Equipment', '2026-11-21', 10)).toEqual({ copies: 1, reviewing: 0, awaiting: 0, issuedOn: null, open: 0, overdue: 0, legacy: 0 })
  })
})
