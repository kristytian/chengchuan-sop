// Reads every sheet of an .xlsx as rows of raw cell values.
import { child, children, readPart, readZip, textContent, type XmlElement, type ZipEntries } from './ooxml.ts'

export type CellValue = string | number | null

export interface XlsxRow {
  /** 1-based spreadsheet row number. */
  row: number
  /** Indexed by column (A = 0); missing cells are null. */
  cells: CellValue[]
}

export interface XlsxSheet {
  name: string
  rows: XlsxRow[]
}

export function readXlsx(bytes: Uint8Array): XlsxSheet[] {
  const entries = readZip(bytes)
  const sharedStrings = readSharedStrings(entries)
  const targets = relationshipTargets(entries)

  return children(child(readPart(entries, 'xl/workbook.xml'), 'sheets') ?? emptyElement, 'sheet').map((sheet) => {
    const target = targets.get(sheet.attrs['r:id'])
    if (!target) throw new Error(`sheet "${sheet.attrs.name}" has no relationship target`)
    const sheetData = child(readPart(entries, target), 'sheetData')
    return { name: sheet.attrs.name, rows: children(sheetData ?? emptyElement, 'row').map((r) => readRow(r, sharedStrings)) }
  })
}

const emptyElement: XmlElement = { tag: '', attrs: {}, children: [] }

function readRow(row: XmlElement, sharedStrings: string[]): XlsxRow {
  const cells: CellValue[] = []
  for (const cell of children(row, 'c')) {
    const index = columnIndex(cell.attrs.r)
    while (cells.length < index) cells.push(null)
    cells[index] = cellValue(cell, sharedStrings)
  }
  return { row: Number(row.attrs.r), cells }
}

function cellValue(cell: XmlElement, sharedStrings: string[]): CellValue {
  const v = child(cell, 'v')
  switch (cell.attrs.t) {
    case 'inlineStr':
      return textOf(child(cell, 'is'))
    case 's':
      return v ? (sharedStrings[Number(textContent(v))] ?? null) : null
    case 'str':
    case 'b':
    case 'e':
      return v ? textContent(v) : null
    default:
      return v ? Number(textContent(v)) : null
  }
}

// Rich text keeps runs in <r><t>; plain text is a single <t>. Phonetic hints (<rPh>) are skipped.
function textOf(el: XmlElement | undefined): string | null {
  if (!el) return null
  const runs = [...children(el, 't'), ...children(el, 'r').flatMap((r) => children(r, 't'))]
  return runs.map(textContent).join('')
}

function readSharedStrings(entries: ZipEntries): string[] {
  if (!entries['xl/sharedStrings.xml']) return []
  return children(readPart(entries, 'xl/sharedStrings.xml'), 'si').map((si) => textOf(si) ?? '')
}

function relationshipTargets(entries: ZipEntries): Map<string, string> {
  const rels = children(readPart(entries, 'xl/_rels/workbook.xml.rels'), 'Relationship')
  return new Map(rels.map((r) => [r.attrs.Id, r.attrs.Target.startsWith('/') ? r.attrs.Target.slice(1) : `xl/${r.attrs.Target}`]))
}

/** "A1" → 0, "M7" → 12, "AA3" → 26. */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0]
  if (!letters) throw new Error(`bad cell reference "${ref}"`)
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
}
