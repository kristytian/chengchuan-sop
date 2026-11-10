import { describe, expect, it } from 'vitest'
import type { LedgerRow, SourceDocument } from '../data/schema.ts'
import { buildCatalog } from './catalog.ts'
import { findEquipment } from './equipment.ts'
import { detectIssues, reasonsOf } from './issues.ts'
import { extractReferences } from './references.ts'
import { SETTINGS } from './settings.ts'
import { TERMS } from './source-terms.ts'
import { clause, ledgerRow, library, para, sourceDoc } from './test-fixtures.ts'

function detectAll(docs: SourceDocument[], ledger?: LedgerRow[]) {
  const catalog = buildCatalog(library(docs, ledger))
  const { references, citedEditions } = extractReferences(catalog, findEquipment(catalog))
  return detectIssues({ catalog, references, citedEditions, settings: SETTINGS })
}
/** The fixtures for the other kinds hold partial products on purpose; 配套缺失 has its own tests below. */
function detect(docs: SourceDocument[], ledger?: LedgerRow[]) {
  const result = detectAll(docs, ledger)
  return { ...result, issues: result.issues.filter((i) => i.kind !== 'missingCompanion') }
}
const rules = (result: ReturnType<typeof detect>) => result.issues.map((i) => `${i.kind}/${i.rule}`)

