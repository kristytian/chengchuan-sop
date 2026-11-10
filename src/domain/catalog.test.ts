import { describe, expect, it } from 'vitest'
import { buildCatalog, currentVersion } from './catalog.ts'
import { findCodes, parseCode } from './codes.ts'
import { TERMS } from './source-terms.ts'
import { ledgerRow, library, sourceDoc } from './test-fixtures.ts'

describe('parseCode / findCodes', () => {
  it('splits controlled numbers and record numbers', () => {
    expect(parseCode('SOP-SB-021-02')).toEqual({ identity: 'SOP-SB-021', category: 'SOP', area: 'SB', seq: '021', version: '02' })
    expect(parseCode('SOP-SB-021')).toMatchObject({ identity: 'SOP-SB-021', version: null })
    expect(parseCode('SOR-QC-511-R01')).toEqual({ identity: 'SOR-QC-511-R01', category: 'SOR', area: 'QC', seq: '511', version: null })
    expect(parseCode('RH-300')).toBeNull()
  })

  it('finds numbers in text but not controlled-copy numbers', () => {
    expect(findCodes('清洁按 SOP-SC-041 执行，记录 SOR-SB-021-R01《日志》，副本 SOP-SC-031-02-03').map((c) => c.code)).toEqual([
      'SOP-SC-041',
      'SOR-SB-021-R01',
    ])
  })
})

describe('buildCatalog', () => {
  it('matches files to ledger rows by number and version, taking the status from the ledger', () => {
    const old = sourceDoc('SMP-WJ-001-03', { name: '文件管理规程' })
    const cur = sourceDoc('SMP-WJ-001-04', { name: '文件管理规程' })
    const catalog = buildCatalog(
      library(
        [old, cur],
        [
          ledgerRow('SMP-WJ-001', '03', { name: '文件管理规程', status: TERMS.statusObsolete }),
          ledgerRow('SMP-WJ-001', '04', { name: '文件管理规程' }),
        ],
      ),
    )

    const versions = catalog.byIdentity.get('SMP-WJ-001')!
    expect(versions.map((v) => [v.version, v.status, v.ledger?.match])).toEqual([
      ['03', 'obsolete', 'exact'],
      ['04', 'current', 'exact'],
    ])
    expect(currentVersion(versions)?.version).toBe('04')
  })

  it('falls back to the name, and adopts the ledger identity when the ledger registers the file under another number', () => {
    const misnumbered = sourceDoc('SOR-QC-511-R01', { name: '酮康唑乳膏检验记录', version: '02' })
    const catalog = buildCatalog(library([misnumbered], [ledgerRow('SOR-QC-512-R01', '02', { name: '酮康唑乳膏检验记录' })]))

    const [v] = catalog.versions
    expect(v).toMatchObject({ identity: 'SOR-QC-512-R01', printedCode: 'SOR-QC-511-R01', status: 'current' })
    expect(v.ledger).toMatchObject({ match: 'byName', code: 'SOR-QC-512-R01' })
  })

  it('keeps ledger-only versions, marks drafts and unregistered files', () => {
    const catalog = buildCatalog(
      library(
        [sourceDoc('SOP-QC-021-02')],
        [ledgerRow('SOP-SC-028', '02', { status: TERMS.statusObsolete, remark: '由 SOP-SC-035 替代' })],
        [sourceDoc('SOP-SB-021-03', { source: 'scenario-inputs/draft.docx' })],
      ),
    )

    expect(catalog.versions.map((v) => [v.key, v.origin, v.status])).toEqual([
      ['samples/SOP-QC-021-02.docx', 'library', 'unregistered'],
      ['scenario-inputs/draft.docx', 'draft', 'draft'],
      ['ledger:SOP-SC-028@02', 'ledgerOnly', 'obsolete'],
    ])
  })

  it('reads review dates and their textual forms from the ledger', () => {
    const catalog = buildCatalog(
      library(
        [sourceDoc('SOP-QC-021-02'), sourceDoc('SOR-QC-011-R01', { version: '02' }), sourceDoc('PX-SC-031-02')],
        [
          ledgerRow('SOP-QC-021', '02', { nextReview: '2026-01-05' }),
          ledgerRow('SOR-QC-011-R01', '02', { nextReview: TERMS.reviewFollowsParent }),
          ledgerRow('PX-SC-031', '02', { nextReview: TERMS.reviewNotApplicable }),
        ],
      ),
    )

    expect(catalog.versions.map((v) => v.nextReview)).toEqual([
      { kind: 'date', date: '2026-01-05' },
      { kind: 'followsParent' },
      { kind: 'notApplicable' },
    ])
  })
})
