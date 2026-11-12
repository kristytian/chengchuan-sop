// 起草检查 of one version (UX-58): the rules' findings, with AI's wording and
// its own findings from the hand-written example (used even when stale: it
// stands for AI on the demo's documents, and a finding whose words are gone
// simply drops).
import { aiRuns, libraryModel } from '@/data/model'
import { lookupRun } from '@/domain/ai'
import { draftCheckInput, draftCheckSubject, inputHash } from '@/domain/ai-inputs'
import { DRAFT_RULES_VERSION, type DraftFinding, ruleFindings, withAi } from '@/domain/draft-check'
import type { DocumentVersion, DraftCheckSuggestion } from '@/domain/model'

export interface DraftCheck {
  findings: DraftFinding[]
  /** AI's part is a hand-written example (ai-examples/); the page says so. */
  example: boolean
}

const checks = new Map<string, DraftCheck>()

export function draftCheckOf(v: DocumentVersion): DraftCheck {
  const cached = checks.get(v.key)
  if (cached) return cached
  let result: DraftCheck = { findings: [], example: false }
  if (v.document) {
    const implicit = libraryModel.references.filter((r) => r.from.version === v.key && r.kind === 'implicit')
    const state = lookupRun<DraftCheckSuggestion>(aiRuns, 'draftCheck', draftCheckSubject(v), inputHash(draftCheckInput(v, DRAFT_RULES_VERSION)))
    const run = state.status === 'current' || (state.status === 'stale' && state.run?.mode === 'example') ? state.run : null
    result = { findings: withAi(v.document, ruleFindings(v.document, implicit), run?.output ?? null), example: run?.mode === 'example' }
  }
  checks.set(v.key, result)
  return result
}
