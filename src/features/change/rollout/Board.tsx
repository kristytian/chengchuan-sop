import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { addWorkdays, type CellState, cellState, daysBetween, dueDate, type RolloutGroup } from '@/domain/rollout'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDemo } from '@/store/demo'
import type { ChangeView } from '../view'
import { holderAlert, holderText } from './labels'
import { holderOf, obsoletedYear, planOf, RETURN_RULE, RETURN_WORKDAYS, summaryOf } from './model'
import { citation } from '../citations'
import { Block, CopyRow, IssueBlock, LegacyRow } from './register'

/** A cell of the board: a holder's copies of one group, or its legacy copies (group null). */
type Selected = { holder: string; group: string | null }

/**
 * 换版追踪 · 看板 (03 画面 16、17): departments down, 文件组 across, the
 * states written in each cell; late and legacy cells are dark. OA's approval
 * is registered once for the change, above the board; a cell opens a panel
 * where its department's issue and each old copy's scan are registered; the
 * department name opens its sign-off sheet (UX-52).
 */
export function Board({ view }: { view: ChangeView }) {
  const { t } = useTranslation()
  const plan = planOf(view)
  const summary = summaryOf(view)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [approving, setApproving] = useState(false)
  const unreviewed = view.toRevise - view.reviewed
  const anyIssued = Object.keys(view.rollout.issued).length > 0
  const hasLegacy = plan.legacy.length > 0
  const effective = new Set(Object.values(view.rollout.approvals).map((a) => a.effectiveOn))

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-auto px-6 py-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold">{t('rollout.title')}</h1>
          <span className="text-sm">
            {anyIssued ? t('rollout.summary.returned', { returned: summary.returned, copies: summary.copies }) : t('rollout.summary.plan', { ...summary })}
          </span>
          {summary.overdue > 0 && <span className="rounded-sm bg-foreground px-1.5 text-sm text-background">{t('rollout.summary.overdue', { count: summary.overdue })}</span>}
          {summary.legacy > 0 && <span className="text-sm">{t('rollout.summary.legacy', { count: summary.legacy })}</span>}
          <span className="ml-auto text-sm text-muted-foreground">{t('rollout.dates.today', { date: shortDate(view.today) })}</span>
        </div>
        {unreviewed > 0 && (
          <p className="mt-3 rounded-md border px-3 py-2 text-sm">
            {t('rollout.reviewing', { count: unreviewed })}{' '}
            <Link to="../revise" relative="path" className="font-medium hover:underline">
              {t('rollout.toReview')}
            </Link>
          </p>
        )}
        <ApprovalBar view={view} onApprove={() => setApproving(true)} />

        <table className="mt-4 w-full table-fixed border-collapse bg-background text-sm">
          <colgroup>
            <col className="w-36" />
            {plan.groups.map((g) => (
              <col key={g.id} />
            ))}
            {hasLegacy && <col className="w-40" />}
          </colgroup>
          <thead>
            <tr>
              <th className="border px-2.5 py-2 text-left align-top font-normal">
                <span className="block font-medium">{t('rollout.col.department')}</span>
              </th>
              {plan.groups.map((g) => (
                <GroupHead key={g.id} view={view} group={g} showDate={effective.size > 1} />
              ))}
              {hasLegacy && (
                <th className="border px-2.5 py-2 text-left align-top font-normal">
                  <span className="block font-medium">{t('rollout.col.legacy')}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {plan.departments.map((holder) => {
              const status = holderOf(view, holder)
              return (
                <tr key={holder}>
                  <th className="border px-2.5 py-2 text-left align-top font-normal">
                    <Link to={{ search: `?dept=${encodeURIComponent(holder)}` }} className="font-medium hover:underline">
                      {holder}
                    </Link>
                    <span className={cn('block text-xs', holderAlert(status) ? 'text-foreground' : 'text-muted-foreground')}>
                      {t('rollout.row.copies', { count: status.copies })} · {holderText(t, status)}
                    </span>
                  </th>
                  {plan.groups.map((g) => (
                    <td key={g.id} className="h-16 border p-0 align-top">
                      <Cell
                        state={cellState(plan, view.rollout, g.id, holder, view.today, RETURN_WORKDAYS)}
                        active={selected?.holder === holder && selected.group === g.id}
                        onClick={() => setSelected({ holder, group: g.id })}
                      />
                    </td>
                  ))}
                  {hasLegacy && (
                    <td className="h-16 border p-0 align-top">
                      <LegacyCell view={view} holder={holder} active={selected?.holder === holder && selected.group === null} onClick={() => setSelected({ holder, group: null })} />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {selected && <CellPanel view={view} selected={selected} onClose={() => setSelected(null)} />}
      {approving && <ApproveDialog view={view} onClose={() => setApproving(false)} />}
    </div>
  )
}

/**
 * Approval, once for the change: waiting for OA → 「登记批准」; registered →
 * the dates and the return deadline, and 「撤销」 until something is issued.
 */
function ApprovalBar({ view, onApprove }: { view: ChangeView; onApprove: () => void }) {
  const { t } = useTranslation()
  const withdrawApproval = useDemo((s) => s.withdrawApproval)
  const plan = planOf(view)
  const approvals = view.rollout.approvals
  const ready = plan.groups.filter((g) => g.members.every((m) => m.ready) && !approvals[g.id])
  const registered = [...new Map(Object.values(approvals).map((a) => [`${a.approvedOn}|${a.effectiveOn}`, a])).values()].sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn))
  const anyIssued = Object.keys(view.rollout.issued).length > 0
  const pending = plan.groups.length - Object.keys(approvals).length
  if (registered.length === 0 && ready.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-background px-3 py-2 text-sm">
      {registered.map((a) => (
        <span key={`${a.approvedOn}|${a.effectiveOn}`}>
          {t('rollout.dates.approved', { approved: shortDate(a.approvedOn), date: shortDate(a.effectiveOn), due: shortDate(addWorkdays(a.effectiveOn, RETURN_WORKDAYS)) })}
        </span>
      ))}
      {registered.length > 0 && pending > 0 && <span className="text-muted-foreground">{t('rollout.approval.pending', { count: pending })}</span>}
      {registered.length === 0 && <span>{t('rollout.approval.waiting')}</span>}
      <span className="ml-auto flex items-center gap-3">
        {registered.length > 0 && (
          <button
            type="button"
            disabled={anyIssued}
            title={anyIssued ? t('rollout.approval.withdrawHint') : undefined}
            onClick={() => Object.keys(approvals).forEach((g) => withdrawApproval(view.record.id, g))}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
          >
            {t('rollout.approval.withdraw')}
          </button>
        )}
        {ready.length > 0 && (
          <Button size="sm" onClick={onApprove}>
            {t('rollout.approval.register')}
          </Button>
        )}
      </span>
    </div>
  )
}

/** 「SOP-SB-021 组」 or the document's name, and the members with their new versions. */
function GroupHead({ view, group, showDate }: { view: ChangeView; group: RolloutGroup; showDate: boolean }) {
  const { t } = useTranslation()
  const approval = view.rollout.approvals[group.id]
  const single = group.members.length === 1
  return (
    <th className="border px-2.5 py-2 text-left align-top font-normal">
      <span className="block truncate font-medium" title={group.members.map((m) => m.old.name).join('\n')}>
        {single ? group.members[0].old.name : t('rollout.col.group', { id: group.id })}
      </span>
      {group.members.map((m) => (
        <span key={m.old.key} className="block truncate font-mono text-[11px] leading-4 text-muted-foreground">
          {m.old.identity} → {m.newVersion}
        </span>
      ))}
      {/* Only when groups take effect on different days; otherwise the date is above the board. */}
      {showDate && approval && <span className="mt-1 block text-xs text-muted-foreground">{t('rollout.head.effective', { date: shortDate(approval.effectiveOn) })}</span>}
    </th>
  )
}

function Cell({ state, active, onClick }: { state: CellState; active: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  if (state.kind === 'none') return null
  const dark = state.kind === 'toReturn' && state.overdueDays > 0
  const quiet = state.kind === 'reviewing' || state.kind === 'awaitingApproval' || state.kind === 'returned'
  const [label, ...detail] = cellLines(t, state)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-full min-h-16 w-full flex-col items-start px-2.5 py-2 text-left',
        dark ? 'bg-foreground text-background' : 'hover:bg-muted/60',
        quiet && 'text-muted-foreground',
        active && 'outline-2 -outline-offset-2 outline-ring',
      )}
    >
      <span className={cn('font-medium', !dark && !quiet && 'text-foreground')}>{label}</span>
      {detail.map((d) => (
        <span key={d} className="text-xs">
          {d}
        </span>
      ))}
    </button>
  )
}

function cellLines(t: TFunction, state: CellState): string[] {
  switch (state.kind) {
    case 'none':
      return []
    case 'reviewing':
      return [t('rollout.cell.reviewing')]
    case 'awaitingApproval':
      return [t('rollout.cell.awaiting')]
    case 'toIssue':
      return [t('rollout.cell.toIssue'), t('rollout.cell.newCopies', { count: state.count })]
    case 'toReturn':
      return state.overdueDays > 0
        ? [t('rollout.cell.overdue', { days: state.overdueDays }), t('rollout.cell.open', { count: state.open })]
        : [t('rollout.cell.toReturn'), t('rollout.cell.open', { count: state.open }), t('rollout.cell.due', { date: shortDate(state.due) })]
    case 'returned':
      return [t('rollout.cell.returned'), shortDate(state.on)]
  }
}

/** Obsolete copies the holder never returned: dark until a scan comes in. */
function LegacyCell({ view, holder, active, onClick }: { view: ChangeView; holder: string; active: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  const copies = planOf(view).legacy.filter((l) => l.holder === holder)
  if (copies.length === 0) return null
  const open = copies.filter((l) => !view.rollout.returns[l.copyNo])
  const last = copies.map((l) => view.rollout.returns[l.copyNo]?.on ?? '').sort().at(-1) ?? ''
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-full min-h-16 w-full flex-col items-start px-2.5 py-2 text-left',
        open.length > 0 ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/60',
        active && 'outline-2 -outline-offset-2 outline-ring',
      )}
    >
      {open.length > 0 ? (
        <>
          <span className="font-medium">{t('rollout.cell.legacyOpen', { count: open.length })}</span>
          {open.map((l) => {
            const year = obsoletedYear(l)
            return (
              <span key={l.copyNo} className="text-xs">
                <span className="block font-mono text-[11px]">{l.copyNo}</span>
                {year ? t('rollout.cell.legacyYear', { year }) : t('rollout.cell.legacyNoYear')}
              </span>
            )
          })}
        </>
      ) : (
        <>
          <span className="font-medium">{t('rollout.cell.returned')}</span>
          <span className="text-xs">{shortDate(last)}</span>
        </>
      )}
    </button>
  )
}

/**
 * 「乳膏车间乙班 × SOP-SC-041 组」: register right here — the department's
 * new copies issued (one sheet for all its groups), each old copy back with
 * its scan, notes — and see the deadline. The department's sheet is a link away.
 */
function CellPanel({ view, selected, onClose }: { view: ChangeView; selected: Selected; onClose: () => void }) {
  const { t } = useTranslation()
  const plan = planOf(view)
  const { holder, group } = selected
  const g = plan.groups.find((x) => x.id === group)
  const title = g
    ? t('rollout.info.title', { department: holder, group: g.members.length === 1 ? g.members[0].old.identity : t('rollout.col.group', { id: g.id }) })
    : t('rollout.info.legacyTitle', { department: holder })

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-auto border-l bg-background text-sm">
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline">
          {t('rollout.info.close')}
        </button>
      </header>
      {g ? (
        <>
          <Block title={t('rollout.register.issueTitle')}>
            <IssueBlock view={view} holder={holder} />
          </Block>
          <Block title={t('rollout.register.returnTitle')}>
            <ul className="divide-y">
              {plan.copies
                .filter((c) => c.group === g.id && c.holder === holder)
                .map((c) => (
                  <CopyRow key={c.copyNo} view={view} copy={c} showName />
                ))}
            </ul>
          </Block>
          <Deadline view={view} holder={holder} group={g} />
        </>
      ) : (
        <Block title={t('rollout.register.returnTitle')}>
          <ul className="divide-y">
            {plan.legacy
              .filter((l) => l.holder === holder)
              .map((l) => (
                <LegacyRow key={l.copyNo} view={view} copy={l} />
              ))}
          </ul>
        </Block>
      )}
      <Link to={{ search: `?dept=${encodeURIComponent(holder)}` }} className="mt-auto border-t px-4 py-2.5 text-xs font-medium hover:underline">
        {t('rollout.info.slipLink', { holder })}
      </Link>
    </aside>
  )
}

