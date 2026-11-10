// 影响评估 (UX-50): AI decides, the rules back it up, people handle the
// exceptions. Here: why each candidate is on the list, where its hits sit on
// the affected document (批注), the change points the rules can name, the
// report entry AI and the rules give each candidate, and people's edits on
// the report (take an entry off with a reason, put a document on).
import type { SourceDocument } from '../data/schema.ts'
import { clauseRef } from './ai-inputs.ts'
import type { Catalog } from './catalog.ts'
import type { Change, ChangePointsSuggestion, DocumentVersion, Equipment, ImpactItem, ImpactTier, NoteConclusion, PointSuggestion, Reference } from './model.ts'
import { TERMS } from './source-terms.ts'
import { contentClauses, documentTexts } from './texts.ts'

/** Why a document is on the list; the list is grouped by this, never by 「直接」「低置信」 (UX-46). */
export type ImpactGroup = 'cites' | 'sameSet' | 'modelOnly' | 'indirect'
export const IMPACT_GROUPS: readonly ImpactGroup[] = ['cites', 'sameSet', 'modelOnly', 'indirect']

export function impactGroupOf(item: ImpactItem, references: ReadonlyMap<string, Reference>): ImpactGroup {
  if (item.level === 'indirect') return 'indirect'
  if (item.inSameSet) return 'sameSet'
  return item.hits.some((id) => references.get(id)?.kind === 'code') ? 'cites' : 'modelOnly'
}

/** What the rules matched at one place. */
export interface Hit {
  kind: 'model' | 'deviceNo' | 'code' | 'via'
  /** As written in the document. */
  text: string
  /** Sits in a table cell (「表里写着」). */
  inTable: boolean
  /** Header places: which field. */
  field: 'correspondingDoc' | 'basis' | null
}

export interface ChangePoint extends PointSuggestion {
  /** Stable within the item: `rule:<anchor>:<from>` or `ai:<anchor>:<n>`. */
  id: string
  origin: 'rule' | 'ai'
}

/** One 批注: a place on the affected document where the rules (or AI) found something. */
export interface Annotation {
  /** Anchor key on the document: header, clause:4.4, clause:body (see components/doc-anchor). */
  key: string
  /** Clause ref as AI inputs write it: "header", "4.4", "body". */
  ref: string
  /** Heading of the clause, for 「§4.4 关键工艺参数」. */
  heading: string
  hits: Hit[]
  rulePoints: ChangePoint[]
  /** A number without a version: it will point to the new version once that takes effect. */
  followsNewVersion: boolean
  /** Found by AI, not by the rules (drawn with a dashed number). */
  aiOnly: boolean
}

/** The equipment swapped by a revision: model and, when both documents print it, 设备编号. */
export interface EquipmentSwap {
  model: { from: string; to: string }
  deviceNo: { from: string; to: string } | null
}

export function equipmentSwap(change: Change, equipment: readonly Equipment[], catalog: Catalog): EquipmentSwap | null {
  if (!change.equipment || change.source.kind !== 'revision') return null
  const old = equipment.find((e) => e.model === change.equipment!.from)
  const newDoc = catalog.versions.find((v) => v.key === (change.source as { newVersion: string }).newVersion)?.document
  const newNo = newDoc ? documentTexts(newDoc).map((t) => TERMS.deviceNo.exec(t.text)?.[1]).find((n) => n !== undefined) : undefined
  return { model: change.equipment, deviceNo: old?.deviceNo && newNo && newNo !== old.deviceNo ? { from: old.deviceNo, to: newNo } : null }
}

export interface AnnotationInput {
  catalog: Catalog
  references: ReadonlyMap<string, Reference>
}

