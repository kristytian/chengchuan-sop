import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { displayCode } from '@/data/model'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDemo } from '@/store/demo'
import { plannedStatuses } from './review/points'
import { reviewTargets } from './review/model'
import { effectiveDate, planOf } from './rollout/model'
import { packsOf } from './training/model'
import { type ChangeView, changeNumber, closable, STATIONS, stationDone, type StationId, stationLine } from './view'

/**
 * 收尾 (03 画面 23): when every station is done the change shows 可关闭 —
 * only a hint: closing is the QA head's signature on the 变更控制单, and QA
 * records its date here. Until then, what is still open.
 */
export function Closing({ view }: { view: ChangeView }) {
  const { t } = useTranslation()
  const closeChange = useDemo((s) => s.closeChange)
  const reopenChange = useDemo((s) => s.reopenChange)
  const [on, setOn] = useState(view.today)
  const { record } = view
  const open = STATIONS.filter((s) => s !== 'overview' && !stationDone(view, s))

  return (
    <section className="rounded-lg border bg-background">
      <h2 className="border-b px-4 py-2.5 text-sm font-semibold">
        {t('overview.closing')}
        {record.closedOn ? <span className="ml-2 font-normal">{t('closing.closedTag', { date: record.closedOn })}</span> : closable(view) && <span className="ml-2 font-normal">{t('closing.closableTag')}</span>}
      </h2>
      <div className="space-y-2.5 px-4 py-3 text-sm">
        {record.closedOn ? (
          <>
            <p>{t('closing.closed', { date: record.closedOn })}</p>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                {t('closing.print')}
              </Button>
              <button type="button" onClick={() => reopenChange(record.id)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                {t('closing.reopen')}
              </button>
            </div>
          </>
        ) : closable(view) ? (
          <>
            <p>{t('closing.allDone', { date: shortDate(view.today) })}</p>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              {t('closing.print')}
            </Button>
            <div className="flex items-center gap-2 border-t pt-2.5">
              <span className="shrink-0 text-xs text-muted-foreground">{t('closing.signedOn')}</span>
              <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="h-8 w-40" />
              <Button size="sm" disabled={!on} onClick={() => closeChange(record.id, on)}>
                {t('closing.close')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">{t('overview.closingOpen')}</p>
            <ul className="space-y-0.5 text-xs">
              {open.map((s) => (
                <li key={s}>{t('closing.openLine', { name: t(`station.${s}.name`), line: stationLine(t, view, s) })}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

/** 变更收尾总览: one A4 page attached to the 变更控制单; shown below the overview, and all that prints. */
export function ClosingSummary({ view }: { view: ChangeView }) {
  const { t } = useTranslation()
  const { record } = view
  const targets = reviewTargets(view, view.reviews)
  const plan = planOf(view)
  const returns = view.rollout.returns
  const lastReturn = plan.copies.map((c) => returns[c.copyNo]?.on ?? '').sort().at(-1) ?? ''
  const reviewedOn = targets.map((x) => x.review.reviewedOn ?? '').sort()
  const approvedOn = [...new Set(Object.values(view.rollout.approvals).map((a) => a.approvedOn))].sort()
  const packs = packsOf(view)
  const records = packs.flatMap((p) => p.record.records)
  const lastRecord = records.map((r) => r.on).sort().at(-1) ?? ''
  const effective = effectiveDate(view)
  const sep = t('common.listSep')
  const legacy = plan.legacy.map((l) => t('closing.sum.legacyLine', { copy: l.copyNo, holder: l.holder, note: view.rollout.notes[l.copyNo] ?? (returns[l.copyNo] ? t('closing.sum.legacyReturned', { date: shortDate(returns[l.copyNo].on) }) : t('closing.sum.legacyOpen')) }))
  // Where a draft departs from the signed report, QA 负责人 sees it here (UX-57).
  const declined = targets.flatMap((x) =>
    plannedStatuses(x.points, x.ops, x.review.closures, x.review.settled)
      .filter((p) => p.status === 'declined')
      .map((p) => t('closing.sum.declinedLine', { code: displayCode(x.version), place: p.clause === 'header' ? t('assess.note.header') : p.clause === 'body' ? t('assess.note.body') : t('doc.place.clause', { number: p.clause }), point: p.label, note: p.closure?.note ?? '' })),
  )
  const declinedText = declined.length > 0 ? t('closing.sum.reviseDeclined', { count: declined.length, lines: declined.join(sep) }) : ''
  const rows: [StationId, string][] = [
    ['assess', t('closing.sum.assess', { count: view.report.entries.length, date: shortDate(view.assessment.exportedOn ?? '') })],
    ['revise', t('closing.sum.revise', { count: targets.length, reviewed: rangeText(reviewedOn), approved: rangeText(approvedOn) }) + declinedText],
    [
      'rollout',
      t('closing.sum.rollout', { groups: plan.groups.length, departments: plan.departments.length, copies: plan.copies.length, last: shortDate(lastReturn) }) +
        (plan.legacy.length > 0 ? t('closing.sum.rolloutLegacy', { count: plan.legacy.length }) : ''),
    ],
    [
      'training',
      view.assessment.training?.needed === false
        ? t('closing.sum.trainingSkipped', { note: view.assessment.training.note })
        : t('closing.sum.training', {
            count: packs.length,
            packs: packs.map((p) => p.audience.role).join(sep),
            records: records.length,
            last: shortDate(lastRecord),
          }),
    ],
  ]
  // As numbered with the version, records too (SOR-SB-021-R01-03).
  const versions = [displayCode(view.newVersion), ...targets.map((x) => `${x.version.identity}-${x.newVersion}`)]

  return (
    <article className="mx-auto mb-8 w-[680px] border bg-background px-10 py-8 text-[13px] leading-relaxed shadow-sm print:m-0 print:w-auto print:border-0 print:px-1 print:py-0 print:shadow-none">
      <p className="text-center text-xs tracking-widest text-muted-foreground">{t('assess.report.company')}</p>
      <h2 className="mt-1 text-center text-lg font-semibold">{t('closing.sum.title')}</h2>
      <table className="mt-4 w-full border-collapse">
        <tbody>
          <tr>
            <Th>{t('overview.controlNo')}</Th>
            <Td>{changeNumber(t, record)}</Td>
            <Th>{t('overview.type')}</Th>
            <Td>{t('overview.typeRevision')}</Td>
          </tr>
          <tr>
            <Th>{t('closing.sum.content')}</Th>
            <Td colSpan={3}>{record.title}</Td>
          </tr>
          <tr>
            <Th>{t('closing.sum.initiated')}</Th>
            <Td>
              {record.requestedBy} · {record.initiatedOn}
            </Td>
            <Th>{t('closing.sum.effective')}</Th>
            <Td>{effective ?? t('overview.effectivePending')}</Td>
          </tr>
          <tr>
            <Th>{t('closing.sum.printed')}</Th>
            <Td>{view.today}</Td>
            <Th>{t('closing.sum.state')}</Th>
            <Td>{record.closedOn ? t('closing.closedTag', { date: record.closedOn }) : t('closing.closableTag')}</Td>
          </tr>
        </tbody>
      </table>

      <h3 className="mt-5 font-semibold">{t('closing.sum.stations')}</h3>
      <table className="mt-1.5 w-full border-collapse">
        <thead>
          <tr>
            <Th>{t('closing.sum.station')}</Th>
            <Th className="w-auto">{t('closing.sum.result')}</Th>
            <Th className="w-14">{t('closing.sum.status')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([s, text]) => (
            <tr key={s}>
              <Td>{t(`station.${s}.name`)}</Td>
              <Td>{text}</Td>
              <Td>{t('overview.state.done')}</Td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-5 font-semibold">{t('closing.sum.versions', { count: versions.length })}</h3>
      <p className="mt-1">
        {versions.join(sep)}
        {effective && t('closing.sum.versionsEffective', { date: effective })}
      </p>

      <h3 className="mt-5 font-semibold">{t('closing.sum.leftovers')}</h3>
      {legacy.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {legacy.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1">{t('closing.sum.none')}</p>
      )}

      <h3 className="mt-5 font-semibold">{t('closing.sum.closeTitle')}</h3>
      <p className="mt-1">{t('closing.sum.closeText')}</p>
      <p className="mt-4 flex gap-10">
        <span>
          {t('closing.sum.head')}
          <Blank />
        </span>
        <span>
          {t('closing.sum.date')}
          <Blank />
        </span>
      </p>
      <p className="mt-6 border-t pt-1.5 text-right font-mono text-[11px] text-muted-foreground">
        {record.controlNo} · {t('closing.sum.title')}
      </p>
    </article>
  )
}

/** 「11-21」 or 「11-21 至 11-28」. */
function rangeText(dates: string[]): string {
  const ds = dates.filter(Boolean)
  if (ds.length === 0) return ''
  const [first, last] = [ds[0], ds.at(-1)!]
  return first === last ? shortDate(first) : `${shortDate(first)}–${shortDate(last)}`
}

const Blank = () => <span className="ml-1 inline-block w-28 border-b border-foreground/60 align-bottom" />

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn('w-24 border border-foreground/40 bg-muted/50 px-2 py-1 text-left font-normal whitespace-nowrap print:bg-transparent', className)}>{children}</th>
}

function Td({ children, colSpan }: { children?: ReactNode; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className="border border-foreground/40 px-2 py-1">
      {children}
    </td>
  )
}