function Deadline({ view, holder, group }: { view: ChangeView; holder: string; group: RolloutGroup }) {
  const { t } = useTranslation()
  const record = view.rollout
  const due = dueDate(record, group.id, RETURN_WORKDAYS)
  const late = due ? daysBetween(due, view.today) : 0
  const open = planOf(view).copies.some((c) => c.group === group.id && c.holder === holder && !record.returns[c.copyNo])
  return (
    <dl className="grid grid-cols-[3rem_1fr] gap-y-1.5 border-b px-4 py-3">
      <dt className="text-muted-foreground">{t('rollout.info.due')}</dt>
      <dd title={RETURN_RULE ? t('rollout.slip.paper.basisValue', { rule: citation(RETURN_RULE), text: RETURN_RULE.text }) : undefined}>
        {!due ? (
          t('rollout.info.dueTbd', { days: RETURN_WORKDAYS })
        ) : (
          <>
            {t('rollout.info.dueOn', { date: shortDate(due) })}
            {late > 0 && open && record.issued[holder] && <span className="ml-2 rounded-sm bg-foreground px-1 text-background">{t('rollout.info.overdue', { days: late })}</span>}
          </>
        )}
      </dd>
    </dl>
  )
}

/** 登记批准: OA's approval date and the effective date — the whole change by default; untick groups OA has not approved yet. */
function ApproveDialog({ view, onClose }: { view: ChangeView; onClose: () => void }) {
  const { t } = useTranslation()
  const approveGroup = useDemo((s) => s.approveGroup)
  const candidates = planOf(view).groups.filter((g) => g.members.every((m) => m.ready) && !view.rollout.approvals[g.id])
  const [picked, setPicked] = useState(() => new Set(candidates.map((g) => g.id)))
  const [approvedOn, setApprovedOn] = useState(view.today)
  const [effectiveOn, setEffectiveOn] = useState('')
  const bad = !!effectiveOn && !!approvedOn && effectiveOn < approvedOn
  const ready = picked.size > 0 && approvedOn && effectiveOn && !bad
  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('rollout.approve.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-muted-foreground">{t('rollout.approve.approvedOn')}</span>
              <Input type="date" value={approvedOn} onChange={(e) => setApprovedOn(e.target.value)} className="mt-1" />
            </label>
            <label className="block">
              <span className="text-muted-foreground" title={RETURN_RULE ? t('rollout.approve.rule', { days: RETURN_WORKDAYS, rule: citation(RETURN_RULE) }) : t('rollout.approve.ruleNoCite', { days: RETURN_WORKDAYS })}>
                {t('rollout.approve.effectiveOn')}
              </span>
              <Input type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} className="mt-1" aria-invalid={bad} />
            </label>
          </div>
          {bad && <p className="text-xs text-destructive">{t('rollout.approve.badDates')}</p>}
          <div>
            <span className="text-muted-foreground">{t('rollout.approve.groups', { picked: picked.size, total: candidates.length })}</span>
            <ul className="mt-1 max-h-48 divide-y overflow-auto rounded-md border">
              {candidates.map((g) => (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-muted/60">
                    <Checkbox checked={picked.has(g.id)} onCheckedChange={(v) => toggle(g.id, v === true)} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block font-medium">{g.members.length === 1 ? g.members[0].old.name : t('rollout.col.group', { id: g.id })}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">{g.members.map((m) => `${m.old.identity} → ${m.newVersion}`).join(', ')}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('rollout.approve.cancel')}
          </Button>
          <Button
            disabled={!ready}
            onClick={() => {
              for (const id of picked) approveGroup(view.record.id, id, approvedOn, effectiveOn)
              onClose()
            }}
          >
            {t('rollout.approve.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
