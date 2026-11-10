import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Breadcrumb, NotThisRound, Tag } from '@/components/common'
import { anchorId, anchorKey, parseAnchor } from '@/components/doc-anchor'
import { DocumentPaper } from '@/components/DocumentPaper'
import { Button } from '@/components/ui/button'
import { findVersion, libraryModel } from '@/data/model'
import { fixOf, reasonsOf } from '@/domain/issues'
import { type CitationPlace, libraryCategoryOf, outgoingCitations } from '@/domain/library'
import type { DocumentVersion } from '@/domain/model'
import { changeNumber, type ChangeView, reportRoleText } from '@/features/change/view'
import { useChangeViews } from '@/features/home/tasks'
import { cn } from '@/lib/utils'
import { issueText } from './issue-text'
import { ReferencesPanel } from './ReferencesPanel'
import { libraryRows } from './rows'

const PAPER = 'doc'
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨']

type MarkStyle = 'number' | 'implicit' | 'flag'

/**
 * Where this document cites others, by anchor (02 画面 5): a number gets a solid
 * underline, a reference without a number a dashed one, and one with a problem
 * (obsolete, not found) is marked.
 */
function citationMarks(version: DocumentVersion): Map<string, { text: string; style: MarkStyle }[]> {
  const map = new Map<string, { text: string; style: MarkStyle }[]>()
  const add = (p: CitationPlace, style: MarkStyle) => {
    const key = anchorKey(p.location === 'header' ? { kind: 'header' } : { kind: 'clause', number: p.clause })
    map.set(key, [...(map.get(key) ?? []), { text: p.written, style }])
  }
  if (version.origin !== 'library') return map
  const out = outgoingCitations(libraryModel, version.key)
  for (const g of out.byNumber) for (const p of g.places) add(p, g.target.kind === 'current' ? 'number' : 'flag')
  for (const e of out.external) for (const p of e.places) add(p, 'number')
  for (const p of out.implicit) add(p, 'implicit')
  return map
}