/** The 批注 of one impact item, in document order, with rule change points and AI-only places added. */
export function annotationsOf(
  { catalog, references }: AnnotationInput,
  change: Change,
  item: ImpactItem,
  swap: EquipmentSwap | null,
  ai: ChangePointsSuggestion | null,
): Annotation[] {
  const version = catalog.versions.find((v) => v.key === item.version)
  const doc = version?.document
  if (!doc) return []
  const newVersion = change.source.kind === 'revision' ? catalog.versions.find((v) => v.key === (change.source as { newVersion: string }).newVersion) : undefined
  const oldVersion = change.source.kind === 'revision' ? catalog.versions.find((v) => v.key === (change.source as { oldVersion: string }).oldVersion) : undefined

  const byRef = new Map<string, Annotation>()
  const annotationAt = (location: 'header' | 'body', clause: string | null): Annotation => {
    const ref = location === 'header' ? 'header' : (clause ?? 'body')
    const existing = byRef.get(ref)
    if (existing) return existing
    const created: Annotation = {
      key: location === 'header' ? 'header' : `clause:${clause ?? 'body'}`,
      ref,
      heading: location === 'header' ? '' : (contentClauses(doc).find((c) => c.number === clause)?.heading ?? ''),
      hits: [],
      rulePoints: [],
      followsNewVersion: false,
      aiOnly: false,
    }
    byRef.set(ref, created)
    return created
  }

  for (const id of item.hits) {
    const r = references.get(id)
    if (!r) continue
    const a = annotationAt(r.from.location, r.from.clause)
    const texts = textsAt(doc, r.from.location, r.from.clause)
    const field = r.from.location !== 'header' ? null : doc.header.correspondingDoc?.includes(r.text) ? 'correspondingDoc' : doc.header.basis?.includes(r.text) ? 'basis' : null
    const inTable = (text: string) => texts.some((t) => t.inTable && t.text.includes(text))
    const add = (hit: Hit) => {
      if (!a.hits.some((h) => h.kind === hit.kind && h.text === hit.text)) a.hits.push(hit)
    }
    if (r.kind === 'equipment' && swap) {
      for (const [kind, text] of [['model', swap.model.from], ['deviceNo', swap.deviceNo?.from]] as const) {
        if (text && texts.some((t) => t.text.includes(text))) add({ kind, text, inTable: inTable(text), field })
      }
      if (a.hits.length === 0) add({ kind: 'model', text: r.text, inTable: inTable(r.text), field })
    } else if (r.kind === 'code' && r.target.kind === 'document') {
      const viaListed = item.level === 'indirect'
      add({ kind: viaListed ? 'via' : 'code', text: r.text, inTable: inTable(r.text), field })
      if (!viaListed && r.target.version === null) a.followsNewVersion = true
    }
  }

  // Change points the rules can name: the swapped model and 设备编号, and a source number written with its old version.
  const oldCode = oldVersion?.printedCode
  const newCode = newVersion?.printedCode
  for (const a of byRef.values()) {
    const location = a.ref === 'header' ? 'header' : 'body'
    const texts = textsAt(doc, location, a.ref === 'header' ? null : a.ref === 'body' ? null : a.ref)
    const has = (s: string) => texts.some((t) => t.text.includes(s))
    const point = (from: string, to: string) => {
      if (has(from) && !a.rulePoints.some((p) => p.from === from)) a.rulePoints.push({ id: `rule:${a.ref}:${from}`, origin: 'rule', text: '', from, to, source: [] })
    }
    if (swap && a.hits.some((h) => h.kind === 'model' || h.kind === 'deviceNo')) {
      point(swap.model.from, swap.model.to)
      if (swap.deviceNo) point(swap.deviceNo.from, swap.deviceNo.to)
    }
    if (oldCode && newCode && a.hits.some((h) => h.kind === 'code' && h.text === oldCode)) point(oldCode, newCode)
  }

  // AI 修改要点 attach to the place they name; a place the rules did not hit is AI's own finding.
  for (const s of ai?.annotations ?? []) {
    if (byRef.has(s.clause)) continue
    annotationAt(s.clause === 'header' ? 'header' : 'body', s.clause === 'header' || s.clause === 'body' ? null : s.clause).aiOnly = true
  }

  const order = new Map<string, number>([['header', -1], ...contentClauses(doc).map((c, i) => [clauseRef(c), i] as [string, number])])
  return [...byRef.values()].sort((x, y) => (order.get(x.ref) ?? 0) - (order.get(y.ref) ?? 0))
}

