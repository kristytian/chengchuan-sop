import type { TFunction } from 'i18next'
import { Fragment, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext, useParams } from 'react-router'
import { Breadcrumb, Tag } from '@/components/common'
import { anchorId, anchorKey, parseAnchor } from '@/components/doc-anchor'
import { DocumentPaper } from '@/components/DocumentPaper'
import { changeAnalysis, displayCode } from '@/data/model'
import type { Annotation, ChangePoint } from '@/domain/assessment'
import { libraryCategoryOf } from '@/domain/library'
import { cn } from '@/lib/utils'
import { type ChangeView, entryOf } from '../view'
import { type ItemContext, itemContext } from './model'
import { NoteNumber } from './parts'

const PAPER = 'basis'

/**
 * 看原件和依据: one entry of the report, read-only — the original with the
 * places AI and the rules found, and what AI concluded at each (UX-50). Nothing
 * is decided here; the report page is where entries are taken off or put on.
 */
export function ItemDetail() {
  const { t } = useTranslation()
  const view = useOutletContext<ChangeView>()
  const { identity } = useParams()
  const item = changeAnalysis(view.change.id).impact.find((i) => i.identity === identity)
  if (!item) return <p className="p-8 text-sm text-muted-foreground">{t('change.notFound')}</p>
  return <Detail key={item.id} view={view} context={itemContext(view.change, item)} />
}

function Detail({ view, context }: { view: ChangeView; context: ItemContext }) {
  const { t } = useTranslation()
  const { item, version, annotations } = context
  const [active, setActive] = useState<string | null>(annotations[0]?.key ?? null)
  const doc = version.document
  const entry = entryOf(view, item.version)
  const removed = view.report.removed.find((r) => r.entry.version === item.version)
  const category = libraryCategoryOf(version.identity)
  const numbers = new Map(annotations.map((a, i) => [a.key, i + 1]))
  const tokens = tokensByAnchor(context)
  const focus = (key: string) => {
    setActive(key)
    document.getElementById(anchorId(PAPER, parseAnchor(key)))?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <section className="flex h-full flex-col">
      <header className="shrink-0 space-y-1.5 border-b bg-background px-5 py-2.5 text-sm">
        <Breadcrumb items={[{ label: t('station.assess.name'), to: '..' }, { label: displayCode(version) }]} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">{version.name}</span>
          <span className="text-xs text-muted-foreground">
            {t('assess.detail.meta', { category: category ? t(`category.${category}`) : '', department: doc?.header.department ?? '' })}
          </span>
          {entry && <Tag tone="strong">{t(`report.group.${entry.group}`)}</Tag>}
          {/* One mark for the page: everything below the header that is grey is AI's (UX-50). */}
          {item.aiStatus === 'current' && (
            <span title={context.example ? t('assess.aiExampleHint') : undefined} className="text-xs text-ai">
              {t(context.example ? 'assess.detail.aiMarkerExample' : 'assess.detail.aiMarker')}
            </span>
          )}
        </div>
        {removed && <p className="text-xs">{t('assess.detail.removed', {
              by: removed.decision.by,
              date: removed.decision.on,
              note: removed.decision.note ? t('assess.detail.noteSuffix', { note: removed.decision.note }) : '',
            })}</p>}
        {item.level === 'indirect' ? (
          <p className="text-xs text-muted-foreground">{t('assess.detail.indirect', { source: view.change.source.kind === 'revision' ? view.change.source.identity : '', via: item.via.join(t('common.listSep')) })}</p>
        ) : item.reason ? (
          <p className="text-xs">
            <span className="text-muted-foreground">{t('assess.detail.basis')}</span> <span className="text-ai">{item.reason}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('assess.detail.noAI')}</p>
        )}
        {context.group === 'modelOnly' && view.change.equipment && <p className="rounded-md bg-muted/60 px-3 py-1 text-xs">{t('assess.detail.modelOnly', { model: view.change.equipment.from })}</p>}
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto bg-canvas px-12 py-6">
          {doc && (
            <DocumentPaper
              doc={doc}
              idPrefix={PAPER}
              // An unnumbered body is the whole record: mark only its words, not the page.
              highlight={active && active !== 'clause:body' ? new Set([active]) : undefined}
              renderText={(anchor, text) => marked(text, tokens.get(anchorKey(anchor)) ?? [])}
              marginOf={(anchor) => {
                const key = anchorKey(anchor)
                const n = numbers.get(key)
                return n ? <NoteNumber n={n} dashed={annotations[n - 1].aiOnly} active={active === key} onClick={() => setActive(key)} /> : null
              }}
            />
          )}
        </div>
        <aside className="w-[360px] shrink-0 space-y-3 overflow-auto border-l bg-background p-3 text-sm">
          {annotations.map((a, i) => (
            <NoteCard key={a.key} n={i + 1} view={view} context={context} annotation={a} active={active === a.key} onActivate={() => focus(a.key)} />
          ))}
          <UnresolvedNotes context={context} />
        </aside>
      </div>
    </section>
  )
}

