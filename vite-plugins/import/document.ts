// Maps a .docx's header table and body onto a SourceDocument. Two header
// layouts exist: controlled documents (文件编号 …) and record templates
// (记录编号 …, title line above the table).
import type { DocCategory, DocumentHeader, SourceDocument } from '../../src/data/schema.ts'
import { splitClauses } from '../../src/domain/clauses.ts'
import type { DocxContent } from './docx.ts'

const CATEGORIES: readonly DocCategory[] = ['SMP', 'SOP', 'STP', 'SOR', 'VP', 'PX']

export function toSourceDocument(source: string, { body, footer, pageHeader }: DocxContent): SourceDocument {
  const tableAt = body.findIndex((b) => b.kind === 'table')
  if (tableAt === -1) throw new Error('no header table')
  const headerTable = body[tableAt]
  if (headerTable.kind !== 'table') throw new Error('no header table')

  const fields = labelValuePairs(headerTable.rows)
  const before = body.slice(0, tableAt)
  const title = before[0]?.kind === 'paragraph' ? before[0].text : undefined
  const isRecord = fields.has('记录编号')
  const content = [...(isRecord ? before.slice(1) : before), ...body.slice(tableAt + 1)]

  return {
    source,
    header: isRecord ? recordHeader(fields, title) : controlledHeader(fields),
    pageHeader,
    headerTable: headerTable.rows,
    footer,
    clauses: splitClauses(content),
  }
}

function controlledHeader(fields: Map<string, string>): DocumentHeader {
  const code = required(fields, '文件编号')
  return {
    code,
    name: required(fields, '文件名称'),
    category: categoryOf(code),
    categoryLabel: fields.get('文件类别') ?? null,
    version: required(fields, '版本号'),
    effectiveDate: required(fields, '生效日期'),
    department: required(fields, '起草部门'),
    distribution: (fields.get('分发部门') ?? '')
      .split('、')
      .map((d) => d.trim())
      .filter(Boolean),
    correspondingDoc: null,
    basis: null,
  }
}

function recordHeader(fields: Map<string, string>, title: string | undefined): DocumentHeader {
  if (!title) throw new Error('record template has no title line above the header table')
  const code = required(fields, '记录编号')
  return {
    code,
    name: title,
    category: categoryOf(code),
    categoryLabel: null,
    version: required(fields, '版本'),
    effectiveDate: required(fields, '生效日期'),
    department: required(fields, '起草部门'),
    distribution: [],
    correspondingDoc: fields.get('对应文件') ?? null,
    basis: fields.get('依据') ?? null,
  }
}

/** Header rows alternate label, value, label, value…; labels lose their spacing ("版 本 号" → "版本号"). */
function labelValuePairs(rows: string[][]): Map<string, string> {
  const fields = new Map<string, string>()
  for (const cells of rows) {
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const label = cells[i].replace(/[\s\u3000]/g, '')
      if (label) fields.set(label, cells[i + 1].trim())
    }
  }
  return fields
}

function required(fields: Map<string, string>, label: string): string {
  const value = fields.get(label)
  if (!value) throw new Error(`header table has no ${label}`)
  return value
}

function categoryOf(code: string): DocCategory | null {
  const prefix = code.split('-')[0]
  return CATEGORIES.find((c) => c === prefix) ?? null
}
