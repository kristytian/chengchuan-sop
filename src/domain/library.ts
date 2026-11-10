// What the 文件库 shows about one document: its category in the catalogue
// tree, who cites it and whom it cites. Only relations, no conclusions
// (产品定义：依赖图负责“看”). Exceptions are marked — set-mates, a cited
// version, an obsolete or missing target, equipment-only and implicit
// references — plain citations by number are the norm and carry no label.
import type { Catalog } from './catalog.ts'
import { currentVersion } from './catalog.ts'
import { parseCode } from './codes.ts'
import type { DocumentVersion, Equipment, Reference } from './model.ts'
import { TERMS } from './source-terms.ts'
import { documentTexts } from './texts.ts'

/** The catalogue tree of 本厂文件, in its display order (numbering rules, SMP-WJ-002). */
export const LIBRARY_CATEGORIES = ['SMP', 'SOP', 'STP-BZ', 'STP-GY', 'SOR', 'VP', 'PX'] as const
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number]

export function libraryCategoryOf(identity: string): LibraryCategory | null {
  const code = parseCode(identity)
  if (!code) return null
  if (code.category !== 'STP') return code.category
  return code.area === 'GY' ? 'STP-GY' : 'STP-BZ'
}

export interface LibraryInput {
  catalog: Catalog
  setOf: ReadonlyMap<string, string>
  equipment: readonly Equipment[]
  references: readonly Reference[]
}

/** One place a reference sits: a clause (or the header) and the sentence around it. */
export interface CitationPlace {
  referenceId: string
  location: 'header' | 'body'
  clause: string | null
  /** Header field the reference is in, for header places. */
  field: 'correspondingDoc' | 'basis' | null
  /** The sentence (paragraph, heading or table cell) that holds the reference. */
  text: string
  /** The reference as written. */
  written: string
}

export interface IncomingGroup {
  version: DocumentVersion
  identity: string
  places: CitationPlace[]
  sameSet: boolean
  /** The version the citer names, when it names one (写明 02 版). */
  citedVersion: string | null
}

export interface IncomingCitations {
  byNumber: IncomingGroup[]
  /** Citers that only name the equipment model or 设备编号 — to look at twice. */
  byEquipment: IncomingGroup[]
  equipment: { model: string; deviceNo: string | null } | null
  /** Citations from obsolete versions, left out of both lists. */
  hiddenObsolete: { versions: DocumentVersion[]; places: number }
}

export type OutgoingTarget = { kind: 'current' } | { kind: 'obsolete'; replacedBy: string | null } | { kind: 'notFound' }

export interface OutgoingGroup {
  /** Identity of the cited document, or the number as written when it is not in the library. */
  code: string
  /** Current version of the cited document, if any (for its name and link). */
  version: DocumentVersion | null
  target: OutgoingTarget
  sameSet: boolean
  places: CitationPlace[]
}

export interface OutgoingCitations {
  byNumber: OutgoingGroup[]
  /** 中国药典 通则 cited, with the edition as written. */
  external: { chapter: string; edition: string | null; places: CitationPlace[] }[]
  /** References without a number (泛指) — to look at twice. */
  implicit: CitationPlace[]
}

export function incomingCitations(model: LibraryInput, identity: string): IncomingCitations {
  const byKey = versionsByKey(model.catalog)
  const equipment = model.equipment.find((e) => e.mainSop === identity) ?? null
  const citing = model.references.filter((r) => {
    if (r.status === 'rejected' || byKey.get(r.from.version)?.identity === identity) return false
    if (r.target.kind === 'document') return r.target.identity === identity
    return r.target.kind === 'equipment' && equipment !== null && r.target.model === equipment.model
  })

  const live = citing.filter((r) => isLive(byKey.get(r.from.version)))
  const obsolete = citing.filter((r) => !isLive(byKey.get(r.from.version)))
  const group = (refs: Reference[]): IncomingGroup[] =>
    sortByCategory(
      [...groupBy(refs, (r) => r.from.version)].map(([key, list]) => {
        const version = byKey.get(key)!
        const named = list.map((r) => (r.target.kind === 'document' ? r.target.version : null)).find((v) => v !== null) ?? null
        return {
          version,
          identity: version.identity,
          places: list.map((r) => placeOf(r, version)),
          sameSet: model.setOf.get(version.identity) === model.setOf.get(identity),
          citedVersion: named,
        }
      }),
      (g) => g.identity,
    )

  return {
    byNumber: group(live.filter((r) => r.kind === 'code')),
    byEquipment: group(live.filter((r) => r.kind === 'equipment')),
    equipment: equipment ? { model: equipment.model, deviceNo: equipment.deviceNo } : null,
    hiddenObsolete: {
      versions: [...new Set(obsolete.map((r) => r.from.version))].sort().map((key) => byKey.get(key)!),
      places: obsolete.length,
    },
  }
}

