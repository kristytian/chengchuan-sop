import { displayCode, libraryModel } from '@/data/model'
import type { DocumentVersion } from '@/domain/model'

const LIMIT = 8

/** Library versions matching a number or name; current versions first. */
export function searchLibrary(query: string): DocumentVersion[] {
  const q = query.trim().toUpperCase()
  if (!q) return []
  const rank = (v: DocumentVersion) => (v.status === 'current' ? 0 : 1)
  return libraryModel.catalog.versions
    .filter((v) => v.origin !== 'draft' && (displayCode(v).toUpperCase().includes(q) || v.name.includes(query.trim())))
    .sort((a, b) => rank(a) - rank(b) || displayCode(a).localeCompare(displayCode(b)))
    .slice(0, LIMIT)
}

export const documentPath = (v: DocumentVersion) => `/library/${encodeURIComponent(v.identity)}/${v.version}`

/** Link to a file page, opening at a place on the document. */
export const placeLink = (v: DocumentVersion, p: { location: 'header' | 'body'; clause: string | null }) =>
  `${documentPath(v)}?at=${p.location === 'header' ? 'header' : `clause:${p.clause ?? 'body'}`}`
