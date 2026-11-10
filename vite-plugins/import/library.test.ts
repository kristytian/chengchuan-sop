// Smoke test over the real samples/ and scenario-inputs/: every file must
// import. Structural checks only — expected scenario results belong to the
// evaluation scripts, not here.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSampleLibrary } from './library.ts'

const { library } = loadSampleLibrary(join(import.meta.dirname, '..', '..'))

describe('sample library', () => {
  it('imports every document with a known category, code, version and clauses', () => {
    for (const doc of [...library.documents, ...library.scenarioInputs]) {
      expect(doc.header.category, doc.source).not.toBeNull()
      expect(doc.header.code, doc.source).not.toBe('')
      expect(doc.header.version, doc.source).toMatch(/^\d{2}$/)
      expect(doc.clauses.length, doc.source).toBeGreaterThan(0)
    }
  })

  it('reads ledger rows with a code, version and status', () => {
    expect(library.ledger.length).toBeGreaterThan(0)
    for (const row of library.ledger) {
      expect(row.code, `${row.sheet}!${row.row}`).not.toBe('')
      expect(row.version, `${row.sheet}!${row.row}`).toMatch(/^\d{2}$/)
      expect(row.status, `${row.sheet}!${row.row}`).not.toBe('')
    }
  })
})
