import { describe, expect, it } from 'vitest'
import type { DraftOperations } from '@/domain/revision'
import { AI_AUTHOR, formattedOf, reasonOf, type TrackedChange } from './reasons'

const ops: DraftOperations = {
  replacements: [
    { find: '03', replace: '04', first: true, exact: true, margins: false, why: { kind: 'header', field: 'version' } },
    { find: 'STP-GY-010-03', replace: 'STP-GY-010-04', first: false, exact: false, margins: true, why: { kind: 'code' } },
    { find: '2500–3000 rpm', replace: '2800–3400 rpm', first: false, exact: false, margins: true, why: { kind: 'point', text: '均质转速', source: ['4.3.3'] } },
    { find: '−0.06 至 −0.08 MPa', replace: '−0.07 至 −0.09 MPa', first: false, exact: false, margins: true, why: { kind: 'point', text: '真空度', source: [] } },
  ],
  historyRow: ['04', '待定', '设备换为 RH-500'],
}
const change = (deleted: string | null, inserted: string | null, author = AI_AUTHOR): TrackedChange => ({ id: 'x', author, type: 'replacement', subtype: 'text-replacement', deleted, inserted, formatted: [], address: null })

describe('why a tracked change is in the draft', () => {
  it('names the operation, also when the editor kept only what differs', () => {
    expect(reasonOf(ops, change('03', '04'))).toEqual({ kind: 'header', field: 'version' })
    expect(reasonOf(ops, change('STP-GY-010-03', 'STP-GY-010-04'))).toEqual({ kind: 'code' })
    expect(reasonOf(ops, change('2500–3000', '2800–3400'))).toMatchObject({ kind: 'point', text: '均质转速' })
    expect(reasonOf(ops, change('−0.06 … −0.08', '−0.07 … −0.09'))).toMatchObject({ kind: 'point', text: '真空度' })
  })

  it('tells the 变更历史 row, other AI edits and a person apart', () => {
    expect(reasonOf(ops, change(null, '04\n待定\n设备换为 RH-500'))).toEqual({ kind: 'history' })
    expect(reasonOf(ops, change('A', 'B'))).toEqual({ kind: 'ai' })
    expect(reasonOf(ops, change(null, '班长复核。', '生产技术部'))).toEqual({ kind: 'person' })
  })

  it('names what a formatting change changed', () => {
    expect(formattedOf('run formatting revision: bold: off → on, fontSize: 21 → 23, font: 宋体 → 黑体')).toEqual(['bold', 'size', 'font'])
    expect(formattedOf('paragraph formatting revision: spacingAfter: 40 → 60, spacingLine: 300 → ∅, spacingLineRule: auto → ∅, indentLeft: 425 → ∅, spacingBefore: ∅ → 160')).toEqual(['spacing', 'line', 'indent'])
    expect(formattedOf(null)).toEqual([])
  })
})
