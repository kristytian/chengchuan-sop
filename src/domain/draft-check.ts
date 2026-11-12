// 起草检查 (UX-58): an SOP read against a written rule table, so an operator
// can do what it says. The rules find what words can show (a vague quantity,
// a vague time, a reference without a number); AI adds what only a reading
// finds and suggests a wording for each. People decide every finding.
import type { SourceDocument } from '../data/schema.ts'
import { clauseRef } from './ai-inputs.ts'
import { clauseText } from './diff.ts'
import type { DraftCheckSuggestion, Reference } from './model.ts'
import { TERMS } from './source-terms.ts'
import { contentClauses } from './texts.ts'

export type DraftRuleId = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6'

/** The rule table, v1. by: rule = found by code here; ai = only AI's reading finds it. */
export const DRAFT_RULES: readonly { id: DraftRuleId; by: 'rule' | 'ai' }[] = [
  { id: 'E1', by: 'rule' },
  { id: 'E2', by: 'rule' },
  { id: 'E3', by: 'ai' },
  { id: 'E4', by: 'rule' },
  { id: 'E5', by: 'ai' },
  { id: 'E6', by: 'ai' },
]

/** Bump with the rules or the word lists: AI results checked against an older table show as stale. */
export const DRAFT_RULES_VERSION = 'draft-rules-v1'

export interface DraftFinding {
  /** `rule:clause:word` — stable while the text stays. */
  id: string
  rule: DraftRuleId
  /** Clause ref: "4.5", "body". */
  clause: string
  /** The words that break the rule, as written. */
  word: string
  /** The clause around them, at most 50 characters. */
  excerpt: string
  origin: 'rule' | 'ai'
  /** AI's suggested wording, when there is one. */
  suggestion: string | null
}

const RULE_IDS = new Set(DRAFT_RULES.map((r) => r.id))

/** What the rules find: E1 and E2 by the word lists, E4 from the implicit references already found on this document. */
export function ruleFindings(doc: SourceDocument, implicit: readonly Reference[]): DraftFinding[] {
  const out: DraftFinding[] = []
  const add = (rule: DraftRuleId, clause: string, word: string, text: string) => {
    const id = `${rule}:${clause}:${word}`
    if (!out.some((f) => f.id === id)) out.push({ id, rule, clause, word, excerpt: around(text, word), origin: 'rule', suggestion: null })
  }
  for (const c of contentClauses(doc)) {
    const text = clauseText(c)
    for (const word of TERMS.vagueAmount) if (text.includes(word)) add('E1', clauseRef(c), word, text)
    for (const word of TERMS.vagueTiming) if (text.includes(word)) add('E2', clauseRef(c), word, text)
  }
  for (const r of implicit) {
    if (r.kind !== 'implicit' || r.from.location !== 'body') continue
    const clause = r.from.clause ?? 'body'
    add('E4', clause, r.text, clauseTextAt(doc, clause))
  }
  return out
}

/**
 * The rules' findings with AI's part: a suggestion on the ones it names, and
 * its own findings (E3, E5, E6) where their words are in the clause it names.
 */
export function withAi(doc: SourceDocument, rules: readonly DraftFinding[], ai: DraftCheckSuggestion | null): DraftFinding[] {
  const out = rules.map((f) => ({ ...f }))
  for (const s of ai?.findings ?? []) {
    if (!RULE_IDS.has(s.rule as DraftRuleId)) continue
    const known = out.find((f) => f.rule === s.rule && f.clause === s.clause && f.word === s.word)
    if (known) {
      known.suggestion = s.suggestion
      continue
    }
    const text = clauseTextAt(doc, s.clause)
    if (!text.includes(s.word)) continue
    out.push({ id: `${s.rule}:${s.clause}:${s.word}`, rule: s.rule as DraftRuleId, clause: s.clause, word: s.word, excerpt: around(text, s.word), origin: 'ai', suggestion: s.suggestion })
  }
  return out
}

function clauseTextAt(doc: SourceDocument, ref: string): string {
  return contentClauses(doc)
    .filter((c) => clauseRef(c) === ref)
    .map(clauseText)
    .join('\n')
}

/** At most 50 characters of `text` around `word`, with … where cut. */
function around(text: string, word: string): string {
  const flat = text.replace(/\s*\n\s*/g, ' ')
  const chars = Array.from(flat)
  if (chars.length <= 50) return flat
  const at = Array.from(flat.slice(0, Math.max(0, flat.indexOf(word)))).length
  const start = Math.max(0, Math.min(at - 20, chars.length - 49))
  const end = Math.min(chars.length, start + 49)
  return `${start > 0 ? '…' : ''}${chars.slice(start, end).join('')}${end < chars.length ? '…' : ''}`
}
