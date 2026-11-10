// Builders for small synthetic libraries in domain tests. ASCII only; tests
// pass their own Chinese text.
import type { Block, Clause, LedgerRow, SampleLibrary, SourceDocument } from '../data/schema.ts'
import { parseCode } from './codes.ts'
import { TERMS } from './source-terms.ts'

export const para = (text: string): Block => ({ kind: 'paragraph', text })

export const clause = (number: string | null, heading: string, ...body: Block[]): Clause => ({ number, heading, body })

export function sourceDoc(
  code: string,
  opts: { name?: string; version?: string; effectiveDate?: string; correspondingDoc?: string; clauses?: Clause[]; source?: string } = {},
): SourceDocument {
  const parsed = parseCode(code)
  return {
    source: opts.source ?? `samples/${code}.docx`,
    header: {
      code,
      name: opts.name ?? `name of ${code}`,
      category: parsed?.category ?? null,
      categoryLabel: null,
      version: opts.version ?? parsed?.version ?? '01',
      effectiveDate: opts.effectiveDate ?? '2025-01-01',
      department: 'dept',
      distribution: [],
      correspondingDoc: opts.correspondingDoc ?? null,
      basis: null,
    },
    pageHeader: [],
    headerTable: [],
    footer: [],
    clauses: opts.clauses ?? [],
  }
}

export function ledgerRow(code: string, version: string, opts: Partial<LedgerRow> = {}): LedgerRow {
  return {
    sheet: 'sheet',
    row: 2,
    code,
    name: `name of ${code}`,
    version,
    effectiveDate: '2025-01-01',
    department: 'dept',
    drafter: '',
    nextReview: '2028-01-01',
    copyNo: `${code}-${version}-01`,
    holder: 'dept',
    issuedDate: null,
    returnedDate: null,
    status: TERMS.statusCurrent,
    remark: '',
    ...opts,
  }
}

/** A library whose ledger registers every document as current, unless rows are given. */
export function library(documents: SourceDocument[], ledger?: LedgerRow[], scenarioInputs: SourceDocument[] = []): SampleLibrary {
  return {
    documents,
    scenarioInputs,
    ledger:
      ledger ??
      documents.map((d) => ledgerRow(parseCode(d.header.code)?.identity ?? d.header.code, d.header.version, { name: d.header.name })),
  }
}
