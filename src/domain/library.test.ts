import { describe, expect, it } from 'vitest'
import type { SourceDocument } from '../data/schema.ts'
import { buildCatalog } from './catalog.ts'
import { findEquipment } from './equipment.ts'
import { buildDocumentSets } from './groups.ts'
import { incomingCitations, libraryCategoryOf, outgoingCitations, secondRing, supersessionOf } from './library.ts'
import { extractReferences } from './references.ts'
import { TERMS } from './source-terms.ts'
import { clause, ledgerRow, library, para, sourceDoc } from './test-fixtures.ts'

function setup(docs: SourceDocument[], ledger?: Parameters<typeof library>[1]) {
  const catalog = buildCatalog(library(docs, ledger))
  const { sets, setOf } = buildDocumentSets(catalog)
  const equipment = findEquipment(catalog)
  const { references } = extractReferences(catalog, equipment)
  return { catalog, setOf, sets, equipment, references }
}

const equipmentSop = sourceDoc('SOP-SB-021-02', {
  name: '乳化均质机（RH-300）规程',
  clauses: [
    clause('2', '适用范围', para('适用于 RH-300 型乳化均质机（设备编号 SB-RH-01）。')),
    clause('4.7', '每次使用后填写 SOR-SB-021-R01。'),
    clause('4.8', '清洁按 SOP-SC-028 执行，工艺见 STP-GY-011；其余按相关清洁规程。'),
  ],
})
const log = sourceDoc('SOR-SB-021-R01', { version: '02', correspondingDoc: 'SOP-SB-021-02', clauses: [clause(null, '', para('设备：RH-300 型'))] })
const operating = sourceDoc('SOP-SC-031-02', { clauses: [clause('4.2', '设备检查：按 SOP-SB-021 检查。'), clause('5', '相关文件', para('SOP-SB-021 规程'))] })
const oldOperating = sourceDoc('SOP-SC-031-01', { clauses: [clause('4.2', '按 SOP-SB-021 检查。')] })
const validation = sourceDoc('VP-QJ-003-01', { clauses: [clause('1', '目的', para('证明 RH-300 型清洁有效。')), clause('2', '适用范围', para('适用于 RH-300。'))] })
const training = sourceDoc('PX-SC-031-02', { clauses: [clause('1', '培训目的', para('掌握 SOP-SC-031-02 的要求。'))] })

const docs = [equipmentSop, log, operating, oldOperating, validation, training]
const ledger = [
  ledgerRow('SOP-SB-021', '02'),
  ledgerRow('SOR-SB-021-R01', '02'),
  ledgerRow('SOP-SC-031', '01', { status: TERMS.statusObsolete }),
  ledgerRow('SOP-SC-031', '02'),
  ledgerRow('VP-QJ-003', '01'),
  ledgerRow('PX-SC-031', '02'),
  ledgerRow('SOP-SC-028', '02', { status: TERMS.statusObsolete, remark: '2025-09-01 作废，由 SOP-SC-035 替代' }),
]

describe('libraryCategoryOf', () => {
  it('splits 工艺规程 from 质量标准 by the area code and keeps the other prefixes', () => {
    expect(['SMP-WJ-001', 'SOP-SB-021', 'STP-BZ-510', 'STP-GY-010', 'SOR-SC-010-R01', 'VP-QJ-003', 'PX-SC-031', 'XX-1'].map(libraryCategoryOf)).toEqual([
      'SMP',
      'SOP',
      'STP-BZ',
      'STP-GY',
      'SOR',
      'VP',
      'PX',
      null,
    ])
  })
})

describe('incomingCitations', () => {
  it('lists live citers by number with their places, marks set-mates and version-specific citations, hides obsolete citers', () => {
    const model = setup(docs, ledger)
    const incoming = incomingCitations(model, 'SOP-SB-021')

    expect(incoming.byNumber.map((g) => [g.identity, g.places.map((p) => p.clause ?? p.location), g.sameSet, g.citedVersion])).toEqual([
      ['SOP-SC-031', ['4.2', '5'], false, null],
      ['SOR-SB-021-R01', ['header'], true, '02'],
    ])
    expect(incoming.byNumber[0].places[0].text).toBe('设备检查：按 SOP-SB-021 检查。')
    expect(incoming.byNumber[1].places[0]).toMatchObject({ location: 'header', field: 'correspondingDoc', text: 'SOP-SB-021-02' })
    expect(incoming.byEquipment.map((g) => [g.identity, g.places.map((p) => p.clause ?? p.location)])).toEqual([
      ['SOR-SB-021-R01', ['body']],
      ['VP-QJ-003', ['1', '2']],
    ])
    expect(incoming.equipment).toEqual({ model: 'RH-300', deviceNo: 'SB-RH-01' })
    expect(incoming.hiddenObsolete.versions.map((v) => `${v.identity}@${v.version}`)).toEqual(['SOP-SC-031@01'])
    expect(incoming.hiddenObsolete.places).toBe(1)
  })

  it('has nothing for a document nobody cites', () => {
    const incoming = incomingCitations(setup(docs, ledger), 'PX-SC-031')
    expect([incoming.byNumber, incoming.byEquipment, incoming.equipment]).toEqual([[], [], null])
  })
})

describe('outgoingCitations', () => {
  it('groups cited numbers, says when the target is obsolete or not in the library, and keeps implicit references apart', () => {
    const model = setup(docs, ledger)
    const outgoing = outgoingCitations(model, model.catalog.byIdentity.get('SOP-SB-021')![0].key)

    expect(outgoing.byNumber.map((g) => [g.code, g.places.map((p) => p.clause), g.target, g.sameSet])).toEqual([
      ['SOP-SC-028', ['4.8'], { kind: 'obsolete', replacedBy: 'SOP-SC-035' }, false],
      ['STP-GY-011', ['4.8'], { kind: 'notFound' }, false],
      ['SOR-SB-021-R01', ['4.7'], { kind: 'current' }, true],
    ])
    expect(outgoing.implicit.map((p) => [p.clause, p.written])).toEqual([['4.8', '相关清洁规程']])
  })
})

describe('secondRing', () => {
  it('counts who cites each citer, leaving out the document itself', () => {
    const model = setup(docs, ledger)
    expect(secondRing(model, 'SOP-SB-021').map((r) => [r.version.identity, r.citers.map((c) => c.identity)])).toEqual([['SOP-SC-031', ['PX-SC-031']]])
  })
})

describe('supersessionOf', () => {
  it('names the replacing number from the ledger, or the newer version, and says whether the original is still there', () => {
    const { catalog } = setup(docs, ledger)
    const [ledgerOnly] = catalog.byIdentity.get('SOP-SC-028')!
    const [oldFile] = catalog.byIdentity.get('SOP-SC-031')!

    expect(supersessionOf(catalog, ledgerOnly)).toEqual({ replacedBy: 'SOP-SC-035', newerVersion: null, hasOriginal: false })
    expect(supersessionOf(catalog, oldFile)).toEqual({ replacedBy: null, newerVersion: '02', hasOriginal: true })
  })
})
