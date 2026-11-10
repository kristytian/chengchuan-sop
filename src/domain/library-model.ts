import type { SampleLibrary } from '../data/schema.ts'
import { type AIState, changePointSuggestions, withImpactSuggestions } from './ai.ts'
import { impactChangeForAI } from './ai-inputs.ts'
import { buildCatalog, type Catalog } from './catalog.ts'
import { buildChanges } from './changes.ts'
import { diffDocuments } from './diff.ts'
import { findEquipment } from './equipment.ts'
import { buildDocumentSets } from './groups.ts'
import { analyzeImpact } from './impact.ts'
import { detectIssues } from './issues.ts'
import type { AIRun, Change, ChangePointsSuggestion, DocumentDiff, DocumentSet, Equipment, ImpactItem, ImportIssue, Reference, Reminder } from './model.ts'
import { extractReferences } from './references.ts'
import { SETTINGS, type Settings } from './settings.ts'

/** Everything the four modules start from, derived by rules alone (no AI). */
export interface LibraryModel {
  catalog: Catalog
  sets: DocumentSet[]
  /** Identity → id of its document set. */
  setOf: Map<string, string>
  equipment: Equipment[]
  references: Reference[]
  issues: ImportIssue[]
  reminders: Reminder[]
  /** The demo changes: scenario drafts and configured external-standard revisions. */
  changes: Change[]
}

export function deriveLibraryModel(library: SampleLibrary, settings: Settings = SETTINGS): LibraryModel {
  const catalog = buildCatalog(library)
  const { sets, setOf } = buildDocumentSets(catalog)
  const equipment = findEquipment(catalog)
  const { references, citedEditions } = extractReferences(catalog, equipment)
  const { issues, reminders } = detectIssues({ catalog, references, citedEditions, settings })
  return { catalog, sets, setOf, equipment, references, issues, reminders, changes: buildChanges(catalog) }
}

export interface ChangeAnalysis {
  diff: DocumentDiff | null
  impact: ImpactItem[]
  /** AI 修改要点 per impact item id (missing for most until the pre-run). */
  points: Map<string, AIState<ChangePointsSuggestion>>
}

/**
 * A change's clause diff (revisions only) and impact candidates against the
 * given references, with cached AI tier suggestions merged in where current.
 */
export function analyzeChange(
  model: LibraryModel,
  change: Change,
  { references = model.references, aiRuns = [] }: { references?: readonly Reference[]; aiRuns?: readonly AIRun[] } = {},
): ChangeAnalysis {
  const document = (key: string) => model.catalog.versions.find((v) => v.key === key)?.document
  let diff: DocumentDiff | null = null
  if (change.source.kind === 'revision') {
    const [oldDoc, newDoc] = [document(change.source.oldVersion), document(change.source.newVersion)]
    if (oldDoc && newDoc) diff = diffDocuments(oldDoc, newDoc)
  }
  const items = analyzeImpact({ ...model, references }, change)
  const changeInput = impactChangeForAI(change, diff, model.catalog)
  return {
    diff,
    impact: withImpactSuggestions(items, change, changeInput, model.catalog, references, aiRuns),
    points: changePointSuggestions(items, change, changeInput, model.catalog, references, aiRuns),
  }
}