function NoteCard({ n, view, context, annotation: a, active, onActivate }: { n: number; view: ChangeView; context: ItemContext; annotation: Annotation; active: boolean; onActivate: () => void }) {
  const { t } = useTranslation()
  const ai = context.ai.get(a.ref)
  const points = ai?.conclusion === 'change' ? [...a.rulePoints, ...ai.points] : []
  return (
    <article onClick={onActivate} className={cn('cursor-default rounded-md border p-3', active ? 'border-foreground' : 'border-border')}>
      <div className="flex items-start gap-2">
        <NoteNumber n={n} dashed={a.aiOnly} active={active} />
        <div className="min-w-0">
          <p className="truncate font-medium">{placeTitle(t, a)}</p>
          <p className="text-xs text-muted-foreground">{a.aiOnly ? t('assess.note.aiOnly') : t('assess.note.hit', { what: hitText(t, a) })}</p>
        </div>
      </div>
      {ai?.conclusion && (
        <p className="mt-2">
          <span className="text-xs text-ai">{t(`assess.note.conclusion.${ai.conclusion}`)}</span>
        </p>
      )}
      {points.length > 0 && (
        <ul className="mt-1 space-y-1">
          {points.map((p) => (
            <PointRow key={p.id} point={p} />
          ))}
        </ul>
      )}
      {ai?.note && (
        <p className="mt-1">
          <span className="text-ai">{ai.note}</span>
        </p>
      )}
      {a.followsNewVersion && (
        <p className="mt-2 text-xs text-muted-foreground">{t('assess.note.follows', { version: view.newVersion.version })}</p>
      )}
    </article>
  )
}

/** A 修改要点 as the report writes it; whether rules or AI found it does not matter to the reader (UX-50). */
function PointRow({ point: p }: { point: ChangePoint }) {
  const { t } = useTranslation()
  return (
    <li>
      {p.text || t('assess.note.point', { from: p.from, to: p.to })}
      {p.source.length > 0 && <span className="ml-1 text-xs text-muted-foreground">{p.source.map((n) => t('assess.note.source', { number: n })).join(' ')}</span>}
    </li>
  )
}

/** 「找不到」: numbers on this document that name nothing in the library — shown, never guessed. */
function UnresolvedNotes({ context }: { context: ItemContext }) {
  const { t } = useTranslation()
  const codes = [...new Set(context.unresolved.map((u) => u.code))]
  return codes.map((code) => {
    const places = context.unresolved
      .filter((u) => u.code === code)
      .map((u) => (u.field ? t(`doc.place.field.${u.field}`) : u.key === 'header' ? t('doc.place.header') : u.key === 'clause:body' ? t('doc.place.body') : t('doc.place.clause', { number: u.key.slice(7) })))
    return (
      <div key={code} className="rounded-md border border-dashed p-3 text-xs">
        <Tag className="mb-1">{t('doc.refs.notFound')}</Tag>
        <p>{t('assess.note.notFound', { place: places.join(t('common.listSep')), code })}</p>
      </div>
    )
  })
}

/** Words the rules matched, per anchor: hit tokens and numbers the library cannot find. */
function tokensByAnchor(context: ItemContext): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const add = (key: string, text: string) => map.set(key, [...new Set([...(map.get(key) ?? []), text])])
  for (const a of context.annotations) for (const h of a.hits) add(a.key, h.text)
  for (const u of context.unresolved) add(u.key, u.code)
  return map
}

function marked(text: string, tokens: string[]): ReactNode {
  if (tokens.length === 0 || !tokens.some((t) => text.includes(t))) return text
  const pattern = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)
  return text.split(pattern).map((part, i) =>
    tokens.includes(part) ? (
      <mark key={i} className="rounded-sm bg-mark px-0.5 text-foreground underline decoration-foreground/50 underline-offset-2">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

type T = TFunction

function placeTitle(t: T, a: Annotation): string {
  if (a.ref === 'header') return t('assess.note.header')
  if (a.ref === 'body') return t('assess.note.body')
  return t('assess.note.clause', { number: a.ref, heading: a.heading })
}

function hitText(t: T, a: Annotation): string {
  const equipment = a.hits.filter((h) => h.kind === 'model' || h.kind === 'deviceNo')
  const parts: string[] = []
  if (equipment.length > 0) {
    const text = equipment.map((h) => h.text).join(t('common.listSep'))
    parts.push(t(equipment.some((h) => h.inTable) ? 'assess.note.hitModelTable' : 'assess.note.hitModel', { text }))
  }
  for (const h of a.hits) {
    if (h.kind === 'code') parts.push(h.field ? t('assess.note.hitField', { field: t(`assess.note.field.${h.field}`), text: h.text }) : t('assess.note.hitCode', { text: h.text }))
    if (h.kind === 'via') parts.push(t('assess.note.hitVia', { text: h.text }))
  }
  return parts.join(t('common.listSep'))
}
