import type { TFunction } from 'i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { shortDate } from '@/lib/format'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { NotThisRound, Tag } from '@/components/common'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { documentPath } from '@/features/library/paths'
import { reasonsOf } from '@/domain/issues'
import { REPORT_GROUPS } from '@/domain/assessment'
import { LIBRARY_CATEGORIES, type LibraryCategory } from '@/domain/library'
import { changeNumber, reportRoleText } from '@/features/change/view'
import { useChangeViews } from '@/features/home/tasks'
import { cn } from '@/lib/utils'
import { DEFAULT_STATUSES, type LibraryRow, libraryRows, STATUS_OPTIONS, type StatusOption } from './rows'

const EXTERNAL_KINDS = ['pharmacopoeia', 'regulation', 'guideline', 'other'] as const
/** The ways of looking at the library (R1-01): every file, those in an open change, those with 问题, reviews coming due. */
const LIBRARY_VIEWS = ['all', 'change', 'issues', 'due'] as const
type LibraryView = (typeof LIBRARY_VIEWS)[number]

/** 文件库 · 本厂文件: catalogue on the left, filters above the table (02 画面 1、2). */
const COLUMNS = ['code', 'name', 'status', 'version', 'effective', 'department', 'citedBy', 'marks'] as const
/** With a change filter (02 画面 3): what the file is in that change replaces version, dates and marks. */
const CHANGE_COLUMNS = ['code', 'name', 'status', 'category', 'department', 'role'] as const

