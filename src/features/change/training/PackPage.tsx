import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { USER_DEPARTMENT, useDemo } from '@/store/demo'
import { loadDraft } from '@/store/drafts'
import { citation } from '../citations'
import { type DraftApi, DocxEditor } from '../review/DocxEditor'
import type { ChangeView } from '../view'
import { aiAnswers, type AnswerRow, answerKeyHtml, download, finished, materialHtml, type PackDoc, packDocKey, questionsHtml, writeDocx } from './docs'
import { deadlineText } from './labels'
import { PACK_DOCS, type Pack, TRAINING_RULE } from './model'
import { PackStatus, RecordList } from './parts'

const NO_OPS = { replacements: [], historyRow: null }
const noop = () => {}

/**
 * 培训 · 一个包 (UX-53, revised 11-10): two Word documents in the order they
 * are handed out — ① 培训资料, ② 考核题 — one page at a time under tabs,
 * written from AI's pack and edited in place like a 审阅 draft (QA's changes
 * tracked in its name). Each is confirmed on its own and, once confirmed,
 * exported; the 考核题's answer key (「显示答案」) is confirmed with it. With
 * both confirmed the pack is, and its training records can be scanned in.
 */
export function PackPage({ view, pack }: { view: ChangeView; pack: Pack }) {
  const { t } = useTranslation()
  const confirmPackDoc = useDemo((s) => s.confirmPackDoc)
  const unconfirmPackDoc = useDemo((s) => s.unconfirmPackDoc)
  const user = useMemo(() => ({ name: USER_DEPARTMENT, email: 'qa@chengchuan.test' }), [])
  const api = useRef<DraftApi | null>(null)
  const [exporting, setExporting] = useState(false)
  const [printing, setPrinting] = useState<string[] | null>(null)
  const [showAnswers, setShowAnswers] = useState(false)
  const [params, setParams] = useSearchParams()
  const role = pack.audience.role
  const doc: PackDoc = params.get('doc') === 'questions' ? 'questions' : 'material'
  const confirmedOn = pack.record.confirmed[doc]
  const editable = !confirmedOn
  const trained = pack.record.records.length > 0
  const answers = aiAnswers(t, pack)
  const open = (d: PackDoc) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (d === 'material') next.delete('doc')
      else next.set('doc', d)
      return next
    })
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null)

  const confirm = async () => {
    // What was typed in the last moment is in the working copy before it is final.
    await api.current?.flush()
    confirmPackDoc(view.record.id, role, doc)
  }

  useEffect(() => {
    if (!printing) return
    // Let the printable copy render before the print dialog takes the page.
    const timer = setTimeout(() => window.print(), 100)
    return () => clearTimeout(timer)
  }, [printing])

  return (
    <div className="flex h-full flex-col print:block print:h-auto">
      <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-2 text-sm print:hidden">
        <Link to={{ search: '' }} className="shrink-0 text-muted-foreground hover:text-foreground hover:underline">
          {t('training.back')}
        </Link>
        <span className="shrink-0 font-semibold">{role}</span>
        <span className="truncate text-xs text-muted-foreground">
          {pack.audience.departments.join(t('common.listSep'))} · {deadlineText(t, view)}
        </span>
        <PackStatus pack={pack} />
        <span className="ml-auto shrink-0" />
        <Link to={`/changes/${view.record.id}/assess/compare`} className="shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline">
          {t('training.compare')}
        </Link>
      </header>
      <Records view={view} pack={pack} />
      <div className="flex shrink-0 items-end gap-1 border-b bg-background px-4 pt-2 print:hidden" role="tablist">
        {PACK_DOCS.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={doc === d}
            onClick={() => open(d)}
            className={cn('-mb-px rounded-t-md border px-4 py-1.5 text-sm', doc === d ? 'border-b-background bg-background font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {t(`training.doc.tab.${d}`)}
            {pack.record.confirmed[d] && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t('training.doc.confirmedTag', { date: shortDate(pack.record.confirmed[d]!) })}</span>}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 self-center pb-1.5">
          {doc === 'questions' && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={showAnswers} onCheckedChange={(v) => setShowAnswers(v === true)} />
              {t('training.answerKey.show')}
            </label>
          )}
          {editable ? (
            <Button size="sm" onClick={() => void confirm()}>
              {t('training.confirm')}
            </Button>
          ) : (
            <>
              <span title={trained ? t('training.unconfirmHint') : undefined}>
                <button
                  type="button"
                  disabled={trained}
                  onClick={() => unconfirmPackDoc(view.record.id, role, doc)}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
                >
                  {t('training.unconfirm')}
                </button>
              </span>
              <Button size="sm" variant="outline" onClick={() => setExporting(true)}>
                {t('training.export')}
              </Button>
            </>
          )}
        </div>
      </div>
      {editable && <div ref={setToolbar} className="draft-toolbar h-10 shrink-0 border-b bg-background print:hidden" />}
      <div className="flex min-h-0 flex-1 print:hidden">
        {(!editable || toolbar) && (
          <DocxEditor
            key={`${doc}-${editable}`}
            draftKey={packDocKey(view.record.id, role, doc)}
            original={() => writeDocx(doc === 'material' ? materialHtml(t, view, pack) : questionsHtml(t, view, pack))}
            ops={NO_OPS}
            user={user}
            editable={editable}
            final={!editable}
            toolbar={editable ? toolbar : null}
            formats={[]}
            scroller={noop}
            onReady={(a) => (api.current = a)}
            onChange={noop}
          />
        )}
        {doc === 'questions' && showAnswers && <AnswerKey pack={pack} rows={answers} />}
      </div>
      {exporting && <ExportDialog view={view} pack={pack} doc={doc} onPrint={setPrinting} onClose={() => setExporting(false)} />}
      {printing && (
        <div className="training-print hidden print:block">
          {printing.map((html, i) => (
            <article key={i} dangerouslySetInnerHTML={{ __html: html }} />
          ))}
        </div>
      )}
    </div>
  )
}

