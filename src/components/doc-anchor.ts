/** Where something sits on a document: the header table, or a clause (null = the unnumbered body). */
export type DocAnchor = { kind: 'header' } | { kind: 'clause'; number: string | null }

/** A piece of text inside an anchor: a header-table cell, the clause heading, a paragraph, or a table cell (row 0 = head row). */
export type TextPlace =
  | { kind: 'header'; row: number; cell: number }
  | { kind: 'heading' }
  | { kind: 'paragraph'; block: number }
  | { kind: 'cell'; block: number; row: number; cell: number }

export const anchorKey = (a: DocAnchor) => (a.kind === 'header' ? 'header' : `clause:${a.number ?? 'body'}`)

/** DOM id of an anchor inside the paper with this id prefix, for scrolling to it. */
export const anchorId = (prefix: string, a: DocAnchor) => `${prefix}-${anchorKey(a).replace(/[:.]/g, '-')}`

/** The anchor a key stands for (`header`, `clause:4.2`, `clause:body`). */
export function parseAnchor(key: string): DocAnchor {
  if (key === 'header') return { kind: 'header' }
  const number = key.replace(/^clause:/, '')
  return { kind: 'clause', number: number === 'body' ? null : number }
}
