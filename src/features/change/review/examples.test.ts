import { describe, expect, it, vi } from 'vitest'
import { aiRuns, changeAnalysis, libraryModel } from '@/data/model'
import { impactChangeForAI, impactSubject, inputHash, PROMPT_VERSIONS, revisionDraftInput } from '@/domain/ai-inputs'
import { checkpointState } from '@/store/demo'
import { changeView } from '../view'
import { reviewTargets } from './model'

// i18n sets the page title as it loads; there is no page here.
vi.hoisted(() => {
  ;(globalThis as { document?: unknown }).document ??= { title: '' }
})

// The hand-written revision drafts (ai-examples/revisionDraft) stand for AI on
// the demo's exported report, people's 修改要点 included (UX-57): on that
// report they must read as current, not stale.
describe('revision draft examples', () => {
  it('are current on the demo’s exported report', () => {
    const data = checkpointState('exported')
    const record = data.changes[0]
    const view = changeView(record, data.assessments[record.id], {}, undefined, data.date)!
    const change = impactChangeForAI(view.change, changeAnalysis(view.change.id).diff, libraryModel.catalog)
    const found = reviewTargets(view, {}).flatMap((x) => {
      const run = aiRuns.find((r) => r.task === 'revisionDraft' && r.subject === impactSubject(view.change, x.version))
      if (!run) return []
      const hash = inputHash(revisionDraftInput(change, x.version, { tier: x.entry.group, lines: x.entry.lines }))
      return [{ subject: run.subject, hash: run.inputHash, prompt: run.promptVersion, want: { hash, prompt: PROMPT_VERSIONS.revisionDraft } }]
    })
    expect(found.length).toBeGreaterThan(0)
    for (const f of found) expect({ subject: f.subject, hash: f.hash, prompt: f.prompt }).toEqual({ subject: f.subject, ...f.want })
  })
})
