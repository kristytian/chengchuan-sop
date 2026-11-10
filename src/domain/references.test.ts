import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog.ts'
import { findEquipment } from './equipment.ts'
import { extractReferences } from './references.ts'
import { clause, library, para, sourceDoc } from './test-fixtures.ts'

function extract(...docs: Parameters<typeof library>[0]) {
  const catalog = buildCatalog(library(docs))
  return extractReferences(catalog, findEquipment(catalog))
}
const brief = (refs: ReturnType<typeof extract>['references']) =>
  refs.map((r) => ({ clause: r.from.clause, kind: r.kind, target: r.target, text: r.text, confidence: r.confidence }))

describe('extractReferences', () => {
  it('reads document numbers with and without versions, and marks unknown ones unresolved', () => {
    const { references } = extract(
      sourceDoc('SOP-SC-041-01'),
      sourceDoc('SOP-SC-031-02', {
        clauses: [clause('4.2', '设备检查：按 SOP-SC-041 执行。'), clause('4.8', '登记见 SOP-SC-041-01；工艺见 STP-GY-011。')],
      }),
    )

    expect(brief(references)).toEqual([
      { clause: '4.2', kind: 'code', target: { kind: 'document', identity: 'SOP-SC-041', version: null }, text: 'SOP-SC-041', confidence: 'high' },
      { clause: '4.8', kind: 'code', target: { kind: 'document', identity: 'SOP-SC-041', version: '01' }, text: 'SOP-SC-041-01', confidence: 'high' },
      { clause: '4.8', kind: 'code', target: { kind: 'unresolved', code: 'STP-GY-011' }, text: 'STP-GY-011', confidence: 'high' },
    ])
  })

  it('reads 对应文件 from a record header', () => {
    const { references } = extract(sourceDoc('SOP-SB-021-02'), sourceDoc('SOR-SB-021-R01', { version: '02', correspondingDoc: 'SOP-SB-021-02' }))

    expect(references.map((r) => [r.from.location, r.target])).toEqual([['header', { kind: 'document', identity: 'SOP-SB-021', version: '02' }]])
  })

  it('skips its own number, supersession statements and the history chapter', () => {
    const { references } = extract(
      sourceDoc('SOP-SC-028-02'),
      sourceDoc('SOP-SC-035-00', {
        clauses: [
          clause('1', '目的', para('规定配制方法，替代原 SOP-SC-028《配制岗位标准操作规程》。'), para('本规程 SOP-SC-035 由生产技术部起草。')),
          clause('7', '文件变更历史', { kind: 'table', rows: [['00', '新建，引用 SOP-SC-028-02']] }),
        ],
      }),
    )

    expect(references).toEqual([])
  })

  it('flags a version-less number that names two different documents as ambiguous', () => {
    const { references } = extract(
      sourceDoc('SMP-WJ-004-00', { name: '外来文件管理规程' }),
      sourceDoc('SMP-WJ-004-01', { name: '电子数据管理规程' }),
      sourceDoc('SMP-WJ-003-03', { clauses: [clause('4.5', '电子记录按 SMP-WJ-004 执行；外来文件按 SMP-WJ-004-00 执行。')] }),
    )

    expect(references.map((r) => [r.text, r.ambiguous])).toEqual([
      ['SMP-WJ-004', true],
      ['SMP-WJ-004-00', false],
    ])
  })

  it('does not count a revision draft with a new name as a second document', () => {
    const catalog = buildCatalog(
      library(
        [sourceDoc('SOP-SB-021-02', { name: '乳化均质机（RH-300）规程' }), sourceDoc('SOP-SC-031-02', { clauses: [clause('4.2', '按 SOP-SB-021 检查。')] })],
        undefined,
        [sourceDoc('SOP-SB-021-03', { name: '乳化均质机（RH-500）规程', source: 'scenario-inputs/draft.docx' })],
      ),
    )
    const { references } = extractReferences(catalog, findEquipment(catalog))

    expect(references.filter((r) => r.kind === 'code').map((r) => [r.text, r.ambiguous])).toEqual([['SOP-SB-021', false]])
  })

  it('links equipment models and numbers to the main SOP with low confidence, except in the main SOP itself', () => {
    const { references } = extract(
      sourceDoc('SOP-SB-021-02', {
        name: '乳化均质机（RH-300）使用、维护保养标准操作规程',
        clauses: [clause('2', '适用范围', para('适用于 RH-300 型真空乳化均质机（设备编号 SB-RH-01）。'))],
      }),
      sourceDoc('VP-QJ-003-01', { clauses: [clause('2', '适用范围', para('适用于 RH-300 型乳化均质机（SB-RH-01）。'))] }),
      sourceDoc('SOR-SC-010-R01', { version: '03', clauses: [clause(null, '', { kind: 'table', rows: [['设备', 'SB-RH-01']] })] }),
    )

    expect(brief(references)).toEqual([
      { clause: '2', kind: 'equipment', target: { kind: 'equipment', model: 'RH-300' }, text: 'RH-300', confidence: 'low' },
      { clause: null, kind: 'equipment', target: { kind: 'equipment', model: 'RH-300' }, text: 'SB-RH-01', confidence: 'low' },
    ])
  })

  it('reads 通则 numbers, listed or repeated, with the nearest edition or the document-wide one', () => {
    const { references, citedEditions } = extract(
      sourceDoc('STP-BZ-510-02', {
        clauses: [
          clause('4.2', '制定依据：《中国药典》2020 年版四部制剂通则 0109。'),
          clause('4.3', '检验', { kind: 'table', rows: [['微生物限度', '通则 1105、1106'], ['含量', 'HPLC，通则 0512'], ['有关物质', 'HPLC，通则 0512']] }),
        ],
      }),
      sourceDoc('SOR-QC-011-R01', { version: '02', clauses: [clause(null, '', para('一、微生物计数（按 2020 年版通则 1105）'), para('现行版通则 0512'))] }),
    )

    expect(references.map((r) => [r.from.clause, r.target])).toEqual([
      ['4.2', { kind: 'external', edition: '2020', chapter: '0109' }],
      ['4.3', { kind: 'external', edition: '2020', chapter: '1105' }],
      ['4.3', { kind: 'external', edition: '2020', chapter: '1106' }],
      ['4.3', { kind: 'external', edition: '2020', chapter: '0512' }],
      [null, { kind: 'external', edition: '2020', chapter: '1105' }],
      [null, { kind: 'external', edition: 'current', chapter: '0512' }],
    ])
    expect(citedEditions.get('samples/SOR-QC-011-R01.docx')).toEqual(['2020', 'current'])
  })

  it('records references without a number as implicit, low confidence', () => {
    const { references } = extract(
      sourceDoc('SOP-SC-031-02', {
        clauses: [clause('4.7', '清场：按相关清洁规程执行设备清洁。'), clause('5', '相关文件', para('各品种工艺规程'), para('环境按药典相关指导原则执行'))],
      }),
    )

    expect(brief(references)).toEqual([
      { clause: '4.7', kind: 'implicit', target: { kind: 'implicit' }, text: '相关清洁规程', confidence: 'low' },
      { clause: '5', kind: 'implicit', target: { kind: 'implicit' }, text: '各品种工艺规程', confidence: 'low' },
    ])
  })
})
