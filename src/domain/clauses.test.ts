import { describe, expect, it } from 'vitest'
import type { Block } from '../data/schema.ts'
import { splitClauses } from './clauses.ts'

const p = (text: string): Block => ({ kind: 'paragraph', text })
const table: Block = { kind: 'table', rows: [['项目', '参数']] }

describe('splitClauses', () => {
  it('cuts chapters and dotted sub-clauses, attaching following blocks', () => {
    const clauses = splitClauses([p('4　程序'), p('4.1 设备概述'), table, p('4.2.1 确认标识。'), p('补充说明。')])

    expect(clauses).toEqual([
      { number: '4', heading: '程序', body: [] },
      { number: '4.1', heading: '设备概述', body: [table] },
      { number: '4.2.1', heading: '确认标识。', body: [p('补充说明。')] },
    ])
  })

  it('keeps inline clause text as the heading', () => {
    expect(splitClauses([p('4　程序'), p('4.4 停机：降速至零后停止。')])[1]).toEqual({
      number: '4.4',
      heading: '停机：降速至零后停止。',
      body: [],
    })
  })

  it('treats a cited clause of another chapter as body text', () => {
    const clauses = splitClauses([p('3　本次改动摘要'), p('3.2 4.4 乳化：参数改了。'), p('4.4 乳化：由甲改为乙。')])

    expect(clauses.map((c) => c.number)).toEqual(['3', '3.2'])
    expect(clauses[1]).toMatchObject({ heading: '4.4 乳化：参数改了。', body: [p('4.4 乳化：由甲改为乙。')] })
  })

  it('makes a body without numbers one clause', () => {
    expect(splitClauses([p('一、检验结果'), table])).toEqual([{ number: null, heading: '', body: [p('一、检验结果'), table] }])
  })

  it('collects blocks before the first number into a null clause', () => {
    expect(splitClauses([p('前言'), p('1　目的')]).map((c) => c.number)).toEqual([null, '1'])
  })

  it('does not take a half-width-spaced or decimal paragraph for a clause', () => {
    expect(splitClauses([p('10 分钟后取样。'), p('0.5 g 供试品。')])).toHaveLength(1)
  })

  it('returns no clauses for an empty body', () => {
    expect(splitClauses([])).toEqual([])
  })
})
