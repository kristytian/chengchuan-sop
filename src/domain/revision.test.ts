import { describe, expect, it } from 'vitest'
import { bumpedCode, draftOperations, nextVersion } from './revision.ts'
import { clause, para, sourceDoc } from './test-fixtures.ts'

const table = (...rows: string[][]) => ({ kind: 'table' as const, rows })

const process = {
  ...sourceDoc('STP-GY-010-03', {
    clauses: [
      clause('4.4', '关键工艺参数', table(['参数', '规定范围'], ['设备', 'RH-300 型（SB-RH-01）'], ['均质转速', '2500–3000 rpm'])),
      clause('4.7', '乳化工序按 SOP-SC-031 执行，日志见 SOR-SB-021-R01。'),
      clause('5', '相关文件', para('SOP-SB-021-02 乳化均质机规程')),
      clause('7', '文件变更历史', table(['版本号', '生效日期', '变更描述'], ['03', '2025-02-01', '均质时间调整'])),
    ],
  }),
  headerTable: [
    ['文件编号', 'STP-GY-010-03', '版 本 号', '03'],
    ['起 草 人', '许文　2024-12-28', '审 核 人', '程浩　2025-01-11'],
    ['批 准 人', '韩立群　2025-01-20', '生效日期', '2025-02-01'],
  ],
}

const plan = {
  oldVersion: '03',
  codes: new Map([
    ['SOP-SB-021-02', 'SOP-SB-021-03'],
    ['STP-GY-010-03', 'STP-GY-010-04'],
    ['SOP-SC-041-01', 'SOP-SC-041-02'],
  ]),
  points: [
    { clause: '4.4', text: '', from: 'RH-300', to: 'RH-500', source: [] },
    { clause: '4.4', text: '均质转速 2500–3000 → 2800–3400 rpm', from: '2500–3000 rpm', to: '2800–3400 rpm', source: ['4.3.3'] },
    { clause: '4.7', text: '乳化工序改写', from: null, to: null, source: ['4.1'] },
  ],
  rewrites: [{ clause: '4.7', text: '乳化工序按 SOP-SC-031 执行。' }],
  history: '设备换为 RH-500（SB-RH-02）',
}

describe('the revision draft AI hands over', () => {
  it('moves versions and printed numbers on', () => {
    expect(nextVersion('03')).toBe('04')
    expect(bumpedCode('SOP-SC-041-01', '01')).toBe('SOP-SC-041-02')
    expect(bumpedCode('SOR-SB-021-R01', '02')).toBe('SOR-SB-021-R01')
  })

  it('rewrites whole places first, then the header table, numbers and points — each with why', () => {
    const { replacements } = draftOperations(process, plan)
    expect(replacements.map((r) => [r.find, r.replace, r.why.kind])).toEqual([
      ['乳化工序按 SOP-SC-031 执行，日志见 SOR-SB-021-R01。', '乳化工序按 SOP-SC-031 执行。', 'rewrite'],
      ['03', '04', 'header'],
      ['许文　2024-12-28', '（未签）', 'header'],
      ['程浩　2025-01-11', '（未审核）', 'header'],
      ['韩立群　2025-01-20', '（未批准）', 'header'],
      ['2025-02-01', '待定', 'header'],
      ['SOP-SB-021-02', 'SOP-SB-021-03', 'code'],
      ['STP-GY-010-03', 'STP-GY-010-04', 'code'],
      ['RH-300', 'RH-500', 'point'],
      ['2500–3000 rpm', '2800–3400 rpm', 'point'],
    ])
    // Header values are whole cells, once; the rewrite says what in the report it follows.
    expect(replacements[1]).toMatchObject({ first: true, exact: true })
    expect(replacements[0].why).toEqual({ kind: 'rewrite', basis: ['乳化工序改写'] })
    expect(replacements.at(-1)?.why).toEqual({ kind: 'point', text: '均质转速 2500–3000 → 2800–3400 rpm', source: ['4.3.3'] })
  })

  it('adds a 变更历史 row only where the document keeps one', () => {
    expect(draftOperations(process, plan).historyRow).toEqual(['04', '待定', '设备换为 RH-500（SB-RH-02）'])
    const record = { ...sourceDoc('SOR-SB-021-R01', { clauses: [clause(null, '', para('设备：RH-300 型'))] }), headerTable: [] }
    expect(draftOperations(record, { ...plan, oldVersion: '02' }).historyRow).toBeNull()
  })

  it("moves a record's version and numbers on in its footer too", () => {
    const record = {
      ...sourceDoc('SOR-SB-021-R01', { clauses: [clause(null, '', para('设备：RH-300 型'))] }),
      headerTable: [],
      footer: ['SOR-SB-021-R01（第 02 版）  乳化均质机使用日志  对应 SOP-SB-021-02'],
    }
    const { replacements } = draftOperations(record, { ...plan, oldVersion: '02' })
    expect(replacements.filter((r) => r.margins).map((r) => [r.find, r.replace, r.why.kind])).toEqual([
      ['（第 02 版）', '（第 03 版）', 'header'],
      ['SOP-SB-021-02', 'SOP-SB-021-03', 'code'],
      ['RH-300', 'RH-500', 'point'],
    ])
  })
})
