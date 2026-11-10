import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog.ts'
import { buildDocumentSets } from './groups.ts'
import { library, sourceDoc } from './test-fixtures.ts'

const setsOf = (...docs: Parameters<typeof library>[0]) => buildDocumentSets(buildCatalog(library(docs)))

describe('buildDocumentSets', () => {
  it('puts a record template in the group of the document its 对应文件 names (rule A)', () => {
    const { sets, setOf } = setsOf(
      sourceDoc('SOP-SB-021-02'),
      sourceDoc('SOR-SB-021-R01', { version: '02', correspondingDoc: 'SOP-SB-021-02' }),
      sourceDoc('SMP-SB-002-02'),
    )

    expect(sets).toEqual([
      { id: 'SMP-SB-002', kind: 'single', main: 'SMP-SB-002', members: ['SMP-SB-002'] },
      { id: 'SOP-SB-021', kind: 'withRecords', main: 'SOP-SB-021', members: ['SOP-SB-021', 'SOR-SB-021-R01'] },
    ])
    expect(setOf.get('SOR-SB-021-R01')).toBe('SOP-SB-021')
  })

  it('groups a quality standard with the inspection SOP of the same number and their records (rule B)', () => {
    const { sets } = setsOf(
      sourceDoc('STP-BZ-511-03'),
      sourceDoc('SOP-QC-511-03'),
      sourceDoc('SOR-QC-511-R01', { version: '03', correspondingDoc: 'SOP-QC-511-03' }),
    )

    expect(sets).toEqual([
      { id: 'STP-BZ-511', kind: 'product', main: 'STP-BZ-511', members: ['STP-BZ-511', 'SOP-QC-511', 'SOR-QC-511-R01'] },
    ])
  })

  it('follows 对应文件 even when the numbers disagree, and leaves a record alone when its parent is missing', () => {
    const { setOf } = setsOf(
      sourceDoc('SOP-QC-512-02'),
      sourceDoc('SOR-QC-511-R01', { version: '02', correspondingDoc: 'SOP-QC-512-02' }),
      sourceDoc('SOR-SC-011-R01', { version: '02', correspondingDoc: 'STP-GY-011-02' }),
    )

    expect(setOf.get('SOR-QC-511-R01')).toBe('SOP-QC-512')
    expect(setOf.get('SOR-SC-011-R01')).toBe('SOR-SC-011-R01')
  })

  it('ignores identities that exist only as scenario drafts', () => {
    const { sets } = buildDocumentSets(buildCatalog(library([], [], [sourceDoc('SOP-SB-099-00', { source: 'scenario-inputs/x.docx' })])))

    expect(sets).toEqual([])
  })
})
