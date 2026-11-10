// Impact candidates for a change, by rules: who cites the source, who shares
// its document set, and (for reference only) who cites those by number.
// Tiers (必须改 / 需评估 / 仅告知) are left empty for AI to suggest and people
// to decide. Not listed: obsolete versions; implicit references (no target —
// they wait in QA's reference queue); set-mates of affected documents, which
// join at reissue through the same-set rule — so an indirect item needs a
// citation of a listed document outside its own set.
import type { Catalog } from './catalog.ts'
import type { Change, DocumentVersion, ImpactItem, Reference } from './model.ts'

export interface ImpactInput {
  catalog: Catalog
  setOf: ReadonlyMap<string, string>
  sets: readonly { id: string; members: string[] }[]
  references: readonly Reference[]
}

export function analyzeImpact({ catalog, setOf, sets, references }: ImpactInput, change: Change): ImpactItem[] {
  const byKey = new Map(catalog.versions.map((v) => [v.key, v]))
  const live = (key: string) => {
    const v = byKey.get(key)
    return v?.origin === 'library' && v.status !== 'obsolete' ? v : undefined
  }
  const sourceIdentity = change.source.kind === 'revision' ? change.source.identity : null
  const usable = references.filter((r) => r.status !== 'rejected' && live(r.from.version) && byKey.get(r.from.version)?.identity !== sourceIdentity)

  const items = new Map<string, ImpactItem>()
  const itemFor = (v: DocumentVersion, level: ImpactItem['level']) => {
    const item = items.get(v.key) ?? {
      id: `${change.id}|${v.key}`,
      change: change.id,
      version: v.key,
      identity: v.identity,
      level,
      inSameSet: false,
      hits: [],
      via: [],
      confidence: 'low',
      aiStatus: 'missing',
      aiExample: false,
      suggestedTier: null,
      suggestionConfidence: null,
      suggestedClauses: [],
      reason: null,
      finalTier: null,
      status: 'pending',
    }
    items.set(v.key, item)
    return item
  }

  for (const r of usable.filter((r) => citesSource(r, change))) itemFor(live(r.from.version)!, 'direct').hits.push(r.id)

  if (sourceIdentity) {
    const set = sets.find((s) => s.id === setOf.get(sourceIdentity))
    for (const member of set?.members ?? []) {
      if (member === sourceIdentity) continue
      const v = (catalog.byIdentity.get(member) ?? []).filter((x) => live(x.key)).at(-1)
      if (v) itemFor(v, 'direct').inSameSet = true
    }
  }

  const listed = new Set([...items.values()].map((i) => i.identity))
  if (sourceIdentity) listed.add(sourceIdentity)
  for (const r of usable) {
    const v = live(r.from.version)!
    if (r.kind !== 'code' || r.target.kind !== 'document' || !listed.has(r.target.identity) || r.target.identity === v.identity) continue
    if (setOf.get(r.target.identity) === setOf.get(v.identity)) continue
    const existing = items.get(v.key)
    if (existing?.level === 'direct') continue
    const item = itemFor(v, 'indirect')
    item.hits.push(r.id)
    if (!item.via.includes(r.target.identity)) item.via.push(r.target.identity)
  }

  const confidenceOf = new Map(references.map((r) => [r.id, r.confidence]))
  for (const item of items.values()) {
    item.confidence = item.inSameSet || item.hits.some((id) => confidenceOf.get(id) === 'high') ? 'high' : 'low'
  }
  return [...items.values()].sort((a, b) => Number(a.level === 'indirect') - Number(b.level === 'indirect') || a.identity.localeCompare(b.identity))
}

function citesSource(r: Reference, change: Change): boolean {
  const { source, equipment } = change
  if (source.kind === 'revision') {
    if (r.target.kind === 'document') return r.target.identity === source.identity
    return r.target.kind === 'equipment' && equipment !== null && r.target.model === equipment.from
  }
  return r.target.kind === 'external' && r.target.chapter === source.chapter && (source.edition === null || r.target.edition === source.edition)
}
