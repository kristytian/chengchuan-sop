import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NotThisRound, Tag } from '@/components/common'
import { Button } from '@/components/ui/button'
import { changeAnalysis, displayCode, versionByKey } from '@/data/model'
import type { ReportEntry, ReportGroup, ReportLine } from '@/domain/assessment'
import { TERMS } from '@/domain/source-terms'
import { cn } from '@/lib/utils'
import { type ChangeView, changeNumber } from '../view'
import { entryAnchor } from './model'

/**
 * 变更影响评估报告 (UX-50; layout of 03 画面 14): written by AI and the rules,
 * edited by people, confirmed once. The report is only the document: clicking
 * an entry selects it in the list on the left, where its actions are.
 */
export function ReportDocument({ view, selected, onSelect }: { view: ChangeView; selected: string | null; onSelect: (version: string) => void }) {
  const { t } = useTranslation()
  const diff = changeAnalysis(view.change.id).diff
  const { record, assessment, report } = view
  const exported = view.stage === 'exported'
  const edition = exported ? t('assess.report.version') : t('assess.report.draft')
  const sourceCode = view.change.source.kind === 'revision' ? view.change.source.identity : ''
  const field = (key: 'controlNo' | 'edition' | 'source' | 'content' | 'generated' | 'confirmed' | 'state') => t(`assess.report.field.${key}`)
  const inGroup = (g: ReportGroup) => report.entries.filter((e) => e.group === g)
  const added = report.entries.filter((e) => e.origin === 'added')
  const concluded = report.entries.filter((e) => e.conclusion)

  return (
    <>
      <div className="mx-auto mb-3 flex w-[760px] items-center gap-3 text-sm print:hidden">
        <span className="font-semibold">{t('assess.report.title')}</span>
        {exported ? <NotThisRound>{edition} ▾</NotThisRound> : <Tag>{edition}</Tag>}
        {/* The draft can go out too, for discussion; only confirming locks it. */}
        <Button
          size="sm"
          variant={exported ? 'default' : 'outline'}
          className="ml-auto"
          title={t(exported ? 'assess.report.printHint' : 'assess.report.printDraftHint')}
          onClick={() => window.print()}
        >
          {t(exported ? 'assess.report.print' : 'assess.report.printDraft')}
        </Button>
      </div>
      <article className="mx-auto w-[760px] bg-paper px-12 py-9 font-song text-[12.5px] leading-[1.8] shadow-sm ring-1 ring-border print:w-auto print:shadow-none print:ring-0">
        <p className="border-b border-foreground/50 pb-1 text-[10.5px] text-muted-foreground">{t('assess.report.company')}</p>
        <h1 className="mt-4 text-center font-hei text-[17px]">{t('assess.report.title')}</h1>
        <table className="mt-4 w-full table-fixed border-collapse text-[11.5px] leading-snug">
          <tbody>
            <HeadRow cells={[[field('controlNo'), changeNumber(t, record)], [field('edition'), edition]]} />
            <HeadRow cells={[[field('source'), t('assess.report.sourceValue', { code: sourceCode, name: view.newVersion.name, from: view.oldVersion.version, to: view.newVersion.version })]]} />
            <HeadRow cells={[[field('content'), t('assess.report.content', { summary: record.title, header: diff?.header.length ?? 0, clauses: diff?.clauses.length ?? 0 })]]} />
            <HeadRow
              cells={[
                [field('generated'), t('assess.report.generatedBy', { date: record.initiatedOn })],
                [field('confirmed'), exported ? t('assess.report.confirmedBy', { department: TERMS.departments.qa, date: assessment.exportedOn }) : t('assess.report.pending')],
              ]}
            />
            <HeadRow cells={[[field('state'), t(exported ? 'assess.report.stateLocked' : 'assess.report.stateDraft')]]} />
          </tbody>
        </table>

        {inGroup('undetermined').length > 0 && (
          <Section title={t('assess.report.section.undetermined', { count: inGroup('undetermined').length })}>
            <EntryTable entries={inGroup('undetermined')} kind="change" selected={selected} onSelect={onSelect} />
          </Section>
        )}
        <Section title={t('assess.report.section.mustChange', { count: inGroup('mustChange').length })}>
          <EntryTable entries={inGroup('mustChange')} kind="change" selected={selected} onSelect={onSelect} />
        </Section>
        <Section title={t('assess.report.section.evaluate', { count: inGroup('evaluate').length })}>
          <EntryTable entries={inGroup('evaluate')} kind="evaluate" selected={selected} onSelect={onSelect} />
        </Section>
        <Section title={t('assess.report.section.inform', { count: inGroup('inform').length })}>
          <EntryTable entries={inGroup('inform')} kind="inform" selected={selected} onSelect={onSelect} />
        </Section>
        <Section title={t('assess.report.section.indirect', { count: inGroup('indirect').length })}>
          <EntryTable entries={inGroup('indirect')} kind="indirect" selected={selected} onSelect={onSelect} />
        </Section>
        <Section title={t('assess.report.section.edits', { added: added.length, removed: report.removed.length, concluded: concluded.length })}>
          {added.length === 0 && report.removed.length === 0 && concluded.length === 0 && <p>{t('assess.report.noEdits')}</p>}
          {added.map((e) => {
            const v = versionByKey(e.version)
            return v ? <p key={e.version}>{t('assess.report.addedItem', { code: displayCode(v), name: v.name, tier: t(`report.group.${e.group}`), reason: e.reason })}</p> : null
          })}
          {concluded.map((e) => {
            const v = versionByKey(e.version)
            const c = e.conclusion!
            return v ? (
              <p key={`c-${e.version}`}>
                {t('assess.report.concludedItem', {
                  code: displayCode(v),
                  name: v.name,
                  tier: t(`report.group.${c.tier}`),
                  by: c.by,
                  date: c.on,
                  note: c.note ? t('assess.report.noteSuffix', { note: c.note }) : '',
                })}
              </p>
            ) : null
          })}
          {report.removed.map(({ entry, decision }) => {
            const v = versionByKey(entry.version)
            return v ? (
              <p key={entry.version} id={entryAnchor(entry.version)} onClick={() => onSelect(entry.version)} className={cn('scroll-mt-24 cursor-pointer print:cursor-auto', selected === entry.version && 'bg-mark')}>
                {t('assess.report.removedItem', {
                  code: displayCode(v),
                  name: v.name,
                  by: decision.by,
                  date: decision.on,
                  note: decision.note ? t('assess.report.noteSuffix', { note: decision.note }) : '',
                })}
              </p>
            ) : null
          })}
        </Section>

        <p className="mt-6 text-[11.5px]">{t('assess.report.footer')}</p>
        <p className="mt-6 border-t border-foreground/40 pt-1.5 text-[10.5px] text-muted-foreground">{t('assess.report.pageFooter', { no: record.controlNo, edition })}</p>
      </article>
    </>
  )
}