/** AI points for one 批注, as ChangePoints. */
export function aiPointsAt(ai: ChangePointsSuggestion | null, ref: string): { conclusion: NoteConclusion | null; points: ChangePoint[]; note: string } | null {
  const s = ai?.annotations.find((x) => x.clause === ref)
  if (!s) return null
  return { conclusion: s.conclusion, note: s.note, points: s.points.map((p, i) => ({ ...p, id: `ai:${ref}:${i}`, origin: 'ai' as const })) }
}

interface PlacedText {
  text: string
  inTable: boolean
}

function textsAt(doc: SourceDocument, location: 'header' | 'body', clause: string | null): PlacedText[] {
  if (location === 'header') return [doc.header.correspondingDoc, doc.header.basis].filter((t): t is string => !!t).map((text) => ({ text, inTable: true }))
  const c = contentClauses(doc).find((x) => x.number === clause)
  if (!c) return []
  return [
    { text: c.heading, inTable: false },
    ...c.body.flatMap((b) => (b.kind === 'paragraph' ? [{ text: b.text, inTable: false }] : b.rows.flat().map((text) => ({ text, inTable: true })))),
  ].filter((t) => t.text)
}

/** 「找不到」: numbers on this document that name nothing in the library or the ledger, one per place. */
export function unresolvedOn(version: DocumentVersion, references: readonly Reference[]): { key: string; code: string; field: 'correspondingDoc' | 'basis' | null }[] {
  const doc = version.document
  const seen = new Set<string>()
  return references
    .filter((r) => r.from.version === version.key && r.target.kind === 'unresolved')
    .flatMap((r) => {
      const key = r.from.location === 'header' ? 'header' : `clause:${r.from.clause ?? 'body'}`
      const code = (r.target as { code: string }).code
      if (seen.has(`${key}|${code}`)) return []
      seen.add(`${key}|${code}`)
      const field = r.from.location !== 'header' ? null : doc?.header.correspondingDoc?.includes(code) ? 'correspondingDoc' : doc?.header.basis?.includes(code) ? 'basis' : null
      return [{ key, code, field }]
    })
}

// ——— The impact report: generated from AI and the rules, edited by people ———

/** Where an entry sits in the report. 「AI 没判断出来」 comes first: that is where a person must look. */
export type ReportGroup = 'undetermined' | ImpactTier | 'indirect'
export const REPORT_GROUPS: readonly ReportGroup[] = ['undetermined', 'mustChange', 'evaluate', 'inform', 'indirect']

/** Why a person should look at an entry even though AI decided it. */
export type ReportFlag = 'modelOnly' | 'lowConfidence' | 'notFound'

/** Below this AI confidence an entry is flagged 「需核对」. */
export const LOW_CONFIDENCE = 0.7

/** One place in an entry: what to change (points only — nothing that stays) or what to evaluate (note). */
export interface ReportLine {
  ref: string
  heading: string
  conclusion: 'change' | 'evaluate'
  points: ChangePoint[]
  note: string
}

export interface ReportEntry {
  /** Version key of the affected document. */
  version: string
  group: ReportGroup
  /** generated = AI and the rules put it here; added = a person did. */
  origin: 'generated' | 'added'
  lines: ReportLine[]
  /** AI's reason for a generated entry; the person's reason for an added one. */
  reason: string
  /** A person's note on an added entry (要改的地方). */
  note: string
  /** A person's 备注 on any entry, e.g. who evaluates and by when. */
  comment: string
  flags: ReportFlag[]
  /** Numbers on the document the library cannot find (for 「库里找不到 STP-GY-011-02」). */
  notFound: string[]
  /** Indirect entries: the listed documents they cite. */
  via: string[]
  /** A 需评估 entry evaluated since: it now sits in the conclusion's group. */
  conclusion: EvaluationConclusion | null
}

export interface EntryInput {
  item: ImpactItem
  group: ImpactGroup
  annotations: Annotation[]
  /** AI per 批注 ref. */
  ai: ReadonlyMap<string, { conclusion: NoteConclusion | null; points: ChangePoint[]; note: string }>
  /** Numbers on the document the library cannot find. */
  unresolved: readonly string[]
}