export function outgoingCitations(model: LibraryInput, versionKey: string): OutgoingCitations {
  const byKey = versionsByKey(model.catalog)
  const version = byKey.get(versionKey)
  if (!version) return { byNumber: [], external: [], implicit: [] }
  const own = model.references.filter((r) => r.from.version === versionKey && r.status !== 'rejected')

  const numbered = own.filter((r) => r.kind === 'code' && (r.target.kind === 'document' || r.target.kind === 'unresolved'))
  const byNumber = [...groupBy(numbered, (r) => (r.target.kind === 'document' ? r.target.identity : r.target.kind === 'unresolved' ? r.target.code : ''))].map(
    ([code, refs]): OutgoingGroup => {
      const versions = model.catalog.byIdentity.get(code)
      const current = currentVersion(versions?.filter((v) => v.origin !== 'draft'))
      const target: OutgoingTarget = !versions ? { kind: 'notFound' } : current ? { kind: 'current' } : { kind: 'obsolete', replacedBy: replacementOf(versions) }
      return {
        code,
        version: current ?? null,
        target,
        sameSet: model.setOf.has(code) && model.setOf.get(code) === model.setOf.get(version.identity),
        places: refs.map((r) => placeOf(r, version)),
      }
    },
  )

  const chapters = own.filter((r) => r.target.kind === 'external')
  const external = [...groupBy(chapters, (r) => (r.target.kind === 'external' ? `${r.target.edition ?? ''}|${r.target.chapter}` : ''))].map(([, refs]) => {
    const target = refs[0].target as Extract<Reference['target'], { kind: 'external' }>
    return { chapter: target.chapter, edition: target.edition, places: refs.map((r) => placeOf(r, version)) }
  })

  return {
    byNumber: sortByCategory(byNumber, (g) => g.code),
    external: external.sort((a, b) => a.chapter.localeCompare(b.chapter)),
    implicit: own.filter((r) => r.kind === 'implicit').map((r) => placeOf(r, version)),
  }
}

/** For each document citing `identity` by number: the other live documents that cite it in turn. */
export function secondRing(model: LibraryInput, identity: string): { version: DocumentVersion; citers: DocumentVersion[] }[] {
  return incomingCitations(model, identity)
    .byNumber.map((g) => ({
      version: g.version,
      citers: incomingCitations(model, g.identity)
        .byNumber.filter((c) => c.identity !== identity)
        .map((c) => c.version),
    }))
    .filter((r) => r.citers.length > 0)
}

/** For an obsolete version: what replaced it (another number from the ledger remark, or a newer version) and whether its original is still on the shared drive. */
export interface Supersession {
  replacedBy: string | null
  newerVersion: string | null
  hasOriginal: boolean
}

export function supersessionOf(catalog: Catalog, version: DocumentVersion): Supersession {
  const versions = catalog.byIdentity.get(version.identity) ?? []
  const newer = versions.filter((v) => v.origin !== 'draft' && Number(v.version) > Number(version.version)).at(-1)
  return { replacedBy: replacementOf([version]), newerVersion: newer?.version ?? null, hasOriginal: version.document !== null }
}

function placeOf(r: Reference, version: DocumentVersion): CitationPlace {
  const header = version.document?.header
  const field = r.from.location !== 'header' ? null : header?.correspondingDoc?.includes(r.text) ? 'correspondingDoc' : header?.basis?.includes(r.text) ? 'basis' : null
  const texts = version.document ? documentTexts(version.document) : []
  const holder = texts.find((t) => t.location === r.from.location && t.clause === r.from.clause && t.text.includes(r.text))
  return { referenceId: r.id, location: r.from.location, clause: r.from.clause, field, text: holder?.text ?? r.text, written: r.text }
}

function replacementOf(versions: readonly DocumentVersion[]): string | null {
  for (const v of [...versions].reverse()) {
    for (const row of v.ledger?.rows ?? []) {
      const m = TERMS.replacedBy.exec(row.remark)
      if (m) return m[1]
    }
  }
  return null
}

const isLive = (v: DocumentVersion | undefined) => v?.origin === 'library' && v.status !== 'obsolete'

function versionsByKey(catalog: Catalog): Map<string, DocumentVersion> {
  return new Map(catalog.versions.map((v) => [v.key, v]))
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}

/** Category order of the catalogue tree, then by number. */
export function sortByCategory<T>(items: T[], identityOf: (item: T) => string): T[] {
  const rank = (id: string) => {
    const c = libraryCategoryOf(id)
    return c === null ? LIBRARY_CATEGORIES.length : LIBRARY_CATEGORIES.indexOf(c)
  }
  return items.sort((a, b) => rank(identityOf(a)) - rank(identityOf(b)) || identityOf(a).localeCompare(identityOf(b)))
}
