import { describe, expect, it } from 'vitest'
import type { SourceDocument } from '../data/schema.ts'
import { buildCatalog } from './catalog.ts'
import { buildChanges } from './changes.ts'
import { findEquipment } from './equipment.ts'
import { buildDocumentSets } from './groups.ts'
import { analyzeImpact } from './impact.ts'
import { extractReferences } from './references.ts'
import { TERMS } from './source-terms.ts'
import { clause, ledgerRow, library, para, sourceDoc } from './test-fixtures.ts'

function setup(docs: SourceDocument[], drafts: SourceDocument[] = [], externals?: Parameters<typeof buildChanges>[1]) {
  const catalog = buildCatalog(library(docs, undefined, drafts))
  const { sets, setOf } = buildDocumentSets(catalog)
  const { references } = extractReferences(catalog, findEquipment(catalog))
  const changes = buildChanges(catalog, externals ?? [])
  return { input: { catalog, sets, setOf, references }, changes }
}
const brief = (items: ReturnType<typeof analyzeImpact>) => items.map((i) => [i.identity, i.level, i.inSameSet, i.confidence, i.via])

const equipmentSop = sourceDoc('SOP-SB-021-02', {
  name: '乳化均质机（RH-300）规程',
  clauses: [clause('2', '适用范围', para('适用于 RH-300 型乳化均质机（设备编号 SB-RH-01）。'))],
})
const draft = sourceDoc('SOP-SB-021-03', { name: '乳化均质机（RH-500）规程', source: 'scenario-inputs/draft.docx' })

describe('buildChanges', () => {
  it('turns a scenario draft into a revision of the current version and reads the equipment swap from the names', () => {
    const { changes } = setup([equipmentSop], [draft], [{ chapter: '1105', edition: null }])

    expect(changes).toEqual([
      {
        id: 'revision:SOP-SB-021:02->03',
        controlNo: null,
        source: { kind: 'revision', identity: 'SOP-SB-021', oldVersion: 'samples/SOP-SB-021-02.docx', newVersion: 'scenario-inputs/draft.docx' },
        equipment: { from: 'RH-300', to: 'RH-500' },
      },
      { id: 'external:any:1105', controlNo: null, source: { kind: 'externalStandard', chapter: '1105', edition: null }, equipment: null },
    ])
  })
})

describe('analyzeImpact', () => {
  it('lists documents citing the source by number or by the replaced equipment, its set-mates, and indirect citers', () => {
    const { input, changes } = setup(
      [
        equipmentSop,
        sourceDoc('SOR-SB-021-R01', { version: '02', correspondingDoc: 'SOP-SB-021-02' }),
        sourceDoc('SOP-SC-031-02', { clauses: [clause('4.2', '按 SOP-SB-021 检查。')] }),
        sourceDoc('VP-QJ-003-01', { clauses: [clause('2', '适用范围', para('适用于 RH-300 型乳化均质机。'))] }),
        sourceDoc('PX-SC-031-02', { clauses: [clause('1', '培训目的', para('掌握 SOP-SC-031-02 的要求。'))] }),
        sourceDoc('SMP-SB-002-02', { clauses: [clause('4.3', '按各设备操作规程执行。')] }),
      ],
      [draft],
    )

    expect(brief(analyzeImpact(input, changes[0]))).toEqual([
      ['SOP-SC-031', 'direct', false, 'high', []],
      ['SOR-SB-021-R01', 'direct', true, 'high', []],
      ['VP-QJ-003', 'direct', false, 'low', []],
      ['PX-SC-031', 'indirect', false, 'high', ['SOP-SC-031']],
    ])
  })

  it('keeps hit references so each item points to the clauses that cite the source', () => {
    const { input, changes } = setup([equipmentSop, sourceDoc('SOP-SC-031-02', { clauses: [clause('4.2', '按 SOP-SB-021 检查。'), clause('5', '相关文件', para('SOP-SB-021 规程'))] })], [draft])
    const [item] = analyzeImpact(input, changes[0])
    const cited = item.hits.map((id) => input.references.find((r) => r.id === id)?.from.clause)

    expect(cited).toEqual(['4.2', '5'])
  })

  it('leaves out obsolete versions and rejected references', () => {
    const catalog = buildCatalog(
      library(
        [equipmentSop, sourceDoc('SOP-SC-031-01', { clauses: [clause('4.2', '按 SOP-SB-021 检查。')] }), sourceDoc('SOP-SC-041-01', { clauses: [clause('5', 'SOP-SB-021')] })],
        [ledgerRow('SOP-SB-021', '02', { name: equipmentSop.header.name }), ledgerRow('SOP-SC-031', '01', { status: TERMS.statusObsolete }), ledgerRow('SOP-SC-041', '01')],
        [draft],
      ),
    )
    const { sets, setOf } = buildDocumentSets(catalog)
    const references = extractReferences(catalog, findEquipment(catalog)).references.map((r) => ({ ...r, status: 'rejected' as const }))

    expect(analyzeImpact({ catalog, sets, setOf, references }, buildChanges(catalog, [])[0])).toEqual([])
  })

  it('for an external standard, lists citers of the chapter and their citers', () => {
    const { input, changes } = setup(
      [
        sourceDoc('SOP-QC-011-03', { clauses: [clause('4.3', '按通则 1105 制备供试液。')] }),
        sourceDoc('STP-BZ-511-03', { clauses: [clause('4.3', '检验', { kind: 'table', rows: [['微生物限度', '通则 1105、1106']] })] }),
        sourceDoc('SOP-QC-511-03', { clauses: [clause('4.6', '微生物限度照 SOP-QC-011 检查。')] }),
        sourceDoc('SOP-QC-021-02', { clauses: [clause('4.1', '通则 0512')] }),
      ],
      [],
      [{ chapter: '1105', edition: null }],
    )

    expect(brief(analyzeImpact(input, changes[0]))).toEqual([
      ['SOP-QC-011', 'direct', false, 'high', []],
      ['STP-BZ-511', 'direct', false, 'high', []],
      ['SOP-QC-511', 'indirect', false, 'high', ['SOP-QC-011']],
    ])
  })

  it('does not list a set-mate of an affected document that only cites inside its own set', () => {
    const { input, changes } = setup(
      [
        sourceDoc('SOP-QC-011-03', { clauses: [clause('4.3', '按通则 1105 制备供试液。')] }),
        sourceDoc('STP-BZ-511-03', { clauses: [clause('4.3', '微生物限度：通则 1105')] }),
        sourceDoc('SOP-QC-511-03', { clauses: [clause('4.1', '依据 STP-BZ-511。'), clause('4.6', '照 SOP-QC-011 检查。')] }),
        sourceDoc('SOR-QC-511-R01', { version: '03', correspondingDoc: 'SOP-QC-511-03', clauses: [clause(null, '', para('依据 STP-BZ-511'))] }),
      ],
      [],
      [{ chapter: '1105', edition: null }],
    )
    const items = analyzeImpact(input, changes[0])

    expect(items.map((i) => i.identity)).toEqual(['SOP-QC-011', 'STP-BZ-511', 'SOP-QC-511'])
    expect(items[2].via).toEqual(['SOP-QC-011'])
  })
})