function HeadRow({ cells }: { cells: [string, string][] }) {
  return (
    <tr>
      {cells.map(([label, value]) => (
        <HeadCell key={label} label={label} value={value} span={cells.length === 1 ? 3 : 1} />
      ))}
    </tr>
  )
}

function HeadCell({ label, value, span }: { label: string; value: string; span: number }) {
  return (
    <>
      <td className="w-[16%] border border-foreground/60 px-1.5 py-1 text-center font-hei">{label}</td>
      <td colSpan={span} className="border border-foreground/60 px-1.5 py-1">
        {value}
      </td>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-1 font-hei text-[13px]">{title}</h2>
      {children}
    </section>
  )
}

type Kind = 'change' | 'evaluate' | 'inform' | 'indirect'

/** The second column says what the entry is about: what to change, what to evaluate, why only 告知, how it is related. */
const MIDDLE: Record<Kind, 'points' | 'evaluate' | 'basis' | 'relation'> = { change: 'points', evaluate: 'evaluate', inform: 'basis', indirect: 'relation' }

function EntryTable({ entries, kind, selected, onSelect }: { entries: ReportEntry[]; kind: Kind; selected: string | null; onSelect: (version: string) => void }) {
  const { t } = useTranslation()
  if (entries.length === 0) return <p>{t('assess.report.noEntries')}</p>
  return (
    <table className="w-full table-fixed border-collapse text-[11.5px] leading-snug">
      <thead>
        <tr>
          <th className="w-[28%] border border-foreground/60 px-1.5 py-1 text-center font-hei font-normal">{t('assess.report.col.file')}</th>
          <th className="border border-foreground/60 px-1.5 py-1 text-center font-hei font-normal">{t(`assess.report.col.${MIDDLE[kind]}`)}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <EntryRow key={e.version} entry={e} kind={kind} active={selected === e.version} onSelect={() => onSelect(e.version)} />
        ))}
      </tbody>
    </table>
  )
}

