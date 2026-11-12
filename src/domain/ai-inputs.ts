// Inputs for the AI pre-run, built from the library model only (never from the
// answer keys or the design docs). Shared by scripts/ai-prerun (to call the model) and the
// app (to tell a cached result from a stale one by its input hash).
import type { Clause } from '../data/schema.ts'
import type { Catalog } from './catalog.ts'
import { identityOf } from './codes.ts'
import { clauseText } from './diff.ts'
import type { AITask, Change, DocumentDiff, DocumentVersion, ImpactItem, Reference } from './model.ts'
import { contentClauses } from './texts.ts'

/** Bump when a prompt or output schema changes; older cache entries then show as stale. */
export const PROMPT_VERSIONS: Record<AITask, string> = {
  impactAnalysis: 'impact-v1',
  referenceSuggestion: 'reference-v1',
  referenceExtraction: 'extraction-v2',
  // No prompt in scripts/ai-prerun yet for these three; only hand-written examples use them so far.
  changePoints: 'points-v1',
  revisionDraft: 'revision-v3',
  trainingPack: 'training-v1',
}

/** Clause id in AI inputs and outputs: its number, or "body" for an unnumbered body. */
export const clauseRef = (c: Clause): string => c.number ?? 'body'

export interface DocumentForAI {
  code: string
  name: string
  category: string | null
  version: string
  header: { correspondingDoc: string | null; basis: string | null }
  clauses: { ref: string; text: string }[]
}

export interface ImpactChangeForAI {
  id: string
  source:
    | { kind: 'revision'; code: string; name: string; oldVersion: string; newVersion: string }
    | { kind: 'externalStandard'; standard: 'ChP'; chapter: string; edition: string | null }
  equipment: { from: string; to: string } | null
  headerChanges: { field: string; old: string; new: string }[]
  clauseChanges: { ref: string; type: string; oldText: string | null; newText: string | null }[]
}

export interface ImpactAnalysisInput {
  /** Shared by every item of one change (sent first, so it can be cached). */
  change: ImpactChangeForAI
  target: {
    document: DocumentForAI
    relation: { level: ImpactItem['level']; inSameSet: boolean; via: string[] }
    /** Where the target cites the source: clause ref ("header" for header fields) and the text as written. */
    citations: { clause: string; text: string }[]
  }
}

export interface ReferenceSuggestionInput {
  citing: { code: string; name: string; clause: string; clauseText: string; text: string }
  /** Current library documents other than the citing one. */
  candidates: { identity: string; name: string; category: string | null }[]
}

export function documentForAI(v: DocumentVersion): DocumentForAI {
  const doc = v.document
  return {
    code: v.printedCode ?? v.identity,
    name: v.name,
    category: v.category,
    version: v.version,
    header: { correspondingDoc: doc?.header.correspondingDoc ?? null, basis: doc?.header.basis ?? null },
    clauses: doc ? contentClauses(doc).map((c) => ({ ref: clauseRef(c), text: clauseText(c) })) : [],
  }
}

export function impactChangeForAI(change: Change, diff: DocumentDiff | null, catalog: Catalog): ImpactChangeForAI {
  const byKey = new Map(catalog.versions.map((v) => [v.key, v]))
  const source: ImpactChangeForAI['source'] =
    change.source.kind === 'revision'
      ? {
          kind: 'revision',
          code: change.source.identity,
          name: byKey.get(change.source.newVersion)?.name ?? '',
          oldVersion: byKey.get(change.source.oldVersion)?.version ?? '',
          newVersion: byKey.get(change.source.newVersion)?.version ?? '',
        }
      : { kind: 'externalStandard', standard: 'ChP', chapter: change.source.chapter, edition: change.source.edition }
  return {
    id: change.id,
    source,
    equipment: change.equipment,
    headerChanges: diff?.header ?? [],
    clauseChanges: (diff?.clauses ?? []).map((c) => ({ ref: c.number ?? 'body', type: c.type, oldText: c.oldText, newText: c.newText })),
  }
}

export function impactSubject(change: Change, v: DocumentVersion): string {
  return `${change.id}|${v.identity}@${v.version}`
}

export function impactAnalysisInput(
  change: ImpactChangeForAI,
  item: ImpactItem,
  catalog: Catalog,
  references: readonly Reference[],
): ImpactAnalysisInput {
  const version = catalog.versions.find((v) => v.key === item.version)
  if (!version) throw new Error(`impact item ${item.id} names an unknown version`)
  const byId = new Map(references.map((r) => [r.id, r]))
  const citations = item.hits.flatMap((id) => {
    const r = byId.get(id)
    return r ? [{ clause: r.from.location === 'header' ? 'header' : (r.from.clause ?? 'body'), text: r.text }] : []
  })
  return {
    change,
    target: { document: documentForAI(version), relation: { level: item.level, inSameSet: item.inSameSet, via: item.via }, citations },
  }
}