export function LibraryPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  // Only QA / QC and document control use the product (UX-51), so 问题 always show.
  const isQA = true
  const views = useChangeViews()
  const rows = useMemo(() => libraryRows(views), [views])

  const category = (LIBRARY_CATEGORIES as readonly string[]).includes(params.get('cat') ?? '') ? (params.get('cat') as LibraryCategory) : null
  const statuses = (params.get('status')?.split(',').filter((s): s is StatusOption => (STATUS_OPTIONS as readonly string[]).includes(s)) ?? DEFAULT_STATUSES) as StatusOption[]
  // 视图 (R1-01): one way of looking at the library at a time; 状态 filters inside every one. Old links (?issues=1, ?change=) still land right.
  const openChanges = views.filter((v) => !v.record.closedOn)
  const requested = params.get('view') ?? (params.get('issues') === '1' ? 'issues' : params.get('change') ? 'change' : 'all')
  const view: LibraryView = (LIBRARY_VIEWS as readonly string[]).includes(requested) && (requested !== 'issues' || isQA) ? (requested as LibraryView) : 'all'
  const changeId = view === 'change' ? (openChanges.find((v) => v.record.id === params.get('change'))?.record.id ?? openChanges[0]?.record.id ?? null) : null
  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const byStatus = rows.filter((r) => statuses.includes(r.status))
  const base = byStatus.filter((r) => !category || r.category === category)
  const inView: Record<LibraryView, (r: LibraryRow) => boolean> = {
    all: () => true,
    change: (r) => r.inChanges.some((c) => !c.view.record.closedOn),
    issues: (r) => r.issues.length > 0,
    due: (r) => !!r.dueSoon,
  }
  const filtered = base.filter((r) => inView[view](r) && (!changeId || r.inChanges.some((c) => c.view.record.id === changeId)))
  const openView = (v: LibraryView) => {
    const next = new URLSearchParams(params)
    for (const k of ['view', 'change', 'issues']) next.delete(k)
    if (v !== 'all') next.set('view', v)
    setParams(next, { replace: true })
  }
  const noOriginal = rows.filter((r) => r.status === 'obsolete' && r.version.origin === 'ledgerOnly' && (!category || r.category === category)).length
  const countIn = (c: LibraryCategory) => byStatus.filter((r) => r.category === c).length

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 overflow-auto border-r bg-background p-3 text-sm">
        <CatalogItem active={!category} onClick={() => update('cat', null)} label={t('library.ownFiles')} count={byStatus.length} strong />
        {LIBRARY_CATEGORIES.map((c) => (
          <CatalogItem key={c} active={category === c} onClick={() => update('cat', c)} label={t(`category.${c}`)} count={countIn(c)} />
        ))}
        <div className="mt-4">
          <NotThisRound className="block px-2 py-1 font-medium">{t('library.external')}</NotThisRound>
          {EXTERNAL_KINDS.map((k) => (
            <NotThisRound key={k} className="block py-1 pl-5">
              {t(`library.externalKinds.${k}`)}
            </NotThisRound>
          ))}
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-auto bg-background">
        <div className="flex items-center gap-3 border-b px-5 py-3">
          <h1 className="text-lg font-semibold">{t('library.title')}</h1>
          <NotThisRound className="ml-auto rounded-md border px-2.5 py-1 text-sm">{t('library.newFile')}</NotThisRound>
        </div>
        <div className="flex items-end gap-1 border-b px-5 pt-2 text-sm" role="tablist" aria-label={t('library.views')}>
          {LIBRARY_VIEWS.filter((v) => v !== 'issues' || isQA).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => openView(v)}
              className={cn('-mb-px flex items-baseline gap-1.5 border-b-2 px-3 py-1.5', view === v ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {t(`library.view.${v}`)}
              <span className="text-xs tabular-nums text-muted-foreground">{base.filter(inView[v]).length}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3 self-center pb-1">
            <Filter label={statusLabel(t, statuses)} active={!sameStatuses(statuses, DEFAULT_STATUSES)}>
              {STATUS_OPTIONS.map((s) => (
                <label key={s} className="flex items-center gap-2 py-1">
                  <Checkbox
                    checked={statuses.includes(s)}
                    onCheckedChange={(on) => update('status', STATUS_OPTIONS.filter((x) => (x === s ? on === true : statuses.includes(x))).join(','))}
                  />
                  {t(`status.${s}`)}
                  <span className="ml-auto text-muted-foreground">
                    {rows.filter((r) => r.status === s && (!category || r.category === category)).length}
                    {s === 'obsolete' && noOriginal > 0 && ` · ${t('library.filter.obsoleteNoOriginal', { count: noOriginal })}`}
                  </span>
                </label>
              ))}
              <p className="mt-1 text-xs text-muted-foreground">{t('library.filter.statusDefault')}</p>
            </Filter>
            <NotThisRound>
              {t('library.groupBy')} <span className="rounded-md border px-2 py-0.5">{t('library.groupByCategory')}</span>
            </NotThisRound>
          </div>
        </div>
        {view === 'change' && openChanges.length > 1 && (
          <div className="flex flex-wrap gap-2 border-b px-5 py-2 text-sm">
            {openChanges.map((v) => (
              <button
                key={v.record.id}
                type="button"
                aria-pressed={changeId === v.record.id}
                onClick={() => update('change', v.record.id)}
                className={cn('rounded-md border px-2 py-0.5', changeId === v.record.id ? 'border-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}
              >
                <span className="font-mono text-xs">{changeNumber(t, v.record)}</span> {v.record.title}
              </button>
            ))}
          </div>
        )}
        {filtered.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">{t(view === 'change' && !changeId ? 'library.emptyNoChange' : 'library.empty')}</p>}
        {/* Arriving from the home page issues task (only issues), every group starts open. */}
        {filtered.length > 0 && (
          <RowsTable key={view} rows={changeId ? byRoleInChange(filtered, changeId) : filtered} grouped={!category && !changeId} expanded={view === 'issues' || view === 'due'} isQA={isQA} changeId={changeId} />
        )}
      </div>
    </div>
  )
}

/** 「状态：现行等 3 项」: 现行 named first when chosen (02 画面 1). */
function statusLabel(t: TFunction, statuses: StatusOption[]): string {
  const first = statuses.includes('current') ? 'current' : statuses[0]
  if (!first) return t('library.filter.statusNone')
  return statuses.length === 1 ? t('library.filter.statusOne', { first: t(`status.${first}`) }) : t('library.filter.status', { first: t(`status.${first}`), n: statuses.length })
}

const sameStatuses = (a: readonly StatusOption[], b: readonly StatusOption[]) => a.length === b.length && a.every((s) => b.includes(s))

/** With a change filter: the draft and the source first, then the report by tier, indirect last (02 画面 3). */
function byRoleInChange(rows: LibraryRow[], changeId: string): LibraryRow[] {
  const rank = (r: LibraryRow) => {
    const entry = r.inChanges.find((c) => c.view.record.id === changeId)
    if (!entry) return 9
    if (entry.role === 'draft') return 0
    if (entry.role === 'source') return 1
    const group = entry.view.report.entries.find((e) => e.version === r.version.key)?.group
    return 2 + (group ? REPORT_GROUPS.indexOf(group) : 6)
  }
  return [...rows].sort((a, b) => rank(a) - rank(b))
}

function CatalogItem({ label, count, active, onClick, strong }: { label: string; count: number; active: boolean; onClick: () => void; strong?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center rounded-md px-2 py-1 text-left hover:bg-muted', !strong && 'pl-5', strong && 'font-medium', active && 'bg-muted font-medium')}
    >
      {label}
      <span className="ml-auto text-xs text-muted-foreground">{count}</span>
    </button>
  )
}

function Filter({ label, active, children }: { label: string; active?: boolean; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger className={cn('flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm hover:bg-muted aria-expanded:bg-muted', active && 'border-foreground font-medium')}>
        {label}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 text-sm">
        {children}
      </PopoverContent>
    </Popover>
  )
}

function RowsTable({ rows, grouped, expanded, isQA, changeId }: { rows: LibraryRow[]; grouped: boolean; expanded: boolean; isQA: boolean; changeId: string | null }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<Set<string>>(() => new Set(expanded ? LIBRARY_CATEGORIES : []))
  const toggle = (c: string) => setOpen((s) => new Set(s.has(c) ? [...s].filter((x) => x !== c) : [...s, c]))

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr className="border-y bg-muted/40">
          {(changeId ? CHANGE_COLUMNS : COLUMNS).map((c) => (
            <th key={c} className="px-3 py-2 font-normal first:pl-5">
              {t(`library.col.${c}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grouped
          ? LIBRARY_CATEGORIES.map((c) => {
              const inGroup = rows.filter((r) => r.category === c)
              if (inGroup.length === 0) return null
              const withIssues = inGroup.filter((r) => r.issues.length > 0).length
              const dueSoon = inGroup.filter((r) => r.dueSoon).length
              const summary = [isQA && withIssues > 0 && t('library.group.issues', { count: withIssues }), dueSoon > 0 && t('library.group.dueSoon', { count: dueSoon })].filter(Boolean)
              return [
                <tr key={c} onClick={() => toggle(c)} className="cursor-pointer border-b hover:bg-muted/60">
                  <td colSpan={COLUMNS.length} className="px-5 py-2">
                    <button
                      type="button"
                      aria-expanded={open.has(c)}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(c)
                      }}
                      className="flex items-center gap-1.5 text-left"
                    >
                      {open.has(c) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      <span className="font-medium">{t(`category.${c}`)}</span>
                      <span className="text-muted-foreground">{t('library.count', { count: inGroup.length })}</span>
                      {summary.length > 0 && <span className="ml-2 text-xs text-muted-foreground">{summary.join(' · ')}</span>}
                    </button>
                  </td>
                </tr>,
                ...(open.has(c) ? inGroup.map((r) => <Row key={`${r.version.key}`} row={r} isQA={isQA} changeId={null} />) : []),
              ]
            })
          : rows.map((r) => <Row key={r.version.key} row={r} isQA={isQA} changeId={changeId} />)}
      </tbody>
    </table>
  )
}

function Row({ row, isQA, changeId }: { row: LibraryRow; isQA: boolean; changeId: string | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const obsolete = row.status === 'obsolete'
  return (
    <tr onClick={() => navigate(documentPath(row.version))} className={cn('cursor-pointer border-b hover:bg-muted/60', obsolete && 'text-muted-foreground')}>
      <td className="py-2 pr-3 pl-5 font-mono text-xs whitespace-nowrap">
        <Link to={documentPath(row.version)} onClick={(e) => e.stopPropagation()} className="hover:underline">
          {row.code}
        </Link>
      </td>
      <td className="px-3 py-2">{row.version.name}</td>
      <td className="px-3 py-2 whitespace-nowrap">{t(`status.${row.status}`)}</td>
      {changeId ? (
        <>
          <td className="px-3 py-2 whitespace-nowrap">{row.category ? t(`category.${row.category}`) : '—'}</td>
          <td className="px-3 py-2 whitespace-nowrap">{row.department}</td>
          <td className="px-3 py-2">
            <RoleInChange row={row} changeId={changeId} />
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-2">{row.version.version}</td>
          <td className="px-3 py-2 whitespace-nowrap">{row.effectiveDate ?? '—'}</td>
          <td className="px-3 py-2 whitespace-nowrap">{row.department}</td>
          <td className="px-3 py-2">{row.citedBy ?? '—'}</td>
          <td className="px-3 py-2">
            <Marks row={row} isQA={isQA} />
          </td>
        </>
      )}
    </tr>
  )
}

/** With a change filter, the last column says what the file is in that change (02 画面 3). */
function RoleInChange({ row, changeId }: { row: LibraryRow; changeId: string }) {
  const { t } = useTranslation()
  const entry = row.inChanges.find((c) => c.view.record.id === changeId)
  if (!entry) return null
  const { view, role } = entry
  const text =
    role === 'draft'
      ? t('library.role.draft', { version: view.newVersion.version })
      : role === 'source'
        ? t('library.role.source', { version: view.newVersion.version })
        : (reportRoleText(t, view, row.version.key) ?? t('library.role.pending'))
  // Also on another change's report (01 画面 3: 「未确认 · 也在 BG-2026-021 里」).
  const others = row.inChanges.filter((c) => c.view.record.id !== changeId).map((c) => t('library.role.alsoIn', { no: changeNumber(t, c.view.record) }))
  return <span className="text-xs">{[text, ...others].join(' · ')}</span>
}

function Marks({ row, isQA }: { row: LibraryRow; isQA: boolean }) {
  const { t } = useTranslation()
  const s = row.supersession
  if (s) {
    const replaced = s.replacedBy ? t('library.mark.replacedBy', { code: s.replacedBy }) : s.newerVersion ? t('library.mark.replacedByVersion', { version: s.newerVersion }) : null
    const parts = s.hasOriginal ? [replaced, t('library.mark.originalStillThere')] : [t('library.mark.ledgerOnly'), replaced]
    return <span className="text-xs">{parts.filter(Boolean).join(' · ')}</span>
  }
  const draft = row.inChanges.find((c) => c.role === 'draft')
  return (
    <span className="flex flex-wrap gap-1">
      {draft && <span className="text-xs">{t('library.mark.draftOf', { no: changeNumber(t, draft.view.record) })}</span>}
      {isQA && [...new Set(row.issues.flatMap(reasonsOf))].map((k) => <Tag key={k}>{t(`issue.${k}`)}</Tag>)}
      {row.dueSoon && <Tag tone="muted">{t('library.mark.dueSoon', { date: shortDate(row.dueSoon) })}</Tag>}
    </span>
  )
}
