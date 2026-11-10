// 同组规则: which documents are reissued together. Files carry no group
// field; groups are recognised from the numbering rules and 对应文件.
//   A. A record template joins the group of the document its 对应文件 names.
//   B. Quality standard STP-BZ-5NN and inspection SOP SOP-QC-5NN form one
//      product group (成品序号 = 500 + 品种号, SMP-WJ-002).
//   Everything else stands alone.
import { type Catalog, currentVersion } from './catalog.ts'
import { identityOf, parseCode } from './codes.ts'
import type { DocumentSet, DocumentVersion } from './model.ts'

export interface DocumentSets {
  sets: DocumentSet[]
  /** Identity → id of its set. */
  setOf: Map<string, string>
}

export function buildDocumentSets(catalog: Catalog): DocumentSets {
  const identities = [...catalog.byIdentity.entries()]
    .filter(([, versions]) => versions.some((v) => v.origin !== 'draft'))
    .map(([identity]) => identity)
    .sort()
  const root = new Map(identities.map((id) => [id, id]))
  const find = (id: string): string => (root.get(id) === id ? id : find(root.get(id)!))
  const union = (a: string, b: string) => root.set(find(a), find(b))

  for (const id of identities) {
    const code = parseCode(id)
    if (code?.category === 'STP' && code.area === 'BZ' && root.has(`SOP-QC-${code.seq}`)) union(id, `SOP-QC-${code.seq}`)
  }
  for (const id of identities) {
    const parent = recordParent(catalog.byIdentity.get(id)!)
    if (parent && root.has(parent)) union(id, parent)
  }

  const members = new Map<string, string[]>()
  for (const id of identities) members.set(find(id), [...(members.get(find(id)) ?? []), id])

  const sets = [...members.values()].map(toSet).sort((a, b) => a.id.localeCompare(b.id))
  const setOf = new Map(sets.flatMap((s) => s.members.map((m) => [m, s.id] as const)))
  return { sets, setOf }
}

/** Identity named by a record template's 对应文件 (current version first, else the newest file). */
export function recordParent(versions: readonly DocumentVersion[]): string | undefined {
  if (parseCode(versions[0]?.identity ?? '')?.category !== 'SOR') return undefined
  const files = versions.filter((v) => v.document)
  const corresponding = (currentVersion(files) ?? files.at(-1))?.document?.header.correspondingDoc
  return corresponding ? identityOf(corresponding) : undefined
}

function toSet(ids: string[]): DocumentSet {
  const category = (id: string) => parseCode(id)?.category
  const standard = ids.find((id) => category(id) === 'STP' && parseCode(id)?.area === 'BZ')
  const main = standard ?? ids.find((id) => category(id) !== 'SOR') ?? ids[0]
  const isProduct = standard !== undefined && ids.some((id) => category(id) === 'SOP' && parseCode(id)?.area === 'QC')
  return {
    id: main,
    kind: isProduct ? 'product' : ids.length > 1 ? 'withRecords' : 'single',
    main,
    members: [main, ...ids.filter((id) => id !== main)],
  }
}