describe('detectIssues', () => {
  it('reports nothing for a clean library', () => {
    const result = detectAll([sourceDoc('SOP-SB-021-02'), sourceDoc('SOP-SC-031-02', { clauses: [clause('4.2', '按 SOP-SB-021 检查。')] })])

    expect(result).toEqual({ issues: [], reminders: [] })
  })

  it('编号冲突: one number naming two documents, with the version-less citations it makes ambiguous', () => {
    const { issues } = detect([
      sourceDoc('SMP-WJ-004-00', { name: '外来文件管理规程' }),
      sourceDoc('SMP-WJ-004-01', { name: '电子数据管理规程' }),
      sourceDoc('SMP-WJ-003-03', { clauses: [clause('4.5', '按 SMP-WJ-004 执行。')] }),
    ])

    expect(issues).toEqual([
      expect.objectContaining({
        kind: 'numberConflict',
        rule: 'sameNumberDifferentNames',
        params: {
          identity: 'SMP-WJ-004',
          codes: ['SMP-WJ-004-00', 'SMP-WJ-004-01'],
          names: ['外来文件管理规程', '电子数据管理规程'],
          ambiguousCitations: ['samples/SMP-WJ-003-03.docx'],
        },
      }),
    ])
  })

  it('编号冲突: two files with the same number; the 对应文件 mismatch is folded into that entry', () => {
    const result = detect(
      [
        sourceDoc('SOR-QC-511-R01', { name: '克霉唑乳膏检验记录', version: '03', correspondingDoc: 'SOP-QC-511-03', source: 'samples/a.docx' }),
        sourceDoc('SOR-QC-511-R01', { name: '酮康唑乳膏检验记录', version: '02', correspondingDoc: 'SOP-QC-512-02', source: 'samples/b.docx' }),
        sourceDoc('SOP-QC-511-03'),
        sourceDoc('SOP-QC-512-02'),
      ],
      [
        ledgerRow('SOR-QC-511-R01', '03', { name: '克霉唑乳膏检验记录' }),
        ledgerRow('SOR-QC-512-R01', '02', { name: '酮康唑乳膏检验记录' }),
        ledgerRow('SOP-QC-511', '03', { name: 'name of SOP-QC-511-03' }),
        ledgerRow('SOP-QC-512', '02', { name: 'name of SOP-QC-512-02' }),
      ],
    )

    expect(rules(result)).toEqual(['numberConflict/duplicateCode', 'ledgerMismatch/registeredDifferently'])
    expect(result.issues[0].params.correspondingDocs).toEqual(['SOP-QC-511-03', 'SOP-QC-512-02'])
    expect(result.issues[1].params).toMatchObject({ code: 'SOR-QC-511-R01', ledgerCode: 'SOR-QC-512-R01' })
  })

  it('编号冲突: a record whose number and 对应文件 disagree', () => {
    const result = detect([sourceDoc('SOP-QC-512-02'), sourceDoc('SOR-QC-511-R01', { version: '02', correspondingDoc: 'SOP-QC-512-02' })])

    expect(rules(result)).toEqual(['numberConflict/recordParentMismatch'])
  })

  it('多版本并存: two versions of one document in the library, with their ledger status', () => {
    const result = detect(
      [sourceDoc('SOP-SC-031-01', { name: '乳化岗位标准操作规程' }), sourceDoc('SOP-SC-031-02', { name: '乳化岗位标准操作规程' })],
      [
        ledgerRow('SOP-SC-031', '01', { name: '乳化岗位标准操作规程', status: TERMS.statusObsolete }),
        ledgerRow('SOP-SC-031', '02', { name: '乳化岗位标准操作规程' }),
      ],
    )

    expect(result.issues).toEqual([
      expect.objectContaining({ kind: 'multipleVersions', params: { identity: 'SOP-SC-031', versions: ['01', '02'], statuses: ['obsolete', 'current'] } }),
    ])
  })

  it('引用旧版药典: an older edition is cited; 现行版 is not', () => {
    const result = detect([
      sourceDoc('STP-BZ-510-02', { clauses: [clause('5', '相关文件', para('《中国药典》2020 年版'))] }),
      sourceDoc('SOP-QC-021-02', { clauses: [clause('4.1', '依据：《中国药典》现行版四部通则 0512。')] }),
    ])

    expect(result.issues).toEqual([
      expect.objectContaining({ kind: 'oldPharmacopoeia', versions: ['samples/STP-BZ-510-02.docx'], params: { editions: ['2020'], current: '2025' } }),
    ])
  })

  it('引用已作废文件: a document with no current version, once per citing file, with the replacement from the ledger', () => {
    const result = detect(
      [sourceDoc('SOP-SC-031-02', { clauses: [clause('4.1', '配料按 SOP-SC-028 执行。'), clause('5', '相关文件', para('SOP-SC-028 配制岗位标准操作规程'))] })],
      [
        ledgerRow('SOP-SC-031', '02', { name: 'name of SOP-SC-031-02' }),
        ledgerRow('SOP-SC-028', '02', { status: TERMS.statusObsolete, remark: '2025-09-01 作废，由 SOP-SC-035 替代' }),
      ],
    )

    expect(result.issues).toEqual([
      expect.objectContaining({
        kind: 'obsoleteReference',
        rule: 'obsoleteDocument',
        params: { cited: 'SOP-SC-028', replacement: 'SOP-SC-035', clauses: ['4.1', '5'] },
      }),
    ])
  })

  it('引用已作废文件: a citation of an older version, but not from an obsolete document', () => {
    const result = detect(
      [
        sourceDoc('SOP-QC-011-03'),
        sourceDoc('SOR-QC-011-R01', { version: '02', correspondingDoc: 'SOP-QC-011-02' }),
        sourceDoc('SOP-SC-031-01', { clauses: [clause('4.1', '按 SOP-QC-011-02 执行。')] }),
      ],
      [
        ledgerRow('SOP-QC-011', '03', { name: 'name of SOP-QC-011-03' }),
        ledgerRow('SOR-QC-011-R01', '02', { name: 'name of SOR-QC-011-R01' }),
        ledgerRow('SOP-SC-031', '01', { name: 'name of SOP-SC-031-01', status: TERMS.statusObsolete }),
      ],
    )

    expect(result.issues).toEqual([
      expect.objectContaining({ rule: 'outdatedVersion', versions: ['samples/SOR-QC-011-R01.docx'], params: { cited: 'SOP-QC-011-02', current: '03', clauses: [''] } }),
    ])
  })

  it('超期未回顾 from the ledger date, a computed date when it has none, and a reminder when due soon', () => {
    const result = detect(
      [
        sourceDoc('SMP-SB-002-02', { name: 'a' }),
        sourceDoc('SOP-QC-021-02', { name: 'b', effectiveDate: '2023-01-05' }),
        sourceDoc('SOP-SC-041-01', { name: 'c' }),
        sourceDoc('SOR-SC-041-R01', { name: 'd', version: '01', correspondingDoc: 'SOP-SC-041-01' }),
      ],
      [
        ledgerRow('SMP-SB-002', '02', { name: 'a', nextReview: '2025-08-01' }),
        ledgerRow('SOP-QC-021', '02', { name: 'b', effectiveDate: '2023-01-05', nextReview: '—' }),
        ledgerRow('SOP-SC-041', '01', { name: 'c', nextReview: '2026-11-01' }),
        ledgerRow('SOR-SC-041-R01', '01', { name: 'd', nextReview: TERMS.reviewFollowsParent }),
      ],
    )

    expect(result.issues.map((i) => [i.rule, i.params.due])).toEqual([
      ['ledgerDate', '2025-08-01'],
      ['computedDate', '2026-01-05'],
    ])
    expect(result.reminders).toEqual([{ kind: 'dueSoon', version: 'samples/SOP-SC-041-01.docx', date: '2026-11-01' }])
  })

  it('台账与文件不一致: the ledger lags a version, or lacks the file', () => {
    const result = detect(
      [sourceDoc('STP-BZ-511-03', { name: '克霉唑乳膏质量标准', effectiveDate: '2025-10-01' }), sourceDoc('VP-QJ-003-01')],
      [ledgerRow('STP-BZ-511', '02', { name: '克霉唑乳膏质量标准', effectiveDate: '2024-03-01' })],
    )

    expect(result.issues.map((i) => [i.rule, i.params.version, i.params.ledgerVersion])).toEqual([
      ['registeredDifferently', '03', '02'],
      ['notInLedger', '01', undefined],
    ])
  })

  describe('配套缺失', () => {
    const product = (n: string, opts: { skip?: string[] } = {}) =>
      [
        sourceDoc(`STP-BZ-5${n}-03`, { name: `p${n}质量标准` }),
        sourceDoc(`STP-GY-0${n}-02`, { name: `p${n}工艺规程` }),
        sourceDoc(`SOR-SC-0${n}-R01`, { name: `p${n}批生产记录`, version: '02', correspondingDoc: `STP-GY-0${n}-02`, clauses: [clause(null, '', para(`对应 STP-GY-0${n}-02`))] }),
      ].filter((d) => !opts.skip?.some((code) => d.header.code.startsWith(code)))

    it('a product without its 工艺规程, merged with the batch record citing it (引用找不到)', () => {
      const { issues } = detectAll(product('11', { skip: ['STP-GY'] }))

      expect(issues).toEqual([
        expect.objectContaining({
          kind: 'missingCompanion',
          rule: 'productDocuments',
          versions: ['samples/STP-BZ-511-03.docx', 'samples/SOR-SC-011-R01.docx'],
          params: {
            product: '11',
            productName: 'p11',
            foundKinds: ['standard', 'batchRecord'],
            foundCodes: ['STP-BZ-511-03', 'SOR-SC-011-R01'],
            missingKinds: ['process'],
            missingCodes: ['STP-GY-011'],
            citingFiles: ['samples/SOR-SC-011-R01.docx'],
            citedCodes: ['STP-GY-011'],
          },
        }),
      ])
      expect(reasonsOf(issues[0])).toEqual(['missingCompanion', 'unresolvedReference'])
    })

    it('a product with all three is not reported; a cleaning record (SOR-SC-041) is not a product', () => {
      const result = detectAll([
        ...product('10'),
        sourceDoc('SOP-SC-041-01', { name: 'cleaning' }),
        sourceDoc('SOR-SC-041-R01', { version: '01', correspondingDoc: 'SOP-SC-041-01' }),
      ])

      expect(result.issues).toEqual([])
    })

    it('a product known only from its inspection SOP, nothing cited: one reason', () => {
      const { issues } = detectAll([sourceDoc('SOP-QC-512-02', { name: 'p12检验标准操作规程' }), sourceDoc('SOR-QC-512-R01', { version: '02', correspondingDoc: 'SOP-QC-512-02' })])

      expect(issues.map((i) => [i.rule, i.params.productName, i.params.missingCodes])).toEqual([
        ['productDocuments', 'p12', ['STP-BZ-512', 'STP-GY-012', 'SOR-SC-012-R01']],
      ])
      expect(reasonsOf(issues[0])).toEqual(['missingCompanion'])
    })

    it('检验记录 is matched by the ledger number and 对应文件, not by the number on its header', () => {
      const docs = [
        sourceDoc('SOP-QC-511-03', { name: 'p11检验标准操作规程' }),
        sourceDoc('SOP-QC-512-02', { name: 'p12检验标准操作规程' }),
        sourceDoc('SOR-QC-511-R01', { name: 'p11检验记录', version: '03', correspondingDoc: 'SOP-QC-511-03', source: 'samples/a.docx' }),
        sourceDoc('SOR-QC-511-R01', { name: 'p12检验记录', version: '02', correspondingDoc: 'SOP-QC-512-02', source: 'samples/b.docx' }),
      ]
      const ledger = [
        ledgerRow('SOP-QC-511', '03', { name: 'p11检验标准操作规程' }),
        ledgerRow('SOP-QC-512', '02', { name: 'p12检验标准操作规程' }),
        ledgerRow('SOR-QC-511-R01', '03', { name: 'p11检验记录' }),
        ledgerRow('SOR-QC-512-R01', '02', { name: 'p12检验记录' }),
      ]
      const records = (result: ReturnType<typeof detectAll>) => result.issues.filter((i) => i.rule === 'inspectionRecord')

      expect(records(detectAll(docs, ledger))).toEqual([])
      // Without the ledger row, the header alone leaves SOP-QC-512 without a record.
      expect(records(detectAll(docs, ledger.slice(0, 3))).map((i) => i.params.missingCodes)).toEqual([['SOR-QC-512-R01']])
    })

    it('检验方法 SOPs need a record; instrument SOPs do not; obsolete ones are not checked', () => {
      const { issues } = detectAll(
        [
          sourceDoc('SOP-QC-011-03', { name: '微生物限度检查标准操作规程' }),
          sourceDoc('SOP-QC-021-02', { name: '高效液相色谱仪标准操作规程' }),
          sourceDoc('SOP-QC-013-01', { name: '含量测定检验标准操作规程' }),
        ],
        [
          ledgerRow('SOP-QC-011', '03', { name: '微生物限度检查标准操作规程' }),
          ledgerRow('SOP-QC-021', '02', { name: '高效液相色谱仪标准操作规程' }),
          ledgerRow('SOP-QC-013', '01', { name: '含量测定检验标准操作规程', status: TERMS.statusObsolete }),
        ],
      )

      expect(issues).toEqual([
        expect.objectContaining({
          rule: 'inspectionRecord',
          versions: ['samples/SOP-QC-011-03.docx'],
          params: { sop: 'SOP-QC-011-03', sopName: '微生物限度检查标准操作规程', missingCodes: ['SOR-QC-011-R01'], citingFiles: [], citedCodes: [] },
        }),
      ])
    })
  })
})
