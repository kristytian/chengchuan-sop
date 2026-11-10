// Merges cached AI results (ai-cache/) into impact items and references.
// A result applies only while its input hash and prompt version still match;
// otherwise it is shown as stale and its values are not used.
import type { Catalog } from './catalog.ts'
import {
  impactAnalysisInput,
  impactSubject,
  inputHash,
  PROMPT_VERSIONS,
  referenceSuggestionInput,
  type ImpactChangeForAI,
} from './ai-inputs.ts'
import type { AIRun, AIStatus, AITask, Change, ChangePointsSuggestion, ImpactItem, ImpactSuggestion, Reference, ReferenceSuggestion } from './model.ts'

export interface AIState<Output> {
  status: AIStatus
  run: AIRun<Output> | null
}

export function lookupRun<Output>(runs: readonly AIRun[], task: AITask, subject: string, hash: string): AIState<Output> {
  const run = runs.find((r) => r.task === task && r.subject === subject) as AIRun<Output> | undefined
  if (!run) return { status: 'missing', run: null }
  return { status: run.inputHash === hash && run.promptVersion === PROMPT_VERSIONS[task] ? 'current' : 'stale', run }
}

export function withImpactSuggestions(
  items: readonly ImpactItem[],
  change: Change,
  changeInput: ImpactChangeForAI,
  catalog: Catalog,
  references: readonly Reference[],
  runs: readonly AIRun[],
): ImpactItem[] {
  const byKey = new Map(catalog.versions.map((v) => [v.key, v]))
  return items.map((item) => {
    const version = byKey.get(item.version)!
    const hash = inputHash(impactAnalysisInput(changeInput, item, catalog, references))
    const { status, run } = lookupRun<ImpactSuggestion>(runs, 'impactAnalysis', impactSubject(change, version), hash)
    if (status !== 'current' || !run) return { ...item, aiStatus: status }
    const s = run.output
    return {
      ...item,
      aiStatus: status,
      aiExample: run.mode === 'example',
      suggestedTier: s.tier,
      suggestionConfidence: s.confidence,
      suggestedClauses: s.clauses,
      reason: s.reason,
    }
  })
}

/** AI 修改要点 per impact item (same input as the tier suggestion), keyed by item id. */
export function changePointSuggestions(
  items: readonly ImpactItem[],
  change: Change,
  changeInput: ImpactChangeForAI,
  catalog: Catalog,
  references: readonly Reference[],
  runs: readonly AIRun[],
): Map<string, AIState<ChangePointsSuggestion>> {
  const byKey = new Map(catalog.versions.map((v) => [v.key, v]))
  return new Map(
    items.map((item) => {
      const hash = inputHash(impactAnalysisInput(changeInput, item, catalog, references))
      return [item.id, lookupRun<ChangePointsSuggestion>(runs, 'changePoints', impactSubject(change, byKey.get(item.version)!), hash)]
    }),
  )
}

/** AI target suggestions for implicit references (those without a number). */
export function referenceSuggestions(
  references: readonly Reference[],
  catalog: Catalog,
  runs: readonly AIRun[],
): Map<string, AIState<ReferenceSuggestion>> {
  return new Map(
    references
      .filter((r) => r.kind === 'implicit')
      .map((r) => [r.id, lookupRun<ReferenceSuggestion>(runs, 'referenceSuggestion', r.id, inputHash(referenceSuggestionInput(r, catalog)))]),
  )
}
