// Rule-based reference extraction — the dependency graph's edges. Four kinds:
//   code           a document number (SOP-SC-041, SOP-SC-031-02, SOR-SB-021-R01)
//   equipment      an equipment model or 设备编号 → that equipment's main SOP (low confidence)
//   pharmacopoeia  中国药典 通则 numbers with their edition
//   implicit       a reference without a number (相关清洁规程) → for AI to suggest, QA to decide
// Not references: a document's own number, supersession statements (替代原 X)
// and anything in the 文件变更历史 chapter.
import type { Catalog } from './catalog.ts'
import { findCodes, identityOf, parseCode } from './codes.ts'
import type { DocumentVersion, Equipment, Reference, ReferenceTarget } from './model.ts'
import { TERMS } from './source-terms.ts'
import { type DocumentText, documentTexts } from './texts.ts'

export const CURRENT_EDITION = 'current'

export interface ExtractedReferences {
  references: Reference[]
  /** Version key → 中国药典 editions it cites (years, or 'current' for 现行版). */
  citedEditions: Map<string, string[]>
}

export function extractReferences(catalog: Catalog, equipment: readonly Equipment[]): ExtractedReferences {
  const references: Reference[] = []
  const citedEditions = new Map<string, string[]>()
  for (const version of catalog.versions) {
    if (version.origin !== 'library' || !version.document) continue
    const texts = documentTexts(version.document)
    const editions = [...new Set(texts.flatMap((t) => editionsIn(t.text).map((e) => e.value)))]
    citedEditions.set(version.key, editions)
    references.push(...dedupe(texts.flatMap((t) => referencesIn(t, version, catalog, equipment, editions))))
  }
  return { references, citedEditions }
}

function referencesIn(
  t: DocumentText,
  from: DocumentVersion,
  catalog: Catalog,
  equipment: readonly Equipment[],
  docEditions: string[],
): Reference[] {
  const own = new Set([from.identity, identityOf(from.printedCode ?? '')])
  const make = (kind: Reference['kind'], target: ReferenceTarget, text: string, extra: Partial<Reference> = {}): Reference => ({
    id: `${from.key}|${t.location}|${t.clause ?? '-'}|${targetKey(target)}`,
    from: { version: from.key, location: t.location, clause: t.clause },
    kind,
    target,
    text,
    origin: 'rule',
    confidence: 'high',
    ambiguous: false,
    status: 'pending',
    ...extra,
  })
  const found: Reference[] = []

  for (const { code, index } of findCodes(t.text)) {
    const parsed = parseCode(code)
    if (!parsed || own.has(parsed.identity) || TERMS.supersedesBefore.test(t.text.slice(0, index))) continue
    const known = catalog.byIdentity.get(parsed.identity)
    if (!known) {
      found.push(make('code', { kind: 'unresolved', code }, code))
      continue
    }
    // Only library files count: a revision draft renaming the document is not a conflict.
    const names = new Set(known.filter((v) => v.origin === 'library').map((v) => v.name))
    found.push(make('code', { kind: 'document', identity: parsed.identity, version: parsed.version }, code, { ambiguous: parsed.version === null && names.size > 1 }))
  }

  for (const e of equipment) {
    if (own.has(e.mainSop)) continue
    const token = [e.model, e.deviceNo].find((s) => s && t.text.includes(s))
    if (token) found.push(make('equipment', { kind: 'equipment', model: e.model }, token, { confidence: 'low' }))
  }

  const editions = editionsIn(t.text)
  for (const m of t.text.matchAll(TERMS.generalChapters)) {
    const edition = editions.filter((e) => e.index < m.index).at(-1)?.value ?? (docEditions.length === 1 ? docEditions[0] : null)
    for (const chapter of m[1].match(/\d{4}/g) ?? []) found.push(make('pharmacopoeia', { kind: 'external', edition, chapter }, m[0]))
  }

  for (const m of t.text.matchAll(TERMS.implicitReference)) {
    found.push({ ...make('implicit', { kind: 'implicit' }, m[0], { confidence: 'low' }), id: `${from.key}|${t.location}|${t.clause ?? '-'}|implicit:${m[0]}` })
  }
  return found
}

function editionsIn(text: string): { index: number; value: string }[] {
  return [...text.matchAll(TERMS.edition)].map((m) => ({ index: m.index, value: m[1] ?? CURRENT_EDITION }))
}

function targetKey(target: ReferenceTarget): string {
  switch (target.kind) {
    case 'document':
      return `doc:${target.identity}@${target.version ?? '*'}`
    case 'external':
      return `chp:${target.edition ?? '?'}:${target.chapter}`
    case 'equipment':
      return `eq:${target.model}`
    case 'unresolved':
      return `unresolved:${target.code}`
    case 'implicit':
      return 'implicit'
  }
}

/** One reference per clause and target. */
function dedupe(references: Reference[]): Reference[] {
  return [...new Map(references.map((r) => [r.id, r])).values()]
}
