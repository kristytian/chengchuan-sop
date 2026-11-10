import { describe, expect, it } from 'vitest'
import type { TextSegment } from './model.ts'
import { diffDocuments } from './diff.ts'
import { clause, para, sourceDoc } from './test-fixtures.ts'

// Intl.Segmenter output is only loosely specified, so tests check what the
// segments rebuild and where the changed words land, not the exact split.
const rebuild = (segments: TextSegment[], side: 'old' | 'new') =>
  segments
    .filter((s) => s.op === 'same' || s.op === (side === 'old' ? 'removed' : 'added'))
    .map((s) => s.text)
    .join('')
const changed = (segments: TextSegment[], op: 'added' | 'removed') =>
  segments
    .filter((s) => s.op === op)
    .map((s) => s.text)
    .join('')

describe('diffDocuments', () => {
  const oldDoc = sourceDoc('SOP-SB-021-02', {
    name: '乳化均质机（RH-300）规程',
    clauses: [
      clause('4', '程序'),
      clause('4.1', '设备概述', { kind: 'table', rows: [['有效容积', '300 L'], ['控制方式', '按钮面板']] }),
      clause('4.2', '投料后启动刮壁搅拌，转速 20–40 rpm。'),
      clause('4.3', '每周检查皮带。'),
      clause('4.4', '停机后出料。'),
      clause('7', '文件变更历史', { kind: 'table', rows: [['02', '2024-04-01', '调整周期']] }),
    ],
  })
  const newDoc = sourceDoc('SOP-SB-021-03', {
    name: '乳化均质机（RH-500）规程',
    effectiveDate: '待定',
    clauses: [
      clause('4', '程序'),
      clause('4.1', '设备概述', { kind: 'table', rows: [['有效容积', '500 L'], ['控制方式', '按钮面板']] }),
      clause('4.2', '投料后启动刮壁搅拌，转速 20–35 rpm。'),
      clause('4.4', '停机后出料。'),
      clause('4.5', '每 500 运行小时更换机械密封。', para('由设备工程部执行。')),
      clause('7', '文件变更历史', { kind: 'table', rows: [['02', '2024-04-01', '调整周期'], ['03', '待定', '更换设备']] }),
    ],
  })
  const diff = diffDocuments(oldDoc, newDoc)

  it('lists changed header fields', () => {
    expect(diff.header).toEqual([
      { field: 'name', old: '乳化均质机（RH-300）规程', new: '乳化均质机（RH-500）规程' },
      { field: 'version', old: '02', new: '03' },
      { field: 'effectiveDate', old: '2025-01-01', new: '待定' },
    ])
  })

  it('aligns clauses by number, keeps removed clauses in place and skips unchanged ones and the history chapter', () => {
    expect(diff.clauses.map((c) => [c.number, c.type])).toEqual([
      ['4.1', 'modified'],
      ['4.2', 'modified'],
      ['4.3', 'removed'],
      ['4.5', 'added'],
    ])
  })

  it('diffs a modified clause by words, table rows included', () => {
    const [table, text] = diff.clauses

    expect(table.oldText).toBe('设备概述\n有效容积 | 300 L\n控制方式 | 按钮面板')
    expect([changed(table.segments, 'removed'), changed(table.segments, 'added')]).toEqual(['300', '500'])
    expect(rebuild(text.segments, 'old')).toBe(text.oldText)
    expect(rebuild(text.segments, 'new')).toBe(text.newText)
    expect([changed(text.segments, 'removed'), changed(text.segments, 'added')]).toEqual(['40', '35'])
  })

  it('carries whole text for added and removed clauses', () => {
    expect(diff.clauses[2]).toEqual({ number: '4.3', type: 'removed', oldText: '每周检查皮带。', newText: null, segments: [{ text: '每周检查皮带。', op: 'removed' }] })
    expect(diff.clauses[3]).toMatchObject({ type: 'added', oldText: null, newText: '每 500 运行小时更换机械密封。\n由设备工程部执行。' })
  })
})
