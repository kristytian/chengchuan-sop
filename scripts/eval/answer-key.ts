// Shared by the answer-key scripts (answers/ is for evaluation only — CLAUDE.md):
// CSV read/write, how a key names a file, and where a 原文片段 sits in a document.
// Nothing in src/, vite-plugins/ or scripts/ai-prerun/ may import this folder (check:boundaries).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { SourceDocument } from '../../src/data/schema.ts'
import type { DocumentVersion } from '../../src/domain/model.ts'
import { contentClauses } from '../../src/domain/texts.ts'

export type Row = Record<string, string>

/** 条款编号 for a record's header fields (对应文件, 依据) and for a body that has no numbers. */
export const HEADER_CLAUSE = '文头'
export const BODY_CLAUSE = '正文'

/** A file as the keys write it: the printed number; record templates add their version, since two files print SOR-QC-511-R01. */
export function fileLabel(v: DocumentVersion): string {
  const code = v.printedCode ?? (v.category === 'SOR' ? v.identity : `${v.identity}-${v.version}`)
  return v.category === 'SOR' ? `${code}（${v.version} 版）` : code
}

export function clauseLabel(location: 'header' | 'body', clause: string | null): string {
  return location === 'header' ? HEADER_CLAUSE : (clause ?? BODY_CLAUSE)
}

/** One readable unit of a document: a header field, a clause heading, a paragraph or a table row. */
export interface Piece {
  clause: string
  text: string
}

/** Every piece in reading order; the 文件变更历史 chapter is left out, as the rules leave it out. */
export function pieces(doc: SourceDocument): Piece[] {
  const out: Piece[] = []
  if (doc.header.correspondingDoc) out.push({ clause: HEADER_CLAUSE, text: `对应文件：${doc.header.correspondingDoc}` })
  if (doc.header.basis) out.push({ clause: HEADER_CLAUSE, text: `依据：${doc.header.basis}` })
  for (const c of contentClauses(doc)) {
    const clause = c.number ?? BODY_CLAUSE
    if (c.heading) out.push({ clause, text: c.heading })
    for (const block of c.body) {
      if (block.kind === 'paragraph') {
        if (block.text.trim()) out.push({ clause, text: block.text.trim() })
        continue
      }
      for (const row of block.rows) {
        const cells = row.map((cell) => cell.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
        if (cells.length > 0) out.push({ clause, text: cells.join(' | ') })
      }
    }
  }
  return out
}

const SNIPPET_MAX = 50

/** At most 50 characters of `text` around position `at`, with … where it was cut. */
export function snippet(text: string, at: number): string {
  const chars = Array.from(text)
  if (chars.length <= SNIPPET_MAX) return text
  const from = Array.from(text.slice(0, at)).length
  const start = Math.max(0, Math.min(from - 15, chars.length - (SNIPPET_MAX - 1)))
  const lead = start > 0 ? '…' : ''
  let end = start + SNIPPET_MAX - lead.length
  end = end < chars.length ? end - 1 : chars.length
  return `${lead}${chars.slice(start, end).join('')}${end < chars.length ? '…' : ''}`
}

/** Position of a row's 原文片段 in its file: index of the piece, then of the text in it. */
export function snippetPosition(all: readonly Piece[], clause: string, text: string): [number, number] {
  const core = text.replace(/^…|…$/g, '')
  for (const [i, p] of all.entries()) {
    const at = p.clause === clause ? p.text.indexOf(core) : -1
    if (at >= 0) return [i, at]
  }
  return [Number.MAX_SAFE_INTEGER, 0]
}

export function readCsv(path: string): { header: string[]; rows: Row[] } | null {
  if (!existsSync(path)) return null
  const records = parseCsv(readFileSync(path, 'utf8'))
  const [header = [], ...body] = records
  const rows = body.filter((r) => r.some((cell) => cell !== '')).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
  return { header, rows }
}

export function writeCsv(path: string, header: readonly string[], rows: readonly Row[]): void {
  const quote = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s)
  const lines = [header, ...rows.map((r) => header.map((h) => r[h] ?? ''))].map((cells) => cells.map(quote).join(','))
  writeFileSync(path, `${lines.join('\n')}\n`)
}

function parseCsv(text: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') field += text[++i]
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      record.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else field += ch
  }
  if (field !== '' || record.length > 0) records.push([...record, field])
  return records
}
