import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { canIssue } from '@/domain/rollout'
import { TERMS } from '@/domain/source-terms'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RolloutLogEntry } from '@/store/demo'
import { CHANGE_SIDE } from '../layout'
import type { ChangeView } from '../view'
import { holderAlert, holderText } from './labels'
import { BLANK_RECORD_RULE, holderOf, planOf, RETURN_RULE, slipNumber } from './model'
import { citation } from '../citations'
import { Block, CopyRow, IssueBlock, LegacyRow } from './register'

/**
 * 换版追踪 · 一个部门 (03 画面 18): the departments on the left; in the middle
 * its 文件发放回收签收单, printable once every group it holds is approved;
 * on the right what QA registers — new copies issued (once, with the signed
 * sheet if kept) and each old copy back with its scan (UX-52).
 */
export function SlipPage({ view, holder }: { view: ChangeView; holder: string }) {
  const { t } = useTranslation()
  const plan = planOf(view)
  const status = holderOf(view, holder)
  const printable = canIssue(plan, view.rollout, holder) && status.reviewing === 0

  return (
    <div className="flex h-full print:block print:h-auto">
      <aside className={cn(CHANGE_SIDE, 'flex shrink-0 flex-col overflow-auto border-r bg-background text-sm print:hidden')}>
        <div className="border-b px-4 py-2.5">
          <Link to={{ search: '' }} className="text-muted-foreground hover:text-foreground hover:underline">
            {t('rollout.slip.back')}
          </Link>
          <p className="mt-1 font-semibold">{t('rollout.slip.list', { count: plan.departments.length })}</p>
        </div>
        <table className="w-full">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 pr-2 pl-4 font-normal">{t('rollout.slip.col.department')}</th>
              <th className="py-1.5 pr-4 pl-2 font-normal">{t('rollout.slip.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {plan.departments.map((d) => {
              const s = holderOf(view, d)
              return (
                <tr key={d} className={cn('border-b', d === holder && 'bg-muted')}>
                  <td className="py-2 pr-2 pl-4">
                    <Link to={{ search: `?dept=${encodeURIComponent(d)}` }} className={cn('hover:underline', d === holder && 'font-medium')}>
                      {d}
                    </Link>
                  </td>
                  <td className={cn('py-2 pr-4 pl-2 text-xs', holderAlert(s) ? 'font-medium' : 'text-muted-foreground')}>{holderText(t, s)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto bg-muted/40 print:overflow-visible print:bg-transparent">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-5 py-2.5 print:hidden">
          <h1 className="truncate text-sm font-semibold">{t('rollout.slip.heading', { department: holder })}</h1>
          <span className="font-mono text-xs text-muted-foreground">{slipNumber(view, holder)}</span>
          <span className="text-sm text-muted-foreground">{t('rollout.slip.progress', { returned: plan.copies.filter((c) => c.holder === holder && view.rollout.returns[c.copyNo]).length, copies: status.copies })}</span>
          <span className="ml-auto text-xs text-muted-foreground">{!printable && t('rollout.slip.printLocked')}</span>
          <Button size="sm" variant="outline" disabled={!printable} onClick={() => window.print()}>
            {t('rollout.slip.print')}
          </Button>
        </div>
        <Slip view={view} holder={holder} />
      </main>

      <Register view={view} holder={holder} />
    </div>
  )
}

/** The sheet as printed: what goes out, what comes back, blank record forms; signatures by hand. */
function Slip({ view, holder }: { view: ChangeView; holder: string }) {
  const { t } = useTranslation()
  const plan = planOf(view)
  const copies = plan.copies.filter((c) => c.holder === holder)
  const legacy = plan.legacy.filter((l) => l.holder === holder)
  const groups = [...new Set(copies.map((c) => c.group))]
  const approvals = groups.map((g) => view.rollout.approvals[g])
  const effective = approvals.every(Boolean) ? [...new Set(approvals.map((a) => a!.effectiveOn))].sort().join(t('common.pointSep')) : t('rollout.slip.paper.pending')

  return (
    <article className="mx-auto my-5 w-[680px] border bg-background px-10 py-8 text-[13px] leading-relaxed shadow-sm print:m-0 print:w-auto print:border-0 print:px-1 print:py-0 print:shadow-none">
      <p className="text-center text-xs tracking-widest text-muted-foreground">{t('assess.report.company')}</p>
      <h2 className="mt-1 text-center text-lg font-semibold tracking-wide">{t('rollout.slip.paper.title')}</h2>
      <table className="mt-4 w-full border-collapse">
        <tbody>
          <tr>
            <Th>{t('rollout.slip.paper.no')}</Th>
            <Td mono>{slipNumber(view, holder)}</Td>
            <Th>{t('rollout.slip.paper.controlNo')}</Th>
            <Td mono>{view.record.controlNo}</Td>
          </tr>
          <tr>
            <Th>{t('rollout.slip.paper.holder')}</Th>
            <Td>{holder}</Td>
            <Th>{t('rollout.slip.paper.effective')}</Th>
            <Td>{effective}</Td>
          </tr>
          {RETURN_RULE && (
            <tr>
              <Th>{t('rollout.slip.paper.basis')}</Th>
              <Td colSpan={3}>{t('rollout.slip.paper.basisValue', { rule: citation(RETURN_RULE), text: RETURN_RULE.text })}</Td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 className="mt-5 font-semibold">{t('rollout.slip.paper.issueTitle', { count: copies.length })}</h3>
      <table className="mt-1.5 w-full border-collapse">
        <thead>
          <tr>
            <Th>{t('rollout.slip.paper.col.code')}</Th>
            <Th>{t('rollout.slip.paper.col.name')}</Th>
            <Th>{t('rollout.slip.paper.col.version')}</Th>
            <Th>{t('rollout.slip.paper.col.copyNo')}</Th>
            <Th>{t('rollout.slip.paper.col.count')}</Th>
          </tr>
        </thead>
        <tbody>
          {copies.map((c) => (
            <tr key={c.copyNo}>
              <Td mono>{c.identity}</Td>
              <Td>{c.name}</Td>
              <Td>{c.newVersion}</Td>
              <Td mono>{c.newCopyNo}</Td>
              <Td>1</Td>
            </tr>
          ))}
        </tbody>
      </table>
      <Signatures left={t('rollout.slip.paper.issuer')} right={t('rollout.slip.paper.receiver')} />

      <h3 className="mt-5 font-semibold">
        {legacy.length > 0 ? t('rollout.slip.paper.returnTitleLegacy', { count: copies.length, legacy: legacy.length }) : t('rollout.slip.paper.returnTitle', { count: copies.length })}
      </h3>
      <table className="mt-1.5 w-full border-collapse">
        <thead>
          <tr>
            <Th>{t('rollout.slip.paper.col.code')}</Th>
            <Th>{t('rollout.slip.paper.col.version')}</Th>
            <Th>{t('rollout.slip.paper.col.copyNo')}</Th>
            <Th>{t('rollout.slip.paper.col.count')}</Th>
            <Th>{t('rollout.slip.paper.col.remark')}</Th>
          </tr>
        </thead>
        <tbody>
          {copies.map((c) => (
            <tr key={c.copyNo}>
              <Td mono>{c.identity}</Td>
              <Td>{c.oldVersion}</Td>
              <Td mono>{c.copyNo}</Td>
              <Td>1</Td>
              <Td />
            </tr>
          ))}
          {legacy.map((l) => (
            <tr key={l.copyNo}>
              <Td mono>{l.identity}</Td>
              <Td>{l.version}</Td>
              <Td mono>{l.copyNo}</Td>
              <Td>1</Td>
              <Td>{t('rollout.slip.paper.legacyRemark')}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      <Signatures left={t('rollout.slip.paper.returner')} right={t('rollout.slip.paper.collector')} />

      <h3 className="mt-5 font-semibold">{t('rollout.slip.paper.blankTitle')}</h3>
      <p className="mt-1">
        {BLANK_RECORD_RULE ? t('rollout.slip.paper.blankText', { rule: citation(BLANK_RECORD_RULE) }) : t('rollout.slip.paper.blankTextNoRule')}
        <span className="ml-4">{t('rollout.slip.paper.blankCount')}</span>
        <Blank />
        <span className="ml-4">{t('rollout.slip.paper.returner')}</span>
        <Blank />
      </p>

      <p className="mt-6 border-t pt-2 text-xs text-muted-foreground">{t('rollout.slip.paper.footer', { qa: TERMS.departments.qa })}</p>
      <p className="mt-1 text-right font-mono text-[11px] text-muted-foreground">{slipNumber(view, holder)}</p>
    </article>
  )
}

function Th({ children }: { children: ReactNode }) {
  return <th className="border border-foreground/40 bg-muted/50 px-2 py-1 text-left font-normal whitespace-nowrap print:bg-transparent">{children}</th>
}

function Td({ children, mono, colSpan }: { children?: ReactNode; mono?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('border border-foreground/40 px-2 py-1', mono && 'font-mono text-xs whitespace-nowrap')}>
      {children}
    </td>
  )
}

const Blank = () => <span className="ml-1 inline-block w-20 border-b border-foreground/60 align-bottom" />

function Signatures({ left, right }: { left: string; right: string }) {
  const { t } = useTranslation()
  return (
    <p className="mt-2 flex flex-wrap gap-x-6">
      <span>
        {left}
        <Blank />
      </span>
      <span>
        {t('rollout.slip.paper.date')}
        <Blank />
      </span>
      <span>
        {right}
        <Blank />
      </span>
      <span>
        {t('rollout.slip.paper.date')}
        <Blank />
      </span>
    </p>
  )
}

/** QA's registration: issue once per department; one scan per returned old copy; notes; the log. */
function Register({ view, holder }: { view: ChangeView; holder: string }) {
  const { t } = useTranslation()
  const plan = planOf(view)
  const copies = plan.copies.filter((c) => c.holder === holder)
  const legacy = plan.legacy.filter((l) => l.holder === holder)
  const targets = new Set<string>([holder, ...copies.map((c) => c.copyNo), ...copies.map((c) => c.group), ...legacy.map((l) => l.copyNo)])
  const log = view.rollout.log.filter((e) => targets.has(e.target)).reverse()

  return (
    <aside className="w-80 shrink-0 overflow-auto border-l bg-background text-sm print:hidden">
      <Block title={t('rollout.register.issueTitle')}>
        <IssueBlock view={view} holder={holder} />
      </Block>
      <Block title={t('rollout.register.returnTitle')}>
        <ul className="divide-y">
          {copies.map((c) => (
            <CopyRow key={c.copyNo} view={view} copy={c} />
          ))}
        </ul>
      </Block>
      {legacy.length > 0 && (
        <Block title={t('rollout.register.legacyTitle')}>
          <ul className="divide-y">
            {legacy.map((l) => (
              <LegacyRow key={l.copyNo} view={view} copy={l} />
            ))}
          </ul>
        </Block>
      )}
      <Block title={t('rollout.register.logTitle')}>
        {log.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('rollout.register.logEmpty')}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {log.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground">{shortDate(e.on)}</span>
                <span className="min-w-0 break-words">{logText(t, view, e)}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </aside>
  )
}

function logText(t: TFunction, view: ChangeView, e: RolloutLogEntry): string {
  if (e.action === 'issue' && e.withReturn) return t('rollout.register.log.issueWithReturn')
  if (e.action === 'approve' || e.action === 'withdrawApproval') {
    const g = planOf(view).groups.find((x) => x.id === e.target)
    const target = g && g.members.length > 1 ? t('rollout.col.group', { id: g.id }) : e.target
    return t(`rollout.register.log.${e.action}`, { target })
  }
  return t(`rollout.register.log.${e.action}`, { target: e.target, file: e.file })
}