/** One entry. Only what the reader acts on: what to change or evaluate; a person's additions and 备注 are named as theirs. */
function EntryRow({ entry: e, kind, active, onSelect }: { entry: ReportEntry; kind: Kind; active: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  const v = versionByKey(e.version)
  if (!v) return null
  const evaluate = e.lines.filter((l) => l.conclusion === 'evaluate').map((l) => lineText(t, l, l.note))
  const change = e.lines.filter((l) => l.conclusion === 'change').map((l) => lineText(t, l, pointsText(t, l)))
  const body =
    e.origin === 'added'
      ? [e.note]
      : e.conclusion
        ? // Evaluated: what was evaluated stays on record, the conclusion under it.
          [...evaluate.map((text) => t('assess.report.evaluated', { text })), ...change]
        : kind === 'change'
          ? change
          : kind === 'evaluate'
            ? [...evaluate, ...change.map((c) => t('assess.report.alsoChange', { text: c }))]
            : kind === 'indirect'
              ? [t('assess.report.via', { via: e.via.join(t('common.listSep')) }), e.reason]
              : [e.reason]

  return (
    <tr id={entryAnchor(e.version)} onClick={onSelect} className={cn('scroll-mt-24 cursor-pointer hover:bg-muted/40 print:cursor-auto', active && 'bg-mark hover:bg-mark')}>
      <td className="border border-foreground/60 px-1.5 py-1 align-top">
        {displayCode(v)}
        {e.origin === 'added' && <span className="ml-1">{t('assess.report.addedMark')}</span>}
        <br />
        {v.name}
      </td>
      <td className="border border-foreground/60 px-1.5 py-1 align-top">
        {body.filter(Boolean).map((line, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {line}
          </p>
        ))}
        {e.origin === 'added' && <p className="mt-0.5 text-[10.5px] text-muted-foreground">{t('assess.report.addedReason', { reason: e.reason })}</p>}
        {e.conclusion && (
          <div className="mt-0.5 border-l-2 border-foreground pl-1.5">
            <p className="font-hei">{t('assess.report.conclusion', { tier: t(`report.group.${e.conclusion.tier}`), by: e.conclusion.by, date: e.conclusion.on })}</p>
            {e.conclusion.note && <p>{t('assess.report.decisionNote', { note: e.conclusion.note })}</p>}
          </div>
        )}
        {e.comment && <p className="mt-0.5 border-l-2 border-foreground/60 pl-1.5">{t('assess.report.comment', { department: TERMS.departments.qa, text: e.comment })}</p>}
      </td>
    </tr>
  )
}

function pointsText(t: TFunction, l: ReportLine): string {
  // AI writes its own wording (「均质转速 2500–3000 → 2800–3400 rpm」); a rule point is just from → to.
  return l.points.map((p) => p.text || t('assess.note.point', { from: p.from, to: p.to })).join(t('common.pointSep'))
}

/** 「§4.4 关键工艺参数 RH-300 → RH-500；均质转速 2500–3000 → 2800–3400 rpm」 */
function lineText(t: TFunction, l: ReportLine, text: string): string {
  const place = l.ref === 'header' ? t('assess.note.header') : l.ref === 'body' ? t('assess.note.body') : t('doc.place.clause', { number: l.ref }) + (l.heading.length <= 12 ? ` ${l.heading}` : '')
  return t('assess.report.line', { place, text })
}
