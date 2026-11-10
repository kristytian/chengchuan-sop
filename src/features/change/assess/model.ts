// Glue between the 影响评估 screens and the domain: per-candidate annotations
// and AI suggestions, the report AI and the rules generate, and the report as
// people left it (UX-50).
import { changeAnalysis, libraryModel, versionByKey } from '@/data/model'
import { TERMS } from '@/domain/source-terms'
import {
  aiPointsAt,
  type Annotation,
  annotationsOf,
  applyEdits,
  type ChangePoint,
  equipmentSwap,
  generatedEntry,
  type ImpactGroup,
  impactGroupOf,
  type Report,
  type ReportEntry,
  unresolvedOn,
} from '@/domain/assessment'
import type { Change, ChangePointsSuggestion, DocumentVersion, ImpactItem, NoteConclusion } from '@/domain/model'
import { type Assessment, USER_DEPARTMENT } from '@/store/demo'

export const referencesById = new Map(libraryModel.references.map((r) => [r.id, r]))

export interface ItemContext {
  item: ImpactItem
  version: DocumentVersion
  group: ImpactGroup
  annotations: Annotation[]
  /** AI per 批注 ref: conclusion, points, note; empty without a current AI result. */
  ai: Map<string, { conclusion: NoteConclusion | null; points: ChangePoint[]; note: string }>
  unresolved: ReturnType<typeof unresolvedOn>
  /** The AI text on this candidate is a hand-written example (ai-examples/). */
  example: boolean
}

const contexts = new Map<string, ItemContext>()

export function itemContext(change: Change, item: ImpactItem): ItemContext {
  const cached = contexts.get(item.id)
  if (cached) return cached
  const version = versionByKey(item.version)!
  const pointsRun = changeAnalysis(change.id).points.get(item.id)
  const suggestion: ChangePointsSuggestion | null = pointsRun?.status === 'current' && pointsRun.run ? pointsRun.run.output : null
  const swap = equipmentSwap(change, libraryModel.equipment, libraryModel.catalog)
  const annotations = annotationsOf({ catalog: libraryModel.catalog, references: referencesById }, change, item, swap, suggestion)
  const context: ItemContext = {
    item,
    version,
    group: impactGroupOf(item, referencesById),
    annotations,
    ai: new Map(
      annotations.flatMap((a) => {
        const at = aiPointsAt(suggestion, a.ref)
        return at ? [[a.ref, at] as const] : []
      }),
    ),
    unresolved: unresolvedOn(version, libraryModel.references),
    example: item.aiExample || pointsRun?.run?.mode === 'example',
  }
  contexts.set(item.id, context)
  return context
}

const generated = new Map<string, ReportEntry[]>()

/** The report AI and the rules give a change, before anyone touches it. */
export function generatedReport(change: Change): ReportEntry[] {
  let entries = generated.get(change.id)
  if (!entries) {
    entries = changeAnalysis(change.id).impact.map((item) => {
      const c = itemContext(change, item)
      return generatedEntry({ item, group: c.group, annotations: c.annotations, ai: c.ai, unresolved: c.unresolved.map((u) => u.code) })
    })
    generated.set(change.id, entries)
  }
  return entries
}

export function reportOf(change: Change, assessment: Assessment): Report {
  return applyEdits(generatedReport(change), assessment)
}

/**
 * The factory's departments, for 决定部门 and 申请部门: the known ones and every
 * 起草部门 in the library (质量控制部 …), the user's own first.
 */
export function departments(): string[] {
  const library = [...libraryModel.catalog.byIdentity.values()].flat().flatMap((v) => (v.document?.header.department ? [v.document.header.department] : []))
  return [...new Set([USER_DEPARTMENT, ...Object.values(TERMS.departments), ...library])]
}

/** The report is edited and confirmed while it is a draft; once exported it is locked. */
export const canEditReport = (exported: boolean) => !exported

/** DOM id of a report entry, for scrolling the report to it from the list. */
export const entryAnchor = (version: string) => `entry-${version.replace(/[^A-Za-z0-9]+/g, '-')}`
