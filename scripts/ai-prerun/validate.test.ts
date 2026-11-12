import { describe, expect, it } from 'vitest'
import type { ImpactAnalysisInput, ReferenceExtractionInput, ReferenceSuggestionInput } from '../../src/domain/ai-inputs.ts'
import { checkExtraction, checkImpact, checkReference } from './validate.ts'

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

const entry = (id: string, code: string) => ({ id, code, ledgerCode: null, name: '测试', category: 'SOP', version: '01', status: 'current' as const, ledgerOnly: false })
const extractionInput: ReferenceExtractionInput = {
  directory: [entry('SOP-SC-041@01', 'SOP-SC-041-01'), entry('SOP-SC-031@02', 'SOP-SC-031-02')],
  document: {
    id: 'SOP-SC-031@02',
    code: 'SOP-SC-031-02',
    name: '测试',
    category: 'SOP',
    version: '02',
    header: { correspondingDoc: null, basis: null },
    clauses: [
      { ref: '4.7', text: '清场：生产结束后按相关清洁规程执行设备清洁和清场。' },
      { ref: '5', text: '相关文件\nSOP-SC-041 清洁规程\n《中国药典》2025 年版四部通则 1105、1106' },
    ],
  },
}
const extracted = (over: Record<string, unknown>) => ({
  clause: '5',
  excerpt: 'SOP-SC-041 清洁规程',
  type: 'explicit',
  target: 'SOP-SC-041@01',
  candidates: [],
  standard: null,
  confidence: 'high',
  reason: '写明了编号。',
  note: '',
  ...over,
})

describe('checkExtraction', () => {
  it('accepts each type, excerpts cut with …, and an empty list', () => {
    const references = [
      extracted({}),
      extracted({ clause: '4.7', excerpt: '…按相关清洁规程执行…', type: 'implicit', target: null, candidates: ['SOP-SC-041@01', 'SOP-SC-041@01'], confidence: 'medium', note: '泛指' }),
      extracted({ excerpt: '通则 1105、1106', type: 'external', target: null, standard: ' 中国药典 2025 年版 通则 1106 ' }),
    ]
    const result = checkExtraction({ references }, extractionInput)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.references[1]).toMatchObject({ candidates: ['SOP-SC-041@01'] })
    if (result.ok) expect(result.value.references[2]).toMatchObject({ standard: '中国药典 2025 年版 通则 1106' })
    expect(checkExtraction({ references: [] }, extractionInput)).toEqual({ ok: true, value: { references: [] } })
  })

  it('rejects clauses and excerpts that are not in the document, unknown ids, the document itself and misplaced fields', () => {
    const result = checkExtraction(
      {
        references: [
          extracted({ clause: '9.9' }),
          extracted({ excerpt: '按 SOP-SC-099 执行' }),
          extracted({ target: 'SOP-XX-001@00' }),
          extracted({ target: 'SOP-SC-031@02' }),
          extracted({ type: 'external', standard: null }),
          extracted({ type: 'implicit', target: null, confidence: 'certain' }),
        ],
      },
      extractionInput,
    )

    expect(result).toEqual({
      ok: false,
      errors: [
        'references[0]: clause "9.9" was not offered',
        'references[1]: excerpt "按 SOP-SC-099 执行" is not in clause 5',
        'references[2]: "SOP-XX-001@00" is not in the directory',
        'references[3]: "SOP-SC-031@02" is the document itself',
        'references[4]: external must name no target or candidates',
        'references[4]: standard must be set for external and null otherwise',
        'references[5]: confidence "certain" is not one of high, medium, low',
        'references[5]: implicit needs a target or candidates',
      ],
    })
  })
})
