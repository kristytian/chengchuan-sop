import { describe, expect, it } from 'vitest'
import type { SourceDocument } from '../data/schema.ts'
import { aiPointsAt, annotationsOf, applyEdits, emptyPointEdits, equipmentSwap, generatedEntry, impactGroupOf, needsLook, pointAdjustments, unevaluated, unresolvedOn, withoutPoints } from './assessment.ts'
import { analyzeChange, deriveLibraryModel } from './library-model.ts'
import type { ChangePointsSuggestion, ImpactItem } from './model.ts'
import { clause, library, para, sourceDoc } from './test-fixtures.ts'

const equipmentSop = sourceDoc('SOP-SB-021-02', {
  name: '乳化均质机（RH-300）规程',
  clauses: [clause('2', '适用范围', para('适用于 RH-300 型乳化均质机（设备编号 SB-RH-01）。'))],
})
const draft = sourceDoc('SOP-SB-021-03', {
  name: '乳化均质机（RH-500）规程',
  source: 'scenario-inputs/draft.docx',
  clauses: [clause('2', '适用范围', para('适用于 RH-500 型乳化均质机（设备编号 SB-RH-02）。'))],
})
const log = sourceDoc('SOR-SB-021-R01', { version: '02', correspondingDoc: 'SOP-SB-021-02', clauses: [clause(null, '', para('设备：RH-300 型　设备编号：SB-RH-01'))] })
const operating = sourceDoc('SOP-SC-031-02', { clauses: [clause('4.2', '设备检查：按 SOP-SB-021 检查。')] })
const process = sourceDoc('STP-GY-010-03', {
  clauses: [clause('4.4', '关键工艺参数', { kind: 'table', rows: [['参数', '规定范围'], ['设备', 'RH-300 型（SB-RH-01）'], ['均质转速', '2500–3000 rpm']] })],
})
const batch = sourceDoc('SOR-SC-011-R01', { version: '02', correspondingDoc: 'STP-GY-011-02', clauses: [clause(null, '', para('设备：RH-300 型'))] })
const preparing = sourceDoc('SOP-SC-035-00', { clauses: [clause('4.4', '转入乳化间，按 SOP-SC-031 执行。')] })

function setup(docs: SourceDocument[] = [equipmentSop, log, operating, process, batch, preparing]) {
  const model = deriveLibraryModel(library(docs, undefined, [draft]))
  const change = model.changes.find((c) => c.source.kind === 'revision')!
  const { impact } = analyzeChange(model, change)
  const references = new Map(model.references.map((r) => [r.id, r]))
  const swap = equipmentSwap(change, model.equipment, model.catalog)
  const item = (identity: string) => impact.find((i) => i.identity === identity)!
  const notes = (i: ImpactItem, ai: ChangePointsSuggestion | null = null) => annotationsOf({ catalog: model.catalog, references }, change, i, swap, ai)
  return { model, change, impact, references, swap, item, notes }
}

describe('impact groups', () => {
  it('say why each document is on the list: cites the source, same set, model only, or indirect', () => {
    const { item, references } = setup()
    expect(impactGroupOf(item('SOP-SC-031'), references)).toBe('cites')
    expect(impactGroupOf(item('SOR-SB-021-R01'), references)).toBe('sameSet')
    expect(impactGroupOf(item('STP-GY-010'), references)).toBe('modelOnly')
    expect(impactGroupOf(item('SOR-SC-011-R01'), references)).toBe('modelOnly')
    expect(impactGroupOf(item('SOP-SC-035'), references)).toBe('indirect')
  })
})

describe('annotations', () => {
  it('read the new 设备编号 from the draft, next to the model swap', () => {
    expect(setup().swap).toEqual({ model: { from: 'RH-300', to: 'RH-500' }, deviceNo: { from: 'SB-RH-01', to: 'SB-RH-02' } })
  })

  it('give rule points for the model, the 设备编号 and a number written with the old version', () => {
    const { item, notes } = setup()
    const [header, body] = notes(item('SOR-SB-021-R01'))
    expect(header).toMatchObject({ key: 'header', hits: [{ kind: 'code', text: 'SOP-SB-021-02', field: 'correspondingDoc' }] })
    expect(header.rulePoints.map((p) => [p.from, p.to])).toEqual([['SOP-SB-021-02', 'SOP-SB-021-03']])
    expect(body.rulePoints.map((p) => [p.from, p.to])).toEqual([
      ['RH-300', 'RH-500'],
      ['SB-RH-01', 'SB-RH-02'],
    ])
  })

  it('mark a number without version as following the new version, with nothing to change', () => {
    const { item, notes } = setup()
    expect(notes(item('SOP-SC-031'))).toMatchObject([{ ref: '4.2', followsNewVersion: true, rulePoints: [] }])
  })

  it('note a hit inside a table, and add a place only AI found', () => {
    const { item, notes } = setup()
    const ai: ChangePointsSuggestion = { annotations: [{ clause: '4.4', conclusion: 'change', points: [], note: '' }] }
    const [params] = notes(item('STP-GY-010'), ai)
    expect(params).toMatchObject({ ref: '4.4', heading: '关键工艺参数', aiOnly: false, hits: [{ kind: 'model', inTable: true }, { kind: 'deviceNo', inTable: true }] })
  })

  it('list indirect hits as the listed document they cite, without points', () => {
    const { item, notes } = setup()
    expect(notes(item('SOP-SC-035'))).toMatchObject([{ ref: '4.4', hits: [{ kind: 'via', text: 'SOP-SC-031' }], rulePoints: [] }])
  })

  it('show numbers the library cannot find, once per place, without guessing', () => {
    const { model } = setup()
    const v = model.catalog.versions.find((x) => x.identity === 'SOR-SC-011-R01')!
    expect(unresolvedOn(v, model.references)).toEqual([{ key: 'header', code: 'STP-GY-011-02', field: 'correspondingDoc' }])
  })
})

