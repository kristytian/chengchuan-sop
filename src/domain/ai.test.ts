import { describe, expect, it } from 'vitest'
import type { SourceDocument } from '../data/schema.ts'
import { lookupRun, referenceSuggestions } from './ai.ts'
import { impactAnalysisInput, impactChangeForAI, impactSubject, inputHash, PROMPT_VERSIONS, referenceSuggestionInput, stableJson } from './ai-inputs.ts'
import { analyzeChange, deriveLibraryModel } from './library-model.ts'
import type { AIRun, ChangePointsSuggestion, ImpactSuggestion } from './model.ts'
import { clause, library, para, sourceDoc } from './test-fixtures.ts'

const equipmentSop = sourceDoc('SOP-SB-021-02', {
  name: '乳化均质机（RH-300）规程',
  clauses: [clause('4', '程序'), clause('4.3', '转速 2500–3000 rpm。')],
})
const draft = sourceDoc('SOP-SB-021-03', {
  name: '乳化均质机（RH-500）规程',
  source: 'scenario-inputs/draft.docx',
  clauses: [clause('4', '程序'), clause('4.3', '转速 2800–3400 rpm。')],
})
const citer = (text: string) => sourceDoc('SOP-SC-031-02', { clauses: [clause('4.2', '按 SOP-SB-021 检查。'), clause('4.4', text)] })

function setup(docs: SourceDocument[]) {
  const model = deriveLibraryModel(library(docs, undefined, [draft]))
  return { model, change: model.changes.find((c) => c.source.kind === 'revision')! }
}

function run(subject: string, inputHash: string, output: ImpactSuggestion, promptVersion = PROMPT_VERSIONS.impactAnalysis): AIRun<ImpactSuggestion> {
  return {
    task: 'impactAnalysis',
    subject,
    inputVersions: [],
    inputHash,
    promptVersion,
    model: 'claude-opus-5-5',
    servedBy: 'claude-opus-5-5',
    mode: 'cache',
    runAt: '2026-11-03T00:00:00Z',
    output,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    stopReason: 'end_turn',
  }
}
const suggestion: ImpactSuggestion = { tier: 'mustChange', cannotDetermine: false, confidence: 0.9, reason: '4.4 写了转速。', clauses: ['4.4'] }

describe('AI inputs', () => {
  it('give the model the whole target document, the change diff and where the source is cited', () => {
    const { model, change } = setup([equipmentSop, citer('均质转速 2800 rpm。')])
    const { diff, impact } = analyzeChange(model, change)
    const input = impactAnalysisInput(impactChangeForAI(change, diff, model.catalog), impact[0], model.catalog, model.references)

    expect(input.change.clauseChanges).toEqual([{ ref: '4.3', type: 'modified', oldText: '转速 2500–3000 rpm。', newText: '转速 2800–3400 rpm。' }])
    expect(input.target.document.clauses.map((c) => c.ref)).toEqual(['4.2', '4.4'])
    expect(input.target.citations).toEqual([{ clause: '4.2', text: 'SOP-SB-021' }])
  })

  it('hash the same input the same way regardless of key order, and differently when the text changes', () => {
    expect(stableJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}')
    expect(inputHash({ a: 1, b: '甲' })).toBe(inputHash({ b: '甲', a: 1 }))
    expect(inputHash({ a: 1, b: '甲' })).not.toBe(inputHash({ a: 1, b: '乙' }))
  })
})

