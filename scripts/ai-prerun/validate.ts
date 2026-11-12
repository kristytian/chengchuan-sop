// Checks a model output against its input before it may enter ai-cache/:
// enums, value ranges, and that every clause or target it names was offered.
import type { ImpactAnalysisInput, ReferenceExtractionInput, ReferenceSuggestionInput } from '../../src/domain/ai-inputs.ts'
import type { ImpactSuggestion, ImpactTier, ReferenceExtraction, ReferenceSuggestion } from '../../src/domain/model.ts'

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

type Extracted = ReferenceExtraction['references'][number]
const EXTRACTED_TYPES: readonly Extracted['type'][] = ['explicit', 'implicit', 'external', 'notFound']
const CONFIDENCE_LEVELS: readonly Extracted['confidence'][] = ['high', 'medium', 'low']
const EXCERPT_MAX = 50

/**
 * Each entry names an offered clause, quotes it (≤ 50 characters), and names
 * only directory ids other than the document's own; external and notFound
 * name none, explicit and implicit name at least one, and only external has a standard.
 */
export function checkExtraction(output: unknown, input: ReferenceExtractionInput): Checked<ReferenceExtraction> {
  const list = ((output ?? {}) as { references?: unknown }).references
  if (!Array.isArray(list)) return { ok: false, errors: ['references is not an array'] }
  const { document, directory } = input
  const texts = new Map<string, string[]>()
  const header = [document.header.correspondingDoc, document.header.basis].filter((t): t is string => Boolean(t))
  if (header.length > 0) texts.set('header', header)
  for (const c of document.clauses) texts.set(c.ref, [...(texts.get(c.ref) ?? []), c.text])
  const ids = new Set(directory.map((d) => d.id))

  const errors: string[] = []
  const references: Extracted[] = []
  list.forEach((raw, i) => {
    const r = (raw ?? {}) as Partial<Extracted>
    const own: string[] = []
    const say = (what: string) => own.push(`references[${i}]: ${what}`)

    if (!EXTRACTED_TYPES.includes(r.type as Extracted['type'])) say(`type "${String(r.type)}" is not one of ${EXTRACTED_TYPES.join(', ')}`)
    if (!CONFIDENCE_LEVELS.includes(r.confidence as Extracted['confidence'])) say(`confidence "${String(r.confidence)}" is not one of ${CONFIDENCE_LEVELS.join(', ')}`)
    const clauseTexts = typeof r.clause === 'string' ? texts.get(r.clause) : undefined
    if (!clauseTexts) say(`clause "${String(r.clause)}" was not offered`)
    if (typeof r.excerpt !== 'string' || r.excerpt.trim() === '') say('excerpt is empty')
    else {
      if (Array.from(r.excerpt.trim()).length > EXCERPT_MAX) say(`excerpt ${JSON.stringify(r.excerpt)} is longer than ${EXCERPT_MAX} characters`)
      if (clauseTexts && !clauseTexts.some((t) => quotes(t, r.excerpt!))) say(`excerpt ${JSON.stringify(r.excerpt)} is not in clause ${r.clause}`)
    }

    const target = r.target
    if (target !== null && typeof target !== 'string') say('target is not a string or null')
    const candidates = Array.isArray(r.candidates) && r.candidates.every((c) => typeof c === 'string') ? r.candidates : null
    if (!candidates) say('candidates is not an array of strings')
    const named = [...(typeof target === 'string' ? [target] : []), ...(candidates ?? [])]
    for (const id of named) {
      if (!ids.has(id)) say(`"${id}" is not in the directory`)
      else if (id === document.id) say(`"${id}" is the document itself`)
    }
    if ((r.type === 'external' || r.type === 'notFound') && named.length > 0) say(`${r.type} must name no target or candidates`)
    if ((r.type === 'explicit' || r.type === 'implicit') && named.length === 0) say(`${r.type} needs a target or candidates`)
    const hasStandard = typeof r.standard === 'string' && r.standard.trim() !== ''
    if (r.type === 'external' ? !hasStandard : r.standard !== null) say('standard must be set for external and null otherwise')
    if (typeof r.reason !== 'string' || r.reason.trim() === '') say('reason is empty')
    if (typeof r.note !== 'string') say('note is not a string')

    if (own.length > 0) {
      errors.push(...own)
      return
    }
    references.push({
      clause: r.clause!,
      excerpt: r.excerpt!.trim(),
      type: r.type!,
      target: target ?? null,
      candidates: [...new Set(candidates!)],
      standard: hasStandard ? r.standard!.trim() : null,
      confidence: r.confidence!,
      reason: r.reason!.trim(),
      note: r.note!.trim(),
    })
  })
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { references } }
}

/** Whether `text` holds the excerpt, ignoring whitespace and table bars; … marks a cut, so each part must appear, in order. */
function quotes(text: string, excerpt: string): boolean {
  const squash = (s: string) => s.replace(/[\s|]+/g, '')
  const parts = excerpt.split(/…|\.{3}/).map(squash).filter(Boolean)
  const hay = squash(text)
  let from = 0
  for (const part of parts) {
    const at = hay.indexOf(part, from)
    if (at < 0) return false
    from = at + part.length
  }
  return parts.length > 0
}

function checkCommon(o: { confidence?: unknown; reason?: unknown }): string[] {
  const errors: string[] = []
  if (typeof o.confidence !== 'number' || !(o.confidence >= 0 && o.confidence <= 1)) errors.push('confidence is not a number in [0, 1]')
  if (typeof o.reason !== 'string' || o.reason.trim() === '') errors.push('reason is empty')
  return errors
}