/** 「显示答案」: AI's answer key beside the 考核题 — 题号 · 答案 · 对应条款, shown only; printed after the questions in the 答案版. */
function AnswerKey({ pack, rows }: { pack: Pack; rows: AnswerRow[] }) {
  const { t } = useTranslation()
  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-auto border-l bg-background text-sm">
      <div className="flex items-baseline gap-2 border-b px-4 py-2.5">
        <h2 className="font-semibold">{t('training.answerKey.title')}</h2>
        <span className="text-xs text-muted-foreground">{t(pack.example ? 'training.answerKey.aiExample' : 'training.answerKey.ai')}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="w-12 py-1.5 pl-4 font-normal">{t('training.answerKey.n')}</th>
            <th className="px-2 py-1.5 font-normal">{t('training.answerKey.answer')}</th>
            <th className="py-1.5 pr-2 font-normal">{t('training.answerKey.clause')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n} className="border-b last:border-0">
              <td className="py-1.5 pl-4">{r.n}</td>
              <td className="px-2 py-1.5 font-medium">{r.answer}</td>
              <td className="py-1.5 pr-2 text-muted-foreground">{r.clause && t('training.answerKey.clauseValue', { clause: r.clause })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  )
}

const EXAM_PARTS = ['student', 'marking'] as const
type Part = 'material' | (typeof EXAM_PARTS)[number]

/** 导出 one confirmed document: as PDF (browser print) or Word; the 考核题 as 学员版, 答案版 or both. */
function ExportDialog({ view, pack, doc, onPrint, onClose }: { view: ChangeView; pack: Pack; doc: PackDoc; onPrint: (html: string[]) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const [parts, setParts] = useState<Set<Part>>(() => new Set([doc === 'material' ? 'material' : 'student']))
  const [format, setFormat] = useState<'pdf' | 'word'>('pdf')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const role = pack.audience.role
  const toggle = (p: Part, on: boolean) =>
    setParts((s) => {
      const next = new Set(s)
      if (on) next.add(p)
      else next.delete(p)
      return next
    })

  const run = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const source = loadDraft(packDocKey(view.record.id, role, doc))
      if (!source) throw new Error('missing working copy')
      const chosen = doc === 'material' ? (['material'] as Part[]) : EXAM_PARTS.filter((p) => parts.has(p))
      const results = []
      for (const part of chosen) results.push({ part, ...(await finished(source, part === 'marking' ? answerKeyHtml(t, aiAnswers(t, pack)) : null)) })
      if (format === 'word') for (const r of results) download(r.docx, t('training.exportDialog.fileName', { no: view.record.controlNo, role, part: t(`training.exportDialog.part.${r.part}`) }))
      else onPrint(results.map((r) => r.html))
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t(`training.exportDialog.title.${doc}`)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {doc === 'questions' && (
            <div className="flex gap-5">
              {EXAM_PARTS.map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={parts.has(p)} onCheckedChange={(v) => toggle(p, v === true)} />
                  {t(`training.exportDialog.version.${p}`)}
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2 text-xs">
            {(['pdf', 'word'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFormat(f)} className={cn('rounded-md border px-3 py-1', format === f && 'border-foreground bg-foreground text-background')}>
                {t(`training.exportDialog.formats.${f}`)}
              </button>
            ))}
          </div>
          {failed && <p className="text-xs text-destructive">{t('training.exportDialog.failed')}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('training.cancel')}
          </Button>
          <Button disabled={busy || (doc === 'questions' && parts.size === 0)} onClick={() => void run()}>
            {busy ? t('training.exportDialog.working') : t('training.export')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 培训记录: training happens outside the system (SMP-RY-004); its 签到表 / 考核记录 are scanned in once both documents are confirmed, the first marks the pack trained. */
function Records({ view, pack }: { view: ChangeView; pack: Pack }) {
  const { t } = useTranslation()
  return (
    <section className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b bg-background px-4 py-2 text-xs print:hidden">
      <span className="font-semibold" title={TRAINING_RULE ? t('training.rule', { rule: citation(TRAINING_RULE), text: TRAINING_RULE.text }) : undefined}>
        {t('training.records.title')}
      </span>
      <RecordList view={view} pack={pack} />
    </section>
  )
}