describe('merging cached results', () => {
  it('applies a current result, and marks one built from other inputs or an older prompt as stale', () => {
    const { model, change } = setup([equipmentSop, citer('均质转速 2800 rpm。')])
    const base = analyzeChange(model, change)
    const version = model.catalog.versions.find((v) => v.key === base.impact[0].version)!
    const subject = impactSubject(change, version)
    const hash = inputHash(impactAnalysisInput(impactChangeForAI(change, base.diff, model.catalog), base.impact[0], model.catalog, model.references))

    const current = analyzeChange(model, change, { aiRuns: [run(subject, hash, suggestion)] }).impact[0]
    expect(current).toMatchObject({ aiStatus: 'current', suggestedTier: 'mustChange', suggestionConfidence: 0.9, suggestedClauses: ['4.4'], reason: '4.4 写了转速。' })

    expect(analyzeChange(model, change, { aiRuns: [run(subject, 'other', suggestion)] }).impact[0]).toMatchObject({ aiStatus: 'stale', suggestedTier: null })
    expect(analyzeChange(model, change, { aiRuns: [run(subject, hash, suggestion, 'impact-v0')] }).impact[0].aiStatus).toBe('stale')
    expect(base.impact[0].aiStatus).toBe('missing')
  })

  it('marks a hand-written example as such, and finds 修改要点 for the same input', () => {
    const { model, change } = setup([equipmentSop, citer('均质转速 2800 rpm。')])
    const base = analyzeChange(model, change)
    const version = model.catalog.versions.find((v) => v.key === base.impact[0].version)!
    const subject = impactSubject(change, version)
    const hash = inputHash(impactAnalysisInput(impactChangeForAI(change, base.diff, model.catalog), base.impact[0], model.catalog, model.references))
    const points: AIRun<ChangePointsSuggestion> = {
      ...run(subject, hash, suggestion),
      task: 'changePoints',
      promptVersion: PROMPT_VERSIONS.changePoints,
      mode: 'example',
      output: { annotations: [{ clause: '4.4', conclusion: 'change', points: [{ text: '转速 → 2800–3400 rpm', from: '2800 rpm', to: '2800–3400 rpm', source: ['4.3'] }], note: '' }] },
    }

    const analysis = analyzeChange(model, change, { aiRuns: [{ ...run(subject, hash, suggestion), mode: 'example' }, points] })
    expect(analysis.impact[0]).toMatchObject({ aiStatus: 'current', aiExample: true })
    expect(analysis.points.get(base.impact[0].id)).toMatchObject({ status: 'current', run: { mode: 'example' } })
    expect(base.points.get(base.impact[0].id)?.status).toBe('missing')
  })

  it('marks a result stale once the target document text changes', () => {
    const before = setup([equipmentSop, citer('均质转速 2800 rpm。')])
    const { diff, impact } = analyzeChange(before.model, before.change)
    const version = before.model.catalog.versions.find((v) => v.key === impact[0].version)!
    const hash = inputHash(impactAnalysisInput(impactChangeForAI(before.change, diff, before.model.catalog), impact[0], before.model.catalog, before.model.references))
    const cached = run(impactSubject(before.change, version), hash, suggestion)

    const after = setup([equipmentSop, citer('均质转速 3000 rpm。')])
    expect(analyzeChange(after.model, after.change, { aiRuns: [cached] }).impact[0].aiStatus).toBe('stale')
  })

  it('looks up reference suggestions for implicit references only', () => {
    const model = deriveLibraryModel(library([sourceDoc('SOP-SC-041-01'), sourceDoc('SOP-SC-031-02', { clauses: [clause('4.7', '按相关清洁规程执行。')] })]))
    const implicit = model.references.find((r) => r.kind === 'implicit')!
    const input = referenceSuggestionInput(implicit, model.catalog)

    expect(input.candidates.map((c) => c.identity)).toEqual(['SOP-SC-041'])
    const states = referenceSuggestions(model.references, model.catalog, [])
    expect([...states.entries()]).toEqual([[implicit.id, { status: 'missing', run: null }]])
    expect(lookupRun([], 'referenceSuggestion', implicit.id, inputHash(input)).status).toBe('missing')
  })
})

describe('reference suggestion input', () => {
  it('carries the citing clause text', () => {
    const model = deriveLibraryModel(library([sourceDoc('SOP-SC-031-02', { clauses: [clause('4.7', '清场', para('按相关清洁规程执行。'))] })]))
    const input = referenceSuggestionInput(model.references[0], model.catalog)

    expect(input.citing).toMatchObject({ code: 'SOP-SC-031-02', clause: '4.7', clauseText: '清场\n按相关清洁规程执行。', text: '相关清洁规程' })
  })
})
