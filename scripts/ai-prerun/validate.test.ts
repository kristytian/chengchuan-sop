import { describe, expect, it } from 'vitest'
import type { ImpactAnalysisInput, ReferenceSuggestionInput } from '../../src/domain/ai-inputs.ts'
import { checkImpact, checkReference } from './validate.ts'

const impactInput = {
  change: { id: 'c', source: { kind: 'externalStandard', standard: 'ChP', chapter: '1105', edition: null }, equipment: null, headerChanges: [], clauseChanges: [] },
  target: {
    document: { code: 'SOP-QC-011-03', name: '测试', category: 'SOP', version: '03', header: { correspondingDoc: null, basis: null }, clauses: [{ ref: '4.3', text: '按通则 1105。' }] },
    relation: { level: 'direct', inSameSet: false, via: [] },
    citations: [{ clause: '4.3', text: '通则 1105' }],
  },
} satisfies ImpactAnalysisInput

const referenceInput: ReferenceSuggestionInput = {
  citing: { code: 'SOP-SC-031-02', name: '测试', clause: '4.7', clauseText: '按相关清洁规程执行。', text: '相关清洁规程' },
  candidates: [{ identity: 'SOP-SC-041', name: '清洁标准操作规程', category: 'SOP' }],
}

describe('checkImpact', () => {
  it('accepts a well-formed suggestion and de-duplicates clauses', () => {
    const result = checkImpact({ tier: 'mustChange', cannotDetermine: false, confidence: 0.8, clauses: ['4.3', '4.3'], reason: ' 4.3 引用了通则。 ' }, impactInput)

    expect(result).toEqual({ ok: true, value: { tier: 'mustChange', cannotDetermine: false, confidence: 0.8, clauses: ['4.3'], reason: '4.3 引用了通则。' } })
  })

  it('accepts an explicit "cannot determine"', () => {
    expect(checkImpact({ tier: null, cannotDetermine: true, confidence: 0.2, clauses: [], reason: '缺少修订内容。' }, impactInput).ok).toBe(true)
  })

  it('rejects unknown tiers, clauses that were not offered, out-of-range confidence and inconsistent flags', () => {
    const result = checkImpact({ tier: 'urgent', cannotDetermine: true, confidence: 1.5, clauses: ['9.9'], reason: '' }, impactInput)

    expect(result).toEqual({
      ok: false,
      errors: [
        'tier "urgent" is not one of mustChange, evaluate, inform or null',
        'cannotDetermine must be true exactly when tier is null',
        'confidence is not a number in [0, 1]',
        'reason is empty',
        'clause "9.9" was not offered',
      ],
    })
  })
})

describe('checkReference', () => {
  it('accepts candidates and an explicit "not found"', () => {
    expect(checkReference({ targets: ['SOP-SC-041'], notFound: false, confidence: 0.6, reason: '清洁规程。' }, referenceInput).ok).toBe(true)
    expect(checkReference({ targets: [], notFound: true, confidence: 0.1, reason: '没有合适的。' }, referenceInput).ok).toBe(true)
  })

  it('rejects targets outside the candidate list and inconsistent flags', () => {
    expect(checkReference({ targets: ['SOP-XX-999'], notFound: true, confidence: 0.5, reason: '猜的。' }, referenceInput)).toEqual({
      ok: false,
      errors: ['target "SOP-XX-999" is not a candidate', 'notFound must be true exactly when targets is empty'],
    })
  })
})