function underlined(text: string, marks: { text: string; style: MarkStyle }[]): ReactNode {
  const here = marks.filter((m) => m.text && text.includes(m.text))
  if (here.length === 0) return text
  const pattern = new RegExp(`(${here.map((m) => m.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)
  return text.split(pattern).map((part, i) => {
    const m = here.find((x) => x.text === part)
    if (!m) return <Fragment key={i}>{part}</Fragment>
    return (
      <span
        key={i}
        className={cn(
          'underline underline-offset-2',
          m.style === 'implicit' && 'decoration-dashed',
          m.style === 'flag' && 'rounded-sm bg-mark px-0.5 decoration-2',
        )}
      >
        {part}
      </span>
    )
  })
}

/** 文件库 · 一份文件: the original, read-only, with its references (02 画面 4、5). */
export function DocumentDetailPage() {
  const { t } = useTranslation()
  const { identity = '', version = '' } = useParams()
  const v = findVersion(decodeURIComponent(identity), version)
  if (!v) return <p className="p-8 text-sm text-muted-foreground">{t('error.notFound')}</p>
  return <DocumentDetail key={v.key} version={v} />
}

function DocumentDetail({ version }: { version: DocumentVersion }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const views = useChangeViews()
  const row = useMemo(() => libraryRows(views).find((r) => r.version.key === version.key), [views, version.key])
  const [focus, setFocus] = useState<string | null>(params.get('at'))

  useEffect(() => {
    if (!focus) return
    document.getElementById(anchorId(PAPER, parseAnchor(focus)))?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focus])

  const category = libraryCategoryOf(version.identity)
  const marks = useMemo(() => citationMarks(version), [version])
  const set = libraryModel.sets.find((s) => s.id === libraryModel.setOf.get(version.identity))
  const equipment = libraryModel.equipment.find((e) => e.mainSop === version.identity)
  const issues = row?.issues ?? []
  const status = row?.status ?? (version.status === 'obsolete' ? 'obsolete' : 'current')
  const info = [
    version.document?.header.department ?? row?.department,
    version.effectiveDate && /^\d{4}-/.test(version.effectiveDate) ? t('doc.effective', { date: version.effectiveDate }) : null,
    set && set.members.length > 1 ? t('doc.set', { members: set.members.join(' + ') }) : null,
    equipment ? t('doc.equipment', { model: equipment.model, deviceNo: equipment.deviceNo ?? '' }) : null,
  ].filter(Boolean)

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b bg-background">
        <div className="flex items-center gap-3 px-5 pt-3 pb-2">
          <Breadcrumb items={[{ label: t('nav.library'), to: '/library' }, ...(category ? [{ label: t(`category.${category}`), to: `/library?cat=${category}` }] : []), { label: row?.code ?? version.identity }]} />
          <h1 className="text-base font-semibold">{version.name}</h1>
          <Tag tone={status === 'current' ? 'plain' : 'muted'}>{t(`status.${status}`)}</Tag>
        </div>
        {issues.length > 0 && (
          <div className="mx-5 mb-2 flex items-start gap-2 rounded-md bg-mark px-3 py-1.5 text-sm">
            <Tag>{t('library.qaOnly')}</Tag>
            <div className="min-w-0">
              {issues.map((i, n) => {
                const text = issueText(t, i)
                return (
                  <p key={i.id}>
                    {t('doc.issueLine', { n: CIRCLED[n] ?? n + 1, label: reasonsOf(i).map((r) => t(`issue.${r}`)).join(' · ') })}
                    <Tag className="ml-1.5">{t(`home.tasks.fixShort.${fixOf(i.kind)}`)}</Tag>
                    {text && <span className="block text-xs text-muted-foreground">{text}</span>}
                  </p>
                )
              })}
            </div>
            <NotThisRound className="ml-auto shrink-0">{t('home.tasks.handle')}</NotThisRound>
          </div>
        )}
        <div className="flex items-center gap-3 bg-muted/40 px-5 py-2 text-sm">
          <span className="min-w-0 truncate text-muted-foreground">{info.join(' · ')}</span>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {row?.inChanges.map((c) => <InChangeLine key={c.view.record.id} view={c.view} role={c.role} version={version} />)}
            {version.status === 'current' && version.origin === 'library' && (
              <Button size="sm" onClick={() => navigate(`/changes/new?from=${encodeURIComponent(version.identity)}`)}>
                {t('doc.initiate')}
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[620px] shrink-0 overflow-auto bg-canvas px-10 py-6">
          {version.document ? (
            <DocumentPaper
              doc={version.document}
              idPrefix={PAPER}
              highlight={focus ? new Set([focus]) : undefined}
              renderText={(anchor, text) => underlined(text, marks.get(anchorKey(anchor)) ?? [])}
            />
          ) : (
            <LedgerOnly version={version} />
          )}
        </div>
        <aside className="min-w-0 flex-1 overflow-auto border-l bg-background">
          {version.origin === 'library' && version.status !== 'obsolete' ? (
            <ReferencesPanel
              version={version}
              onShowPlace={(p) => setFocus(anchorKey(p.location === 'header' ? { kind: 'header' } : { kind: 'clause', number: p.clause }))}
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{t(version.origin === 'draft' ? 'doc.refs.draftNote' : 'doc.refs.obsoleteNote')}</p>
          )}
        </aside>
      </div>
    </div>
  )
}

function InChangeLine({ view, role, version }: { view: ChangeView; role: 'source' | 'draft' | 'impact'; version: DocumentVersion }) {
  const { t } = useTranslation()
  const what =
    role === 'source'
      ? t('doc.inChange.source', { version: view.newVersion.version, station: t(`station.${view.current}.name`) })
      : role === 'draft'
        ? t('doc.inChange.draft', { station: t(`station.${view.current}.name`) })
        : t('doc.inChange.impactTier', { tier: reportRoleText(t, view, version.key) ?? t('library.role.pending') })
  return (
    <p className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-sm">
      <span className="max-w-md truncate">
        {t('doc.inChange.label', { no: changeNumber(t, view.record), title: view.record.title })} · {what}
      </span>
      <Link to={`/changes/${view.record.id}/overview`} className="shrink-0 font-medium hover:underline">
        {t('common.open')}
      </Link>
    </p>
  )
}

function LedgerOnly({ version }: { version: DocumentVersion }) {
  const { t } = useTranslation()
  const rows = version.ledger?.rows ?? []
  return (
    <div className="mx-auto w-[540px] rounded-md border bg-background p-6 text-sm">
      <p className="font-medium">{t('library.mark.ledgerOnly')}</p>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        {rows.map((r) => (
          <li key={r.row}>{t('doc.ledgerRow', { copy: r.copyNo, holder: r.holder, status: r.status, remark: r.remark || '—' })}</li>
        ))}
      </ul>
    </div>
  )
}
