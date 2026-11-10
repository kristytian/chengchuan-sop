// Reads the body (paragraphs and tables, in order), page-header and footer lines of a .docx.
import type { Block } from '../../src/data/schema.ts'
import { child, children, descendants, isElement, readPart, readZip, type XmlElement } from './ooxml.ts'

export interface DocxContent {
  body: Block[]
  /** Non-empty lines of the page header parts (页眉), each once. */
  pageHeader: string[]
  footer: string[]
}

export function readDocx(bytes: Uint8Array): DocxContent {
  const entries = readZip(bytes)
  const body = child(readPart(entries, 'word/document.xml'), 'w:body')
  if (!body) throw new Error('word/document.xml has no w:body')

  return { body: readBlocks(body), pageHeader: partLines(entries, 'header'), footer: partLines(entries, 'footer') }
}

/** Non-empty paragraph lines across word/header*.xml or word/footer*.xml, each once. */
function partLines(entries: ReturnType<typeof readZip>, part: 'header' | 'footer'): string[] {
  const lines = Object.keys(entries)
    .filter((name) => new RegExp(`^word/${part}\\d*\\.xml$`).test(name))
    .sort()
    .flatMap((name) => descendants(readPart(entries, name), 'w:p').map(paragraphText))
    .filter((line) => line !== '')
  return [...new Set(lines)]
}

function readBlocks(container: XmlElement): Block[] {
  const blocks: Block[] = []
  for (const node of container.children) {
    if (!isElement(node)) continue
    if (node.tag === 'w:p') {
      const text = paragraphText(node)
      if (text !== '') blocks.push({ kind: 'paragraph', text })
    } else if (node.tag === 'w:tbl') {
      blocks.push({ kind: 'table', rows: tableRows(node) })
    } else if (node.tag === 'w:sdt') {
      // Content controls wrap ordinary paragraphs/tables.
      const content = child(node, 'w:sdtContent')
      if (content) blocks.push(...readBlocks(content))
    }
  }
  return blocks
}

function tableRows(table: XmlElement): string[][] {
  return children(table, 'w:tr').map((row) =>
    children(row, 'w:tc').map((cell) => descendants(cell, 'w:p').map(paragraphText).filter(Boolean).join('\n')),
  )
}

/** Visible text of a paragraph; deleted text and field codes are skipped. */
function paragraphText(p: XmlElement): string {
  let text = ''
  const walk = (el: XmlElement) => {
    for (const node of el.children) {
      if (!isElement(node)) continue
      if (node.tag === 'w:t') text += node.children.filter((n) => !isElement(n)).join('')
      else if (node.tag === 'w:tab') text += '\t'
      else if (node.tag === 'w:br' || node.tag === 'w:cr') text += '\n'
      else if (node.tag !== 'w:delText' && node.tag !== 'w:instrText') walk(node)
    }
  }
  walk(p)
  return text.trim()
}
