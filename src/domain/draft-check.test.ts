import { describe, expect, it } from 'vitest'
import { ruleFindings, withAi } from './draft-check.ts'
import type { Reference } from './model.ts'
import { clause, para, sourceDoc } from './test-fixtures.ts'

const doc = sourceDoc('SOP-SB-021-03', {
  clauses: [
    clause('4', '内容'),
    clause('4.5', '日常检查：运行中检查有无异响，机械密封冷却水是否正常；水箱液位偏低时补加适量纯化水。'),
    clause('4.6', '清洁', para('淋洗至末次淋洗水 pH 与纯化水一致，一般不少于 3 次。')),
    clause('4.7', '清场：生产结束后按相关清洁规程执行设备清洁和清场。'),
  ],
})
const implicit: Reference = {
  id: 'r1',
  from: { version: 'v', location: 'body', clause: '4.7' },
  kind: 'implicit',
  target: { kind: 'implicit' },
  text: '相关清洁规程',
  origin: 'rule',
  confidence: 'low',
  ambiguous: false,
  status: 'pending',
}

describe('起草检查 (UX-58)', () => {
  it('finds a vague quantity (E1), a vague frequency (E2) and a reference without a number (E4) by rule', () => {
    const found = ruleFindings(doc, [implicit])
    expect(found.map((f) => [f.rule, f.clause, f.word])).toEqual([
      ['E1', '4.5', '适量'],
      ['E2', '4.6', '一般'],
      ['E4', '4.7', '相关清洁规程'],
    ])
    expect(found[0].excerpt).toContain('补加适量纯化水')
    expect(found.every((f) => f.origin === 'rule' && f.suggestion === null && Array.from(f.excerpt).length <= 50)).toBe(true)
  })

  it('adds AI’s wording to the rules’ findings, and its own findings only where their words are in the clause', () => {
    const merged = withAi(doc, ruleFindings(doc, []), {
      findings: [
        { rule: 'E1', clause: '4.5', word: '适量', suggestion: '补加纯化水至水箱上限刻度' },
        { rule: 'E3', clause: '4.5', word: '是否正常', suggestion: '写明冷却水正常的范围；不正常时停机' },
        { rule: 'E3', clause: '4.5', word: '不在原文里的字', suggestion: '—' },
        { rule: 'X9', clause: '4.5', word: '适量', suggestion: '不是规则表里的' },
      ],
    })
    expect(merged.map((f) => [f.rule, f.origin, f.suggestion])).toEqual([
      ['E1', 'rule', '补加纯化水至水箱上限刻度'],
      ['E2', 'rule', null],
      ['E3', 'ai', '写明冷却水正常的范围；不正常时停机'],
    ])
  })
})