/** The entry AI and the rules give an impact candidate — no person involved. */
export function generatedEntry({ item, group, annotations, ai, unresolved }: EntryInput): ReportEntry {
  const hasAI = item.aiStatus === 'current' && item.suggestedTier !== null
  const lines: ReportLine[] = []
  for (const a of annotations) {
    const at = ai.get(a.ref)
    // A change line lists what to change; AI's side remarks (「均质时间不动」) stay on the 看原件和依据 page.
    if (at?.conclusion === 'change') lines.push({ ref: a.ref, heading: a.heading, conclusion: 'change', points: [...a.rulePoints, ...at.points], note: '' })
    // An evaluate line keeps the rule points (型号 RH-300 → RH-500): if the evaluation decides it must change, the draft applies them.
    if (at?.conclusion === 'evaluate') lines.push({ ref: a.ref, heading: a.heading, conclusion: 'evaluate', points: [...a.rulePoints], note: at.note })
  }
  const flags: ReportFlag[] = []
  if (group === 'modelOnly') flags.push('modelOnly')
  if (hasAI && (item.suggestionConfidence ?? 1) < LOW_CONFIDENCE) flags.push('lowConfidence')
  if (unresolved.length > 0) flags.push('notFound')
  return {
    version: item.version,
    group: item.level === 'indirect' ? 'indirect' : hasAI ? item.suggestedTier! : 'undetermined',
    origin: 'generated',
    lines,
    reason: item.reason ?? '',
    note: '',
    comment: '',
    flags,
    notFound: [...new Set(unresolved)],
    via: item.via,
    conclusion: null,
  }
}

/** People's edits on the generated report: entries taken off, documents put on, 备注, 评估结论. */
export interface ReportEdits {
  /** Version key → who decided to take it off. */
  removed: Readonly<Record<string, Decision>>
  added: readonly AddedEntry[]
  /** Version key → 备注. */
  comments: Readonly<Record<string, string>>
  /** Version key → the conclusion on a 需评估 entry. */
  conclusions: Readonly<Record<string, EvaluationConclusion>>
}

/**
 * A decision on a report entry (UX-50): which department made it, when, and
 * an optional 备注. What was decided is the choice itself (移出, 改为必须改 …),
 * so nothing more is written.
 */
export interface Decision {
  by: string
  on: string
  note: string
}

/**
 * 评估结论: a 需评估 document evaluated — it must change after all, or is only
 * told. Every 需评估 entry needs one before the report can be exported, so the
 * exported report is final.
 */
export interface EvaluationConclusion extends Decision {
  tier: 'mustChange' | 'inform'
}

export interface AddedEntry {
  version: string
  tier: ImpactTier
  /** 要改的地方 / 要评估什么, as the person wrote it. */
  note: string
  reason: string
}

export interface Report {
  entries: ReportEntry[]
  removed: { entry: ReportEntry; decision: Decision }[]
}

/** The report as it stands: generated entries minus the removed ones, plus the added ones, with people's 备注 and 评估结论. */
export function applyEdits(generated: readonly ReportEntry[], edits: ReportEdits): Report {
  const settle = (e: ReportEntry): ReportEntry => {
    const withComment = { ...e, comment: edits.comments[e.version] ?? '' }
    const c = edits.conclusions[e.version]
    return c && e.group === 'evaluate' ? { ...withComment, group: c.tier, conclusion: c } : withComment
  }
  const entries = generated.filter((e) => !(e.version in edits.removed)).map(settle)
  const removed = generated.filter((e) => e.version in edits.removed).map((entry) => ({ entry, decision: edits.removed[entry.version] }))
  const added = edits.added.map(
    (a): ReportEntry =>
      settle({ version: a.version, group: a.tier, origin: 'added', lines: [], reason: a.reason, note: a.note, comment: '', flags: [], notFound: [], via: [], conclusion: null }),
  )
  return { entries: [...entries, ...added], removed }
}

/** 需评估 entries still without a 评估结论: while there are any, the report cannot be exported. */
export const unevaluated = (report: Report) => report.entries.filter((e) => e.group === 'evaluate')

/** Entries that ask for a person's look: AI could not decide, or flagged. */
export const needsLook = (e: ReportEntry) => e.group === 'undetermined' || e.flags.length > 0
