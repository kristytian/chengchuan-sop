// QA's registration pieces, shared by the board's cell panel and a department's sign-off sheet (UX-52):
// issue once per department, one scan per returned old copy, notes on a copy.
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { canIssue, daysBetween, dueDate, type LegacyCopy, type RolloutCopy } from '@/domain/rollout'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDemo } from '@/store/demo'
import { saveUpload, type UploadRef } from '@/store/uploads'
import { FilePick, ScanLink } from '../files'
import type { ChangeView } from '../view'
import { holderOf, obsoletedYear, planOf, RETURN_WORKDAYS } from './model'

export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b px-4 py-3">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export function IssueBlock({ view, holder }: { view: ChangeView; holder: string }) {
  const { t } = useTranslation()
  const issueTo = useDemo((s) => s.issueTo)
  const undoIssue = useDemo((s) => s.undoIssue)
  const status = holderOf(view, holder)
  const issued = view.rollout.issued[holder]
  const anyReturned = planOf(view).copies.some((c) => c.holder === holder && view.rollout.returns[c.copyNo])
  const count = status.copies

  if (status.reviewing > 0) return <p className="text-xs text-muted-foreground">{t('rollout.register.reviewing', { count: status.reviewing })}</p>
  if (status.awaiting > 0) return <p className="text-xs text-muted-foreground">{t('rollout.register.locked', { count: status.awaiting })}</p>
  if (issued)
    return (
      <p className="flex items-baseline gap-2">
          <span>{t('rollout.register.issued', { count, date: shortDate(issued.on) })}</span>
          <button
            type="button"
            disabled={anyReturned}
            title={anyReturned ? t('rollout.register.undoIssueHint') : undefined}
            onClick={() => undoIssue(view.record.id, holder)}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
          >
            {t('rollout.register.undo')}
          </button>
      </p>
    )
  return (
    <div className="space-y-2">
      <Button size="sm" onClick={() => issueTo(view.record.id, holder)}>
        {t('rollout.register.issue', { count })}
      </Button>
    </div>
  )
}

/**
 * Upload a scan: kept in the browser, and the copy counts as returned today.
 * New and old usually change hands together, so a holder not yet registered as
 * issued is registered with it (`holder` given; legacy copies pass none).
 */
export function UploadScan({ view, copyNo, holder }: { view: ChangeView; copyNo: string; holder?: string }) {
  const { t } = useTranslation()
  const returnCopy = useDemo((s) => s.returnCopy)
  const issueTo = useDemo((s) => s.issueTo)
  const [busy, setBusy] = useState(false)
  return (
    <FilePick
      label={busy ? t('rollout.register.uploading') : t('rollout.register.upload')}
      disabled={busy}
      onPick={async (file) => {
        setBusy(true)
        const ref: UploadRef = await saveUpload(file)
        if (holder && !useDemo.getState().rollouts[view.record.id]?.issued[holder]) issueTo(view.record.id, holder, true)
        returnCopy(view.record.id, copyNo, ref)
        setBusy(false)
      }}
    />
  )
}

export function Returned({ view, copyNo }: { view: ChangeView; copyNo: string }) {
  const { t } = useTranslation()
  const undoReturn = useDemo((s) => s.undoReturn)
  const back = view.rollout.returns[copyNo]
  if (!back) return null
  return (
    <div className="mt-0.5 flex items-baseline gap-2 text-xs">
      <span className="shrink-0">{t('rollout.register.returnedOn', { date: shortDate(back.on) })}</span>
      <span className="min-w-0 flex-1">
        <ScanLink file={back.file} />
      </span>
      <button type="button" onClick={() => undoReturn(view.record.id, copyNo)} className="shrink-0 text-muted-foreground hover:text-foreground hover:underline">
        {t('rollout.register.undo')}
      </button>
    </div>
  )
}

/** An old copy: due once approved; its scan can come in from then on (issue is registered with it if need be). */
export function CopyRow({ view, copy, showName }: { view: ChangeView; copy: RolloutCopy; showName?: boolean }) {
  const { t } = useTranslation()
  const back = view.rollout.returns[copy.copyNo]
  const due = dueDate(view.rollout, copy.group, RETURN_WORKDAYS)
  const issued = !!view.rollout.issued[copy.holder]
  const open = !!due && (issued || canIssue(planOf(view), view.rollout, copy.holder))
  const late = due && !back && issued ? daysBetween(due, view.today) : 0
  const [noting, setNoting] = useState(false)
  const note = view.rollout.notes[copy.copyNo]

  return (
    <li className="py-2">
      <div className="flex items-baseline gap-2">
        <span className={cn('font-mono text-xs', back && 'text-muted-foreground')}>{copy.copyNo}</span>
        {!back && due && (
          <span className={cn('ml-auto shrink-0 text-xs', late > 0 ? 'rounded-sm bg-foreground px-1 text-background' : 'text-muted-foreground')}>
            {late > 0 ? t('rollout.register.overdue', { days: late }) : t('rollout.register.due', { date: shortDate(due) })}
          </span>
        )}
      </div>
      {showName && <span className="block text-xs text-muted-foreground">{copy.oldName}</span>}
      {back ? (
        <Returned view={view} copyNo={copy.copyNo} />
      ) : open ? (
        <div className="mt-1 flex items-center gap-2">
          <UploadScan view={view} copyNo={copy.copyNo} holder={copy.holder} />
          {!noting && !note && (
            <button type="button" onClick={() => setNoting(true)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              {t('rollout.register.note')}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-0.5 text-xs text-muted-foreground">{t('rollout.register.notIssued')}</p>
      )}
      {(noting || note) && <NoteEditor view={view} copyNo={copy.copyNo} onDone={() => setNoting(false)} />}
    </li>
  )
}

export function LegacyRow({ view, copy }: { view: ChangeView; copy: LegacyCopy }) {
  const { t } = useTranslation()
  const back = view.rollout.returns[copy.copyNo]
  const year = obsoletedYear(copy)
  return (
    <li className="py-2">
      <span className={cn('block font-mono text-xs', back && 'text-muted-foreground')}>{copy.copyNo}</span>
      <span className="block text-xs text-muted-foreground">
        {year ? t('rollout.register.legacyMeta', { version: copy.version, year }) : t('rollout.register.legacyMetaNoYear', { version: copy.version })}
      </span>
      {copy.remark && <span className="block text-xs">{t('rollout.register.ledgerRemark', { remark: copy.remark })}</span>}
      {back ? (
        <Returned view={view} copyNo={copy.copyNo} />
      ) : (
        <div className="mt-1">
          <UploadScan view={view} copyNo={copy.copyNo} />
        </div>
      )}
      <NoteEditor view={view} copyNo={copy.copyNo} />
    </li>
  )
}

/** 备注 on a copy: what the department said, what was agreed. */
export function NoteEditor({ view, copyNo, onDone }: { view: ChangeView; copyNo: string; onDone?: () => void }) {
  const { t } = useTranslation()
  const setCopyNote = useDemo((s) => s.setCopyNote)
  const saved = view.rollout.notes[copyNo] ?? ''
  const [text, setText] = useState(saved)
  return (
    <div className="mt-1.5">
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('rollout.register.notePlaceholder')} className="min-h-0 text-xs" />
      <div className="mt-1 flex justify-end">
        <Button
          size="xs"
          variant="outline"
          disabled={text.trim() === saved}
          onClick={() => {
            setCopyNote(view.record.id, copyNo, text.trim())
            onDone?.()
          }}
        >
          {t('rollout.register.save')}
        </Button>
      </div>
    </div>
  )
}