export function referenceSuggestionInput(ref: Reference, catalog: Catalog): ReferenceSuggestionInput {
  const citing = catalog.versions.find((v) => v.key === ref.from.version)
  const clause = citing?.document?.clauses.find((c) => c.number === ref.from.clause)
  if (!citing || !clause) throw new Error(`reference ${ref.id} names an unknown clause`)
  const candidates = catalog.versions
    .filter((v) => v.origin === 'library' && v.status === 'current' && v.identity !== citing.identity)
    .map((v) => ({ identity: v.identity, name: v.name, category: v.category }))
    .sort((a, b) => a.identity.localeCompare(b.identity))
  return {
    citing: { code: citing.printedCode ?? citing.identity, name: citing.name, clause: clauseRef(clause), clauseText: clauseText(clause), text: ref.text },
    candidates,
  }
}

/** One entry of the 文件目录 for 整篇抽引用: a version in the library or only in the ledger. */
export interface DirectoryEntry {
  /** `identity@version`: what the model answers with. */
  id: string
  /** Number as printed on the file; for ledger-only versions, the ledger's. */
  code: string
  /** The ledger's number, when it registers the file under another one. */
  ledgerCode: string | null
  name: string
  category: string | null
  version: string
  status: 'current' | 'obsolete' | 'unregistered'
  /** In the ledger only: there is no file. */
  ledgerOnly: boolean
}

export interface ReferenceExtractionInput {
  /** The same for every document (sent first, so it can be cached). */
  directory: DirectoryEntry[]
  document: DocumentForAI & { id: string }
}

export const extractionSubject = (v: DocumentVersion): string => `${v.identity}@${v.version}`

/** Every version but drafts, sorted by id. */
export function referenceDirectory(catalog: Catalog): DirectoryEntry[] {
  return catalog.versions
    .filter((v) => v.origin !== 'draft')
    .map((v) => ({
      id: extractionSubject(v),
      code: v.printedCode ?? (v.category === 'SOR' ? v.identity : `${v.identity}-${v.version}`),
      ledgerCode: v.ledger && v.printedCode && identityOf(v.ledger.code) !== identityOf(v.printedCode) ? v.ledger.code : null,
      name: v.name,
      category: v.category,
      version: v.version,
      status: v.status === 'draft' ? 'unregistered' : v.status,
      ledgerOnly: v.origin === 'ledgerOnly',
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** Input for listing everything one library file cites; its 文件变更历史 chapter is left out, as in every AI input. */
export function referenceExtractionInput(v: DocumentVersion, directory: DirectoryEntry[]): ReferenceExtractionInput {
  if (!v.document) throw new Error(`${v.key} has no file`)
  return { directory, document: { id: extractionSubject(v), ...documentForAI(v) } }
}

export interface RevisionDraftInput {
  change: ImpactChangeForAI
  target: {
    document: DocumentForAI
    /** What the exported report says about it: tier, and per place what to change or evaluate (AI wording or from → to). */
    report: { tier: string; lines: { ref: string; conclusion: string; points: string[] }[] }
  }
}

/**
 * Input for AI's revision draft of one document: the exported report's lines,
 * people's 修改要点 included (UX-57; the report is locked by then). A person's
 * 备注 is for the report's readers and stays out.
 */
export function revisionDraftInput(
  change: ImpactChangeForAI,
  version: DocumentVersion,
  report: { tier: string; lines: { ref: string; conclusion: string; points: { text: string; from: string | null; to: string | null }[] }[] },
): RevisionDraftInput {
  return {
    change,
    target: {
      document: documentForAI(version),
      report: { tier: report.tier, lines: report.lines.map((l) => ({ ref: l.ref, conclusion: l.conclusion, points: l.points.map((p) => p.text || `${p.from} → ${p.to}`) })) },
    },
  }
}

export interface TrainingPackInput {
  change: ImpactChangeForAI
  /** The new version, as approved. */
  document: DocumentForAI
  /** Who is trained, as the 职责 chapter words it. */
  audience: { role: string; duty: string; executor: string | null }
}

/** Input for AI's training pack for one audience (培训, UX-53). */
export function trainingPackInput(change: ImpactChangeForAI, newVersion: DocumentVersion, audience: TrainingPackInput['audience']): TrainingPackInput {
  return { change, document: documentForAI(newVersion), audience }
}

export const trainingSubject = (change: Change, role: string) => `${change.id}|${role}`

/** Order-independent JSON: object keys sorted at every level. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** 64-bit FNV-1a (two 32-bit lanes) of the stable JSON — for staleness checks, not security. */
export function inputHash(value: unknown): string {
  const text = stableJson(value)
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}