describe('the report', () => {
  const ai: ChangePointsSuggestion = {
    annotations: [{ clause: '4.4', conclusion: 'change', points: [{ text: '转速 → 2800–3400 rpm', from: '2500–3000 rpm', to: '2800–3400 rpm', source: ['4.3.3'] }], note: '均质时间不动。' }],
  }
  const entryFor = (identity: string, suggestion: Partial<ImpactItem>, points: ChangePointsSuggestion | null) => {
    const { item, notes, references, model } = setup()
    const i = { ...item(identity), aiStatus: 'current' as const, ...suggestion }
    const annotations = notes(i, points)
    const at = new Map(annotations.flatMap((a) => {
      const x = aiPointsAt(points, a.ref)
      return x ? [[a.ref, x] as const] : []
    }))
    const v = model.catalog.versions.find((x) => x.key === i.version)!
    return generatedEntry({ item: i, group: impactGroupOf(i, references), annotations, ai: at, unresolved: unresolvedOn(v, model.references).map((u) => u.code) })
  }

  it('takes the tier from AI and lists rule and AI points where AI says 要改', () => {
    const entry = entryFor('STP-GY-010', { suggestedTier: 'mustChange', suggestionConfidence: 0.9, reason: '4.4 写了型号和转速。' }, ai)
    expect(entry).toMatchObject({ group: 'mustChange', origin: 'generated', reason: '4.4 写了型号和转速。' })
    expect(entry.lines).toHaveLength(1)
    expect(entry.lines[0].points.map((p) => [p.origin, p.from, p.to])).toEqual([
      ['rule', 'RH-300', 'RH-500'],
      ['rule', 'SB-RH-01', 'SB-RH-02'],
      ['ai', '2500–3000 rpm', '2800–3400 rpm'],
    ])
    // AI's remark that something stays (均质时间不动) is not a change: it is left out of the line.
    expect(entry.lines[0].note).toBe('')
  })

  it('puts a candidate AI could not decide first, and flags model-only, low-confidence and not-found entries', () => {
    expect(entryFor('SOP-SC-031', { aiStatus: 'missing', suggestedTier: null }, null).group).toBe('undetermined')
    const batch = entryFor('SOR-SC-011-R01', { suggestedTier: 'mustChange', suggestionConfidence: 0.6 }, null)
    expect(batch.flags).toEqual(['modelOnly', 'lowConfidence', 'notFound'])
    expect(batch.notFound).toEqual(['STP-GY-011-02'])
    expect(needsLook(batch)).toBe(true)
    expect(entryFor('SOP-SC-035', { suggestedTier: 'inform', suggestionConfidence: 0.9 }, null)).toMatchObject({ group: 'indirect', via: ['SOP-SC-031'] })
  })

  it('applies people’s edits: removed entries keep who decided, added ones say who put them there, 备注 attach', () => {
    const generated = [entryFor('STP-GY-010', { suggestedTier: 'mustChange', suggestionConfidence: 0.9 }, ai), entryFor('SOP-SC-031', { suggestedTier: 'inform', suggestionConfidence: 0.9 }, null)]
    const report = applyEdits(generated, {
      removed: { [generated[1].version]: { by: '质量管理部', on: '2026-11-04', note: '只引用编号' } },
      added: [{ version: 'samples/x.docx', tier: 'mustChange', reason: '新设备加了在线清洗' }],
      comments: { [generated[0].version]: '生产技术部 11-20 前改完' },
      conclusions: {},
      points: {},
    })
    expect(report.entries[0].comment).toBe('生产技术部 11-20 前改完')
    expect(report.entries.map((e) => [e.origin, e.group])).toEqual([
      ['generated', 'mustChange'],
      ['added', 'mustChange'],
    ])
    expect(report.removed).toEqual([{ entry: generated[1], decision: { by: '质量管理部', on: '2026-11-04', note: '只引用编号' } }])
  })

  it('moves a 需评估 entry by its 评估结论; the ones without are what holds the export', () => {
    const evaluate = entryFor('STP-GY-010', { suggestedTier: 'evaluate', suggestionConfidence: 0.9 }, null)
    const conclusion = { tier: 'mustChange' as const, by: '质量管理部', on: '2026-11-18', note: '' }
    const edits = { removed: {}, added: [], comments: {}, conclusions: { [evaluate.version]: conclusion }, points: {} }
    expect(unevaluated(applyEdits([evaluate], { ...edits, conclusions: {} }))).toHaveLength(1)
    const report = applyEdits([evaluate], edits)
    expect(report.entries[0]).toMatchObject({ group: 'mustChange', conclusion })
    expect(unevaluated(report)).toHaveLength(0)
    // A conclusion only moves 需评估 entries.
    const must = entryFor('STP-GY-010', { suggestedTier: 'mustChange', suggestionConfidence: 0.9 }, null)
    expect(applyEdits([must], { ...edits, conclusions: { [must.version]: { ...conclusion, tier: 'inform' } } }).entries[0].group).toBe('mustChange')
  })

  describe('修改要点 people write (UX-57)', () => {
    const by = { by: '质量管理部', on: '2026-11-18' }
    const person = (id: string, clause: string, text: string, from: string | null = null, to: string | null = null) => ({ id, clause, text, from, to, ...by })
    const none = { removed: {}, added: [], comments: {}, conclusions: {} }
    const lookup = { heading: (_: string, ref: string) => (ref === '4.2' ? '取样点' : ''), order: (_: string, ref: string) => (ref === 'header' ? -1 : Number(ref.split('.')[0]) * 100 + Number(ref.split('.')[1] ?? 0)) }

    it('rewrites and takes out AI points, never rule points, and adds a person’s point on its clause', () => {
      const entry = entryFor('STP-GY-010', { suggestedTier: 'mustChange', suggestionConfidence: 0.9 }, ai)
      const aiId = entry.lines[0].points.find((p) => p.origin === 'ai')!.id
      const ruleId = entry.lines[0].points.find((p) => p.origin === 'rule')!.id
      const edits = { ...emptyPointEdits(), edited: { [aiId]: person('p1', '4.4', '转速改为 2800–3400 rpm，均质时间不变') , [ruleId]: person('p2', '4.4', '不该生效') }, added: [person('p3', '4.4', '刮壁转速 20–35 rpm')] }
      const line = applyEdits([entry], { ...none, points: { [entry.version]: edits } }).entries[0].lines[0]
      expect(line.points.map((p) => [p.origin, p.text || `${p.from} → ${p.to}`])).toEqual([
        ['rule', 'RH-300 → RH-500'],
        ['rule', 'SB-RH-01 → SB-RH-02'],
        ['person', '转速改为 2800–3400 rpm，均质时间不变'],
        ['person', '刮壁转速 20–35 rpm'],
      ])
      expect(line.points.at(-1)).toMatchObject({ by: '质量管理部', on: '2026-11-18' })
      const deleted = applyEdits([entry], { ...none, points: { [entry.version]: { ...emptyPointEdits(), deleted: { [aiId]: by, [ruleId]: by } } } }).entries[0].lines[0]
      expect(deleted.points.map((p) => p.origin)).toEqual(['rule', 'rule'])
    })

    it('puts a point on a clause with no line on a new line, in clause order; a 需评估 entry’s new line is 评估', () => {
      const evaluate = entryFor('STP-GY-010', { suggestedTier: 'evaluate', suggestionConfidence: 0.9 }, null)
      const lines = applyEdits([evaluate], { ...none, points: { [evaluate.version]: { ...emptyPointEdits(), added: [person('p1', '4.2', 'S1 改为底置均质头')] } } }, lookup).entries[0].lines
      const at42 = lines.find((l) => l.ref === '4.2')!
      expect(at42).toMatchObject({ heading: '取样点', conclusion: 'evaluate' })
      expect(lines.map((l) => l.ref)).toEqual([...lines.map((l) => l.ref)].sort((a, b) => lookup.order('', a) - lookup.order('', b)))
    })

    it('holds the export while a document put on as 必须改 has no point, and counts the adjustments', () => {
      const added = { version: 'samples/x.docx', tier: 'mustChange' as const, reason: '新设备加了在线清洗' }
      const bare = applyEdits([], { ...none, added: [added], points: {} })
      expect(withoutPoints(bare)).toHaveLength(1)
      const pointEdits = { ...emptyPointEdits(), added: [person('p1', 'body', '拆卸一栏按底部出料阀重写')] }
      const written = applyEdits([], { ...none, added: [added], points: { [added.version]: pointEdits } })
      expect(withoutPoints(written)).toHaveLength(0)
      expect(written.entries[0].lines[0]).toMatchObject({ ref: 'body', conclusion: 'change' })
      expect(pointAdjustments({ ...none, added: [added], points: { [added.version]: pointEdits } })).toEqual([{ version: added.version, added: 1, edited: 0, deleted: 0 }])
    })
  })
})
