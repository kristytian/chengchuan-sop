// The two documents of a training pack (UX-53): 培训资料 and 考核题, written
// from AI's pack into Word files once, then edited by QA like a 审阅 draft —
// a person's changes tracked in their name, accepted when the pack is
// confirmed. The 考核题 holds the questions only (it is the 学员版); the
// answers are a key beside it (题号 · 答案 · 对应条款), appended for the 答案版.
import type { TFunction } from 'i18next'
import { displayCode } from '@/data/model'
import type { PackDocId } from '@/store/demo'
import { draftKey } from '@/store/drafts'
import { offscreen } from '../review/superdoc'
import type { ChangeView } from '../view'
import { deadlineText } from './labels'
import type { Pack } from './model'

export type PackDoc = PackDocId

/** The working copy of one document of a pack, kept like a 审阅 draft (cleared with the demo). */
export const packDocKey = (changeId: string, role: string, doc: PackDoc) => draftKey(changeId, `training:${role}:${doc}`)

const LETTERS = 'ABCDEFGH'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** The plant's documents are set in 宋体 with 黑体 headings (samples), not Word's blue default headings. */
const SONG = 'font-family:SimSun;font-size:12pt'
const HEI = 'font-family:SimHei'
const run = (text: string, style = SONG) => `<span style="${style}">${esc(text)}</span>`
const p = (text: string, block = '') => `<p style="line-height:1.5${block ? `;${block}` : ''}">${run(text)}</p>`
const heading = (text: string, size: string, block = '') => `<p${block ? ` style="${block}"` : ''}><strong>${run(text, `${HEI};font-size:${size}`)}</strong></p>`
const cell = (text: string, width: string) => `<td style="width:${width}">${run(text, 'font-family:SimSun;font-size:10.5pt')}</td>`
const row = (cells: string[]) => `<tr>${cells.map((c, i) => cell(c, i % 2 === 0 ? '17%' : '33%')).join('')}</tr>`

/** Company line, title and the table every pack document opens with. */
function head(t: TFunction, view: ChangeView, pack: Pack, title: string, extra: string[][]): string {
  const audience = t('training.sheet.audienceValue', { role: pack.audience.role, departments: pack.audience.departments.join(t('common.listSep')) })
  return [
    `<p style="text-align:center">${run(t('assess.report.company'), 'font-family:SimSun;font-size:10.5pt')}</p>`,
    heading(title, '16pt', 'text-align:center'),
    '<table style="width:100%">',
    row([t('training.sheet.controlNo'), view.record.controlNo, t('training.sheet.deadline'), deadlineText(t, view)]),
    row([t('training.sheet.basis'), `${displayCode(view.newVersion)} ${view.newVersion.name}`, t('training.sheet.audience'), audience]),
    ...extra.map(row),
    '</table>',
  ].join('')
}

/** 培训资料: what changed, for the trainees to read first — AI's summary, one paragraph per sentence. */
export function materialHtml(t: TFunction, view: ChangeView, pack: Pack): string {
  const sentences = (pack.ai?.summary ?? '').split(/(?<=\u3002)/).map((s) => s.trim()).filter(Boolean)
  return [
    head(t, view, pack, t('training.sheet.title.material', { subject: view.record.title }), []),
    heading(t('training.sheet.summary'), '12pt'),
    ...(sentences.length > 0 ? sentences.map((s) => p(s)) : [p(t('training.doc.emptySummary'))]),
  ].join('')
}

/** 考核题: each question and its options — no answers; this is what the trainees get. */
export function questionsHtml(t: TFunction, view: ChangeView, pack: Pack): string {
  const questions = pack.ai?.questions ?? []
  const blank = ''
  return [
    head(t, view, pack, t('training.sheet.title.student', { subject: view.record.title }), [[t('training.sheet.name'), blank, t('training.sheet.score'), blank]]),
    heading(t('training.sheet.questions'), '12pt'),
    ...(questions.length > 0
      ? questions.flatMap((q, i) => [
          p(t('training.doc.question', { n: i + 1, stem: q.stem, type: t(`training.type.${q.type}`), blank: q.type === 'judge' ? t('training.sheet.judgeBlank') : '' })),
          ...(q.type === 'single' ? [p(q.options.map((o, j) => `${LETTERS[j]}. ${o}`).join('\u3000'), 'margin-left:24px')] : []),
        ])
      : [p(t('training.doc.emptyExam'))]),
  ].join('')
}

/** One row of a pack's answer key: 题号, the answer, the clause it rests on. */
export interface AnswerRow {
  n: string
  answer: string
  clause: string
}

/** AI's answer key: one row per question — the right option, or 对 / 错 — and the clause it rests on. */
export function aiAnswers(t: TFunction, pack: Pack): AnswerRow[] {
  return (pack.ai?.questions ?? []).map((q, i) => ({
    n: String(i + 1),
    answer: q.type === 'single' && typeof q.answer === 'number' ? LETTERS[q.answer] : t(q.answer ? 'training.judgeYesShort' : 'training.judgeNoShort'),
    clause: q.clause,
  }))
}

/** The answer key as printed after the questions in the 答案版. */
export function answerKeyHtml(t: TFunction, rows: readonly AnswerRow[]): string {
  const cells = (r: string[]) => `<tr>${r.map((c) => `<td>${run(c, 'font-family:SimSun;font-size:10.5pt')}</td>`).join('')}</tr>`
  return [
    heading(t('training.answerKey.title'), '12pt'),
    '<table style="width:100%">',
    cells([t('training.answerKey.n'), t('training.answerKey.answer'), t('training.answerKey.clause')]),
    ...rows.map((r) => cells([r.n, r.answer, r.clause ? t('training.answerKey.clauseValue', { clause: r.clause }) : ''])),
    '</table>',
  ].join('')
}

/** A new Word file with this content (the first time a pack document opens). */
export function writeDocx(html: string): Promise<Blob> {
  return offscreen(null, async (doc, exportDocx) => {
    await doc.replace({ target: { kind: 'story', storyType: 'body' }, type: 'html', value: html })
    return exportDocx()
  })
}

/**
 * A working copy as handed out: every change accepted; for the 答案版, the
 * answer key appended at the end. Its HTML (to print as PDF) and its .docx.
 */
export function finished(source: Blob, append: string | null): Promise<{ html: string; docx: Blob }> {
  return offscreen(source, async (doc, exportDocx) => {
    await doc.trackChanges.decide({ decision: 'accept', target: { kind: 'all', story: 'all' } }).catch(() => undefined)
    if (append) await doc.insert({ value: append, type: 'html' })
    return { html: await doc.getHtml({}), docx: await exportDocx() }
  })
}

/** Hands a file to the browser as a download. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
