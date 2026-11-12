import { Fragment, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext } from 'react-router'
import { Breadcrumb, Tag } from '@/components/common'
import { anchorId, anchorKey, parseAnchor } from '@/components/doc-anchor'
import { DocumentPaper } from '@/components/DocumentPaper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { displayCode } from '@/data/model'
import type { DraftFinding } from '@/domain/draft-check'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type SourceCheck, useDemo } from '@/store/demo'
import { draftCheckOf } from '../draft-check'
import type { ChangeView } from '../view'
import { NoteNumber } from './parts'

const PAPER = 'check'
const keyOf = (ref: string) => (ref === 'header' ? 'header' : `clause:${ref}`)

/** 「起草检查 2 条 · 未处理 2 →」 under the source row of 影响评估 (UX-58). */
export function SourceCheckRow({ view }: { view: ChangeView }) {
  const { t } = useTranslation()
  const { findings } = draftCheckOf(view.newVersion)
  if (findings.length === 0) return null
  const open = findings.filter((f) => !view.assessment.sourceChecks[f.id]).length
  return (
    <Link to="check" className="flex items-center gap-2 border-b px-4 py-2 hover:bg-muted/60">
      <span>{t('draftCheck.count', { count: findings.length })}</span>
      {open > 0 && <span className="font-medium">{t('draftCheck.openCount', { count: open })}</span>}
      <span className="ml-auto">→</span>
    </Link>
  )
}

/**
 * 起草检查 of the source's new version (UX-58): the draft as placed, with
 * each finding against the rule table. It came from Word, so nothing is
 * changed here: each finding is sent back to its drafter or kept, with why.
 * It does not hold the report's export.
 */
export function SourceCheckPage() {
  const { t } = useTranslation()
  const view = useOutletContext<ChangeView>()
  const version = view.newVersion
  const { findings, example } = draftCheckOf(version)
  const [active, setActive] = useState<string | null>(findings[0]?.id ?? null)
  const numbers = new Map(findings.map((f, i) => [f.id, i + 1]))
  const byAnchor = new Map<string, DraftFinding[]>()
  for (const f of findings) byAnchor.set(keyOf(f.clause), [...(byAnchor.get(keyOf(f.clause)) ?? []), f])
  const activeFinding = findings.find((f) => f.id === active)
  const focus = (f: DraftFinding) => {
    setActive(f.id)
    document.getElementById(anchorId(PAPER, parseAnchor(keyOf(f.clause))))?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <section className="flex h-full flex-col">
      <header className="shrink-0 space-y-1.5 border-b bg-background px-5 py-2.5 text-sm">
        <Breadcrumb items={[{ label: t('station.assess.name'), to: '..' }, { label: t('draftCheck.sourceTitle', { code: displayCode(version) }) }]} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">{version.name}</span>
          <span className="text-xs text-muted-foreground">{t('draftCheck.count', { count: findings.length })}</span>
          <span title={findings.map((f) => t(`draftCheck.ruleFull.${f.rule}`)).filter((x, i, all) => all.indexOf(x) === i).join('\n')} className="text-xs text-ai">
            {t(example ? 'draftCheck.aiMarkerExample' : 'draftCheck.aiMarker')}
          </span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto bg-canvas px-12 py-6">
          {version.document && (
            <DocumentPaper
              doc={version.document}
              idPrefix={PAPER}
              highlight={activeFinding ? new Set([keyOf(activeFinding.clause)]) : undefined}
              renderText={(anchor, text) => marked(text, (byAnchor.get(anchorKey(anchor)) ?? []).map((f) => f.word))}
              marginOf={(anchor) => {
                const here = byAnchor.get(anchorKey(anchor)) ?? []
                return here.length > 0 ? (
                  <span className="flex flex-col gap-1">
                    {here.map((f) => (
                      <NoteNumber key={f.id} n={numbers.get(f.id)!} dashed={f.origin === 'ai'} active={active === f.id} onClick={() => setActive(f.id)} />
                    ))}
                  </span>
                ) : null
              }}
            />
          )}
        </div>
        <aside className="w-[360px] shrink-0 space-y-3 overflow-auto border-l bg-background p-3 text-sm">
          {findings.length === 0 && <p className="text-muted-foreground">{t('draftCheck.none')}</p>}
          {findings.map((f) => (
            <FindingCard key={f.id} n={numbers.get(f.id)!} view={view} finding={f} active={active === f.id} onActivate={() => focus(f)} />
          ))}
        </aside>
      </div>
    </section>
  )
}

function FindingCard({ n, view, finding: f, active, onActivate }: { n: number; view: ChangeView; finding: DraftFinding; active: boolean; onActivate: () => void }) {
  const { t } = useTranslation()
  const { setSourceCheck, clearSourceCheck } = useDemo()
  const [keeping, setKeeping] = useState(false)
  const [reason, setReason] = useState('')
  const record: SourceCheck | undefined = view.assessment.sourceChecks[f.id]
  const link = 'underline-offset-2 hover:underline'
  return (
    <article onClick={onActivate} className={cn('cursor-default rounded-md border p-3', active ? 'border-foreground' : 'border-border')}>
      <div className="flex items-start gap-2">
        <NoteNumber n={n} dashed={f.origin === 'ai'} active={active} />
        <div className="min-w-0">
          <p className="font-medium" title={t(`draftCheck.ruleFull.${f.rule}`)}>
            {t(`draftCheck.rule.${f.rule}`)}
          </p>
          <p className="text-xs text-muted-foreground">{f.clause === 'body' ? t('assess.note.body') : t('doc.place.clause', { number: f.clause })}</p>
        </div>
        {record && <Tag className="ml-auto shrink-0">{t(`draftCheck.state.${record.state}`)}</Tag>}
      </div>
      <p className="mt-2 text-xs">{f.excerpt}</p>
      {f.suggestion && <p className="mt-1 text-ai">{t('draftCheck.suggestion', { text: f.suggestion })}</p>}
      {record ? (
        <div className="mt-2 text-xs text-muted-foreground">
          {record.note && <p>{t('draftCheck.why', { note: record.note })}</p>}
          <p>
            {t('draftCheck.by', { by: record.by, date: shortDate(record.on) })}
            <button type="button" className={cn(link, 'ml-2')} onClick={() => clearSourceCheck(view.record.id, f.id)}>
              {t('draftCheck.undo')}
            </button>
          </p>
        </div>
      ) : keeping ? (
        <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Input aria-label={t('draftCheck.reason')} value={reason} onChange={(e) => setReason(e.target.value)} className="h-7 text-xs" />
          <Button size="sm" disabled={!reason.trim()} onClick={() => setSourceCheck(view.record.id, f.id, 'kept', reason.trim())}>
            {t('draftCheck.save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setKeeping(false)}>
            {t('draftCheck.cancel')}
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex gap-3 text-xs">
          <button type="button" className={link} onClick={() => setSourceCheck(view.record.id, f.id, 'returned', '')}>
            {t('draftCheck.returnAction')}
          </button>
          <button type="button" className={link} onClick={() => setKeeping(true)}>
            {t('draftCheck.keepAction')}
          </button>
        </div>
      )}
    </article>
  )
}

function marked(text: string, words: string[]): ReactNode {
  if (words.length === 0 || !words.some((w) => text.includes(w))) return text
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)
  return text.split(pattern).map((part, i) =>
    words.includes(part) ? (
      <mark key={i} className="rounded-sm bg-mark px-0.5 text-foreground underline decoration-foreground/50 underline-offset-2">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}
