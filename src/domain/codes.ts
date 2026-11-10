import type { DocCategory } from '../data/schema.ts'

/** A document number split by the numbering rules (SMP-WJ-002). */
export interface ParsedCode {
  /** Identity across versions: the number without its version; record templates keep the whole number. */
  identity: string
  category: DocCategory
  /** 类别代码, e.g. WJ, SB. */
  area: string
  /** 序号; for record templates, the parent document's 序号. */
  seq: string
  /** Version printed in the number (record templates print theirs in the header instead). */
  version: string | null
}

const CONTROLLED = /^(SMP|SOP|STP|VP|PX)-([A-Z]{2})-(\d{3})(?:-(\d{2}))?$/
const RECORD = /^SOR-([A-Z]{2})-(\d{3})-R\d{2}$/

/** Numbers inside running text; controlled-copy numbers (SOP-SC-031-02-03) don't match. */
const CODE_IN_TEXT = /(?<![A-Z0-9-])(?:SOR-[A-Z]{2}-\d{3}-R\d{2}|(?:SMP|SOP|STP|VP|PX)-[A-Z]{2}-\d{3}(?:-\d{2})?)(?![\w-])/g

export function parseCode(code: string): ParsedCode | null {
  const controlled = CONTROLLED.exec(code)
  if (controlled) {
    const [, category, area, seq, version] = controlled
    return { identity: `${category}-${area}-${seq}`, category: category as DocCategory, area, seq, version: version ?? null }
  }
  const record = RECORD.exec(code)
  if (record) return { identity: code, category: 'SOR', area: record[1], seq: record[2], version: null }
  return null
}

/** Identity of a printed number; unparseable numbers are their own identity. */
export function identityOf(code: string): string {
  return parseCode(code)?.identity ?? code
}

export function findCodes(text: string): { code: string; index: number }[] {
  return [...text.matchAll(CODE_IN_TEXT)].map((m) => ({ code: m[0], index: m.index }))
}

/** Two-digit versions compare numerically: "03" > "02". */
export function compareVersions(a: string, b: string): number {
  return Number(a) - Number(b)
}
