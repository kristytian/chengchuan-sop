import type { TFunction } from 'i18next'
import { MessageSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext } from 'react-router'
import { Tag } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { displayCode, versionByKey } from '@/data/model'
import { type Decision, needsLook, REPORT_GROUPS, type ReportEntry } from '@/domain/assessment'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDemo } from '@/store/demo'
import { CHANGE_SIDE } from '../layout'
import { type ChangeView, sourceLabel } from '../view'
import { AddEntryDialog } from './AddEntryDialog'
import { canEditReport, departments, entryAnchor } from './model'
import { AssessGenerating } from './Generating'
import { SourceCheckRow } from './SourceCheck'
import { TrainingChoice } from './TrainingChoice'
import { ReportDocument } from './ReportView'

/**
 * 影响评估 (UX-50): AI and the rules have already written the report. Left:
 * the entries by tier, flagged ones marked 「需核对」. Right: the report
 * itself. QA takes entries off or puts documents on, then confirms and exports
 * it once (version 1, locked).
 */
export function AssessPage() {
  const { t } = useTranslation()
  const view = useOutletContext<ChangeView>()
  const exportReport = useDemo((s) => s.exportReport)
  const editable = canEditReport(view.stage === 'exported')
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const { entries, removed } = view.report

  const select = (version: string) => {
    setSelected(version)
    document.getElementById(entryAnchor(version))?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  if (view.ai.assess) return <AssessGenerating view={view} progress={view.ai.assess} />

  return (
    <div className="flex h-full print:block print:h-auto">
      <aside className={cn(CHANGE_SIDE, 'flex shrink-0 flex-col border-r bg-background text-sm print:hidden')}>
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <span className="text-muted-foreground">{t('assess.source')}</span>
          <span className="font-mono text-xs">{sourceLabel(view)}</span>
          <span className="text-muted-foreground">{t('assess.changes', { count: view.changeCount })}</span>
          <Link to="compare" className="ml-auto font-medium hover:underline">
            {t('assess.compareLink')}
          </Link>
        </div>
        <SourceCheckRow view={view} />
        <div className="border-b px-4 py-2.5">
          <p className="flex items-baseline gap-2">
            <span className="font-semibold">{t('assess.listTitle')}</span>
            <span>{t('assess.count', { count: entries.length })}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {view.stage === 'exported' ? (
              t('assess.stateExported', { date: shortDate(view.assessment.exportedOn ?? '') })
            ) : (
              <>
                {t('assess.stateDraft')}
                {view.lookTwice > 0 && (
                  <span className="ml-1.5 inline-flex items-center gap-1">
                    · <CheckDot /> {t('assess.toCheck', { count: view.lookTwice })}
                  </span>
                )}
                {view.unevaluated > 0 && <span className="ml-1.5 text-foreground">· {t('assess.stateEvaluate', { count: view.unevaluated })}</span>}
              </>
            )}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {REPORT_GROUPS.map((g) => {
            // Entries to check come first in their group.
            const inGroup = entries.filter((e) => e.group === g).sort((a, b) => Number(needsLook(b)) - Number(needsLook(a)))
            if (inGroup.length === 0) return null
            return (
              <div key={g}>
                <p className="border-b bg-muted/30 px-4 py-1.5 text-xs font-medium">
                  {t(`report.group.${g}`)} <span className="font-normal text-muted-foreground">{inGroup.length}</span>
                </p>
                {inGroup.map((e) => (
                  <Row key={e.version} view={view} entry={e} editable={editable} active={selected === e.version} onSelect={() => select(e.version)} />
                ))}
              </div>
            )
          })}
          {removed.length > 0 && (
            <div>
              <p className="border-b bg-muted/30 px-4 py-1.5 text-xs font-medium">
                {t('assess.group.removed')} <span className="font-normal text-muted-foreground">{removed.length}</span>
              </p>
              {removed.map(({ entry, decision }) => (
                <Row key={entry.version} view={view} entry={entry} removal={decision} editable={editable} active={selected === entry.version} onSelect={() => select(entry.version)} />
              ))}
            </div>
          )}
        </div>

        {editable && (
          <div className="border-t px-4 py-2.5">
            {/* Every evaluate entry needs its conclusion before the report can go out. */}
            {view.unevaluated > 0 && <p className="mb-2 text-xs text-muted-foreground">{t('assess.confirm.blocked', { count: view.unevaluated })}</p>}
            {view.withoutPoints > 0 && <p className="mb-2 text-xs text-muted-foreground">{t('assess.confirm.blockedPoints', { count: view.withoutPoints })}</p>}
            <TrainingChoice view={view} />
            {/* The confirm button stays here, in the column that does not scroll with the report (UX-62). */}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                {t('assess.add.button')}
              </Button>
              <Button
                size="sm"
                className="ml-auto"
                disabled={view.unevaluated > 0 || view.withoutPoints > 0 || view.trainingUndecided}
                title={
                  view.unevaluated > 0
                    ? t('assess.confirm.blocked', { count: view.unevaluated })
                    : view.withoutPoints > 0
                      ? t('assess.confirm.blockedPoints', { count: view.withoutPoints })
                      : view.trainingUndecided
                        ? t('assess.confirm.blockedTraining')
                        : t('assess.confirm.hint')
                }
                onClick={() => exportReport(view.record.id)}
              >
                {t('assess.confirm.button')}
              </Button>
            </div>
          </div>
        )}
      </aside>

      <section className="min-w-0 flex-1 overflow-auto bg-canvas py-6 print:overflow-visible print:bg-transparent print:py-0">
        <ReportDocument view={view} selected={selected} onSelect={select} />
      </section>
      {adding && <AddEntryDialog view={view} onClose={() => setAdding(false)} />}
    </div>
  )
}

/**
 * One entry in the list. Selected, it opens its actions — 看原件和依据, 写备注,
 * 移出报告 (撤销加入 / 放回报告 for added and removed ones); the report on the
 * right stays a plain document.
 */
function Row({
  view,
  entry,
  removal,
  editable,
  active,
  onSelect,
}: {
  view: ChangeView
  entry: ReportEntry
  removal?: Decision
  editable: boolean
  active: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const version = versionByKey(entry.version)
  if (!version) return null
  const removed = removal !== undefined
  return (
    <div className={cn('border-b', active && 'bg-muted')}>
      <button type="button" onClick={onSelect} className={cn('block w-full px-4 py-2 text-left hover:bg-muted/60', removed && 'text-muted-foreground')}>
        <span className="-ml-3 flex items-center gap-1.5">
          <span className="flex w-1.5 shrink-0 justify-center">{!removed && needsLook(entry) && <CheckDot title={lookReasons(t, entry)} />}</span>
          <span className={cn('font-mono text-xs', removed && 'line-through')}>{displayCode(version)}</span>
          {entry.origin === 'added' && <Tag className="text-[11px]">{t('assess.flag.added')}</Tag>}
          {entry.conclusion && <Tag className="text-[11px]">{t('assess.flag.concluded')}</Tag>}
          {!removed && entry.comment && <MessageSquare aria-label={t('assess.action.comment')} className="size-3.5 text-muted-foreground" />}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{version.name}</span>
      </button>
      {active && <RowActions view={view} entry={entry} identity={version.identity} removal={removal} editable={editable} />}
    </div>
  )
}

function RowActions({ view, entry, identity, removal, editable }: { view: ChangeView; entry: ReportEntry; identity: string; removal?: Decision; editable: boolean }) {
  const { t } = useTranslation()
  const { removeEntry, restoreEntry, dropAdded, setComment, concludeEntry, withdrawConclusion } = useDemo()
  const [mode, setMode] = useState<'idle' | 'comment' | 'remove' | 'conclude'>('idle')
  const [text, setText] = useState('')
  // 备注 typed and then clicked away from is kept for the next 写备注, until saved or cancelled.
  const typed = useRef(false)
  const form = useRef<HTMLDivElement>(null)
  const id = view.record.id
  const removed = removal !== undefined
  const conclusion = entry.conclusion
  const idle = () => {
    typed.current = false
    setMode('idle')
  }

  // A click anywhere outside the open form folds it back into the row's buttons (UX-62).
  useEffect(() => {
    if (mode === 'idle') return
    const away = (e: PointerEvent) => {
      if (!form.current?.contains(e.target as Node)) setMode('idle')
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [mode])

  const notes = [
    !removed && needsLook(entry) && <p key="look" className="text-muted-foreground">{lookReasons(t, entry)}</p>,
    removal && <DecisionNote key="removed" title={t('assess.decision.removed')} decision={removal} />,
    entry.origin === 'added' && <p key="added">{t('assess.action.addedReason', { reason: entry.reason })}</p>,
    !removed && entry.comment && mode !== 'comment' && (
      <p key="comment" className="border-l-2 border-foreground/60 pl-1.5">
        {entry.comment}
      </p>
    ),
    conclusion && <DecisionNote key="conclusion" title={t('assess.conclude.moved', { tier: t(`report.group.${conclusion.tier}`) })} decision={conclusion} />,
  ].filter(Boolean)

  return (
    <div className="px-4 pb-3 text-xs">
      {notes.length > 0 && <div className="space-y-1.5">{notes}</div>}
      {mode === 'idle' ? (
        // The row's buttons, apart from what is written about it: open the page first, the removing ones last.
        <div className={cn('flex flex-wrap items-center gap-1.5', notes.length > 0 && 'mt-2.5')}>
          {/* A document put on by hand has the page too: its change points are written there (UX-57). */}
          {(entry.origin === 'generated' || !removed) && (
            <Button asChild size="xs" variant="outline">
              <Link to={`doc/${identity}`}>{t('assess.action.open')}</Link>
            </Button>
          )}
          {editable && !removed && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                if (!typed.current) setText(entry.comment)
                setMode('comment')
              }}
            >
              {t(entry.comment ? 'assess.action.editComment' : 'assess.action.comment')}
            </Button>
          )}
          {editable && !removed && entry.group === 'evaluate' && (
            <Button size="xs" variant="outline" onClick={() => setMode('conclude')}>
              {t('assess.conclude.action')}
            </Button>
          )}
          {editable && conclusion && (
            <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => withdrawConclusion(id, entry.version)}>
              {t('assess.conclude.withdraw')}
            </Button>
          )}
          {editable && !removed && entry.origin === 'generated' && (
            <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setMode('remove')}>
              {t('assess.action.remove')}
            </Button>
          )}
          {editable && entry.origin === 'added' && (
            <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => dropAdded(id, entry.version)}>
              {t('assess.action.undoAdd')}
            </Button>
          )}
          {editable && removed && (
            <Button size="xs" variant="outline" onClick={() => restoreEntry(id, entry.version)}>
              {t('assess.action.restore')}
            </Button>
          )}
        </div>
      ) : (
        <div ref={form} className={cn('rounded-md border bg-background p-2', notes.length > 0 && 'mt-2.5')}>
          {mode === 'conclude' && (
            <DecisionForm
              choices={['mustChange', 'inform']}
              save={t('assess.conclude.save')}
              onCancel={idle}
              onSave={(by, note, tier) => {
                concludeEntry(id, entry.version, tier ?? 'mustChange', by, note)
                idle()
              }}
            />
          )}
          {mode === 'remove' && (
            <DecisionForm
              save={t('assess.action.removeConfirm')}
              onCancel={idle}
              onSave={(by, note) => {
                removeEntry(id, entry.version, by, note)
                idle()
              }}
            />
          )}
          {mode === 'comment' && (
            <div className="space-y-1.5">
              <Textarea
                autoFocus
                rows={2}
                value={text}
                onChange={(e) => {
                  typed.current = true
                  setText(e.target.value)
                }}
                placeholder={t('assess.action.commentPlaceholder')}
                className="min-h-0 bg-background text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={idle}>
                  {t('assess.action.cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setComment(id, entry.version, text.trim())
                    idle()
                  }}
                >
                  {t('assess.action.save')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 「移出（质量管理部决定 · 11-04）」 and the 备注 under it, if any. */
function DecisionNote({ title, decision }: { title: string; decision: Decision }) {
  const { t } = useTranslation()
  return (
    <div className="border-l-2 border-foreground pl-1.5">
      <p>
        <span className="font-medium">{title}</span>
        <span className="ml-1.5 text-muted-foreground">{t('assess.decision.by', { by: decision.by, date: shortDate(decision.on) })}</span>
      </p>
      {decision.note && <p>{decision.note}</p>}
    </div>
  )
}

/**
 * A decision on an entry: what (the choice, for a 评估结论), which department
 * decided, and an optional 备注 — nothing else to write, the choice says it.
 */
function DecisionForm({
  choices,
  save,
  onCancel,
  onSave,
}: {
  choices?: readonly ('mustChange' | 'inform')[]
  save: string
  onCancel: () => void
  onSave: (by: string, note: string, tier?: 'mustChange' | 'inform') => void
}) {
  const { t } = useTranslation()
  const options = departments()
  const [tier, setTier] = useState(choices?.[0])
  const [by, setBy] = useState(options[0])
  const [note, setNote] = useState('')
  return (
    <div className="space-y-1.5">
      {choices && (
        <div role="radiogroup" className="space-y-1">
          {choices.map((x) => (
            <label key={x} className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" checked={tier === x} onChange={() => setTier(x)} className="accent-foreground" />
              {t(`assess.conclude.${x}`)}
            </label>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2">
        <span className="shrink-0 text-muted-foreground">{t('assess.decision.department')}</span>
        <select value={by} onChange={(e) => setBy(e.target.value)} className="min-w-0 flex-1 rounded-md border bg-background px-1.5 py-1 text-sm">
          {options.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('assess.decision.notePlaceholder')} className="min-h-0 bg-background text-sm" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('assess.action.cancel')}
        </Button>
        <Button size="sm" onClick={() => onSave(by, note.trim(), tier)}>
          {save}
        </Button>
      </div>
    </div>
  )
}

/**
 * What to look at, in concrete terms: 「只写了设备型号，没写编号 · 库里找不到 STP-GY-012-02」.
 * AI's own uncertainty is never shown as such (UX-50); it only puts the entry on the look list.
 */
function lookReasons(t: TFunction, entry: ReportEntry): string {
  const reasons: string[] = []
  if (entry.group === 'undetermined') reasons.push(t('assess.flag.undetermined'))
  if (entry.flags.includes('modelOnly')) reasons.push(t('assess.flag.modelOnly'))
  if (entry.flags.includes('notFound')) reasons.push(t('assess.flag.notFoundCode', { codes: entry.notFound.join(t('common.listSep')) }))
  if (reasons.length === 0) reasons.push(t('assess.flag.checkBasis'))
  return reasons.join(' · ')
}

/** The mark of an entry to check (UX-50): a dot before its number, the concrete reason on hover. */
function CheckDot({ title }: { title?: string }) {
  const { t } = useTranslation()
  return <span role="img" aria-label={t('assess.flag.check')} title={title ?? t('assess.flag.check')} className="inline-block size-1.5 shrink-0 rounded-full bg-foreground" />
}
