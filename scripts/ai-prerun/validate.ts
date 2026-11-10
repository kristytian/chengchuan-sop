// Checks a model output against its input before it may enter ai-cache/:
// enums, value ranges, and that every clause or target it names was offered.
import type { ImpactAnalysisInput, ReferenceSuggestionInput } from '../../src/domain/ai-inputs.ts'
import type { ImpactSuggestion, ImpactTier, ReferenceSuggestion } from '../../src/domain/model.ts'

export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] }

const TIERS: readonly ImpactTier[] = ['mustChange', 'evaluate', 'inform']

export function checkImpact(output: unknown, input: ImpactAnalysisInput): Checked<ImpactSuggestion> {
  const o = (output ?? {}) as Partial<ImpactSuggestion>
  const errors: string[] = []
  const offered = new Set(['header', ...input.target.document.clauses.map((c) => c.ref)])

  if (o.tier !== null && !TIERS.includes(o.tier as ImpactTier)) errors.push(`tier "${String(o.tier)}" is not one of ${TIERS.join(', ')} or null`)
  if (typeof o.cannotDetermine !== 'boolean') errors.push('cannotDetermine is not a boolean')
  else if (o.cannotDetermine !== (o.tier === null)) errors.push('cannotDetermine must be true exactly when tier is null')
  errors.push(...checkCommon(o))
  if (!Array.isArray(o.clauses)) errors.push('clauses is not an array')
  else for (const c of o.clauses) if (!offered.has(c)) errors.push(`clause "${c}" was not offered`)

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { tier: o.tier!, cannotDetermine: o.cannotDetermine!, confidence: o.confidence!, reason: o.reason!.trim(), clauses: [...new Set(o.clauses!)] } }
}

export function checkReference(output: unknown, input: ReferenceSuggestionInput): Checked<ReferenceSuggestion> {
  const o = (output ?? {}) as Partial<ReferenceSuggestion>
  const errors: string[] = []
  const offered = new Set(input.candidates.map((c) => c.identity))

  if (!Array.isArray(o.targets)) errors.push('targets is not an array')
  else for (const t of o.targets) if (!offered.has(t)) errors.push(`target "${t}" is not a candidate`)
  if (typeof o.notFound !== 'boolean') errors.push('notFound is not a boolean')
  else if (Array.isArray(o.targets) && o.notFound !== (o.targets.length === 0)) errors.push('notFound must be true exactly when targets is empty')
  errors.push(...checkCommon(o))

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { targets: [...new Set(o.targets!)], notFound: o.notFound!, confidence: o.confidence!, reason: o.reason!.trim() } }
}

function checkCommon(o: { confidence?: unknown; reason?: unknown }): string[] {
  const errors: string[] = []
  if (typeof o.confidence !== 'number' || !(o.confidence >= 0 && o.confidence <= 1)) errors.push('confidence is not a number in [0, 1]')
  if (typeof o.reason !== 'string' || o.reason.trim() === '') errors.push('reason is empty')
  return errors
}
