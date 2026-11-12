import type { TFunction } from 'i18next'
import { Fragment, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext, useParams } from 'react-router'
import { Breadcrumb, Tag } from '@/components/common'
import { anchorId, anchorKey, parseAnchor } from '@/components/doc-anchor'
import { DocumentPaper } from '@/components/DocumentPaper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { changeAnalysis, displayCode, versionByKey } from '@/data/model'
import type { Annotation, ChangePoint } from '@/domain/assessment'
import { libraryCategoryOf } from '@/domain/library'
import type { DocumentVersion } from '@/domain/model'
import { pointLabel } from '@/domain/revision'
import { TERMS } from '@/domain/source-terms'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDemo } from '@/store/demo'
import { type ChangeView, entryOf } from '../view'
import { canEditReport, clauseWords, clausesOf, type ItemContext, itemContext } from './model'
import { Choice, NoteNumber } from './parts'

const PAPER = 'basis'

/**
 * 看原件和依据: one entry of the report — the original with the places AI and
 * the rules found, and what AI concluded at each (UX-50). While the report is
 * a draft, people write 修改要点 on the places of a 必须改 or 需评估 entry, or
 * on a place they add (UX-57): AI's points can be rewritten or taken out, the
 * rule points stay. A document put on by hand has only its original here.
 */
export function ItemDetail() {
  const { t } = useTranslation()
  const view = useOutletContext<ChangeView>()
  const { identity } = useParams()
  const item = changeAnalysis(view.change.id).impact.find((i) => i.identity === identity)
  if (item) return <Detail key={item.id} view={view} version={itemContext(view.change, item).version} context={itemContext(view.change, item)} />
  const added = view.report.entries.find((e) => e.origin === 'added' && versionByKey(e.version)?.identity === identity)
  const version = added ? versionByKey(added.version) : undefined
  if (version) return <Detail key={version.key} view={view} version={version} context={null} />
  return <p className="p-8 text-sm text-muted-foreground">{t('change.notFound')}</p>
}

/** One card on the right: a place AI or the rules found, or one a person added a point to. */
interface Card {
  key: string
  ref: string
  heading: string
  annotation: Annotation | null
}

const keyOf = (ref: string) => (ref === 'header' ? 'header' : `clause:${ref}`)

function Detail({ view, version, context }: { view: ChangeView; version: DocumentVersion; context: ItemContext | null }) {
  const { t } = useTranslation()
  const annotations = context?.annotations ?? []
  const doc = version.document
  const entry = entryOf(view, version.key)
  const removed = view.report.removed.find((r) => r.entry.version === version.key)
  const editable = canEditReport(view.stage === 'exported') && !!entry && (entry.group === 'mustChange' || entry.group === 'evaluate')
  const order = clausesOf(version.key).map((c) => c.ref)
  const cards: Card[] = [
    ...annotations.map((a) => ({ key: a.key, ref: a.ref, heading: a.heading, annotation: a })),
    ...(entry?.lines ?? []).filter((l) => !annotations.some((a) => a.ref === l.ref)).map((l) => ({ key: keyOf(l.ref), ref: l.ref, heading: l.heading, annotation: null })),
  ].sort((x, y) => order.indexOf(x.ref) - order.indexOf(y.ref))
  const [active, setActive] = useState<string | null>(cards[0]?.key ?? null)
  const category = libraryCategoryOf(version.identity)
  const numbers = new Map(cards.map((c, i) => [c.key, i + 1]))
  const tokens = context ? tokensByAnchor(context) : new Map<string, string[]>()
  const item = context?.item
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
          {item?.aiStatus === 'current' && (
            <span title={context?.example ? t('assess.aiExampleHint') : undefined} className="text-xs text-ai">
              {t(context?.example ? 'assess.detail.aiMarkerExample' : 'assess.detail.aiMarker')}
            </span>
          )}
        </div>
        {removed && <p className="text-xs">{t('assess.detail.removed', {
              by: removed.decision.by,
              date: removed.decision.on,
              note: removed.decision.note ? t('assess.detail.noteSuffix', { note: removed.decision.note }) : '',
            })}</p>}
        {!item ? (
          entry && <p className="text-xs">{t('assess.detail.added', { reason: entry.reason })}</p>
        ) : item.level === 'indirect' ? (
          <p className="text-xs text-muted-foreground">{t('assess.detail.indirect', { source: view.change.source.kind === 'revision' ? view.change.source.identity : '', via: item.via.join(t('common.listSep')) })}</p>
        ) : item.reason ? (
          <p className="text-xs">
            <span className="text-muted-foreground">{t('assess.detail.basis')}</span> <span className="text-ai">{item.reason}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('assess.detail.noAI')}</p>
        )}
        {context?.group === 'modelOnly' && view.change.equipment && <p className="rounded-md bg-muted/60 px-3 py-1 text-xs">{t('assess.detail.modelOnly', { model: view.change.equipment.from })}</p>}
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
                return n ? <NoteNumber n={n} dashed={cards[n - 1].annotation?.aiOnly} active={active === key} onClick={() => setActive(key)} /> : null
              }}
            />
          )}
        </div>
        <aside className="w-[360px] shrink-0 space-y-3 overflow-auto border-l bg-background p-3 text-sm">
          {cards.map((c, i) => (
            <NoteCard key={c.key} n={i + 1} view={view} version={version} context={context} card={c} editable={editable} active={active === c.key} onActivate={() => focus(c.key)} />
          ))}
          {editable && <AddPlace view={view} version={version} taken={cards.map((c) => c.ref)} onAdded={(ref) => setActive(keyOf(ref))} />}
          {context && <UnresolvedNotes context={context} />}
        </aside>
      </div>
    </section>
  )
}

function NoteCard({ n, view, version, context, card, editable, active, onActivate }: { n: number; view: ChangeView; version: DocumentVersion; context: ItemContext | null; card: Card; editable: boolean; active: boolean; onActivate: () => void }) {
  const { t } = useTranslation()
  const { addPoint, restorePoint } = useDemo()
  const [adding, setAdding] = useState(false)
  const a = card.annotation
  const ai = context?.ai.get(card.ref)
  const line = entryOf(view, version.key)?.lines.find((l) => l.ref === card.ref)
  // A 需评估 line says what to evaluate (AI's grey note); only a person's points (what to change if it must) are listed on it.
  const points = line ? (line.conclusion === 'evaluate' ? line.points.filter((p) => p.origin === 'person') : line.points) : ai?.conclusion === 'change' && a ? [...a.rulePoints, ...ai.points] : []
  const edits = view.assessment.points[version.key]
  const deleted = (ai?.points ?? []).filter((p) => edits && p.id in edits.deleted)
  return (
    <article onClick={onActivate} className={cn('cursor-default rounded-md border p-3', active ? 'border-foreground' : 'border-border')}>
      <div className="flex items-start gap-2">
        <NoteNumber n={n} dashed={a?.aiOnly} active={active} />
        <div className="min-w-0">
          <p className="truncate font-medium">{placeTitle(t, card.ref, card.heading)}</p>
          <p className="text-xs text-muted-foreground">{a ? (a.aiOnly ? t('assess.note.aiOnly') : t('assess.note.hit', { what: hitText(t, a) })) : t('assess.points.personPlace', { by: TERMS.departments.qa })}</p>
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
            <PointRow key={p.id} point={p} clause={card.ref} view={view} version={version} editable={editable} />
          ))}
        </ul>
      )}
      {deleted.map((p) => (
        <p key={p.id} className="mt-1 text-xs text-muted-foreground">
          <span className="line-through">{pointLabel(p)}</span> {t('assess.points.deleted', { by: edits!.deleted[p.id].by, date: shortDate(edits!.deleted[p.id].on) })}
          {editable && (
            <button type="button" className="ml-1.5 underline-offset-2 hover:underline" onClick={() => restorePoint(view.record.id, version.key, p.id)}>
              {t('assess.points.restore')}
            </button>
          )}
        </p>
      ))}
      {ai?.note && (
        <p className="mt-1">
          <span className="text-ai">{ai.note}</span>
        </p>
      )}
      {a?.followsNewVersion && (
        <p className="mt-2 text-xs text-muted-foreground">{t('assess.note.follows', { version: view.newVersion.version })}</p>
      )}
      {editable &&
        (adding ? (
          <PointForm
            versionKey={version.key}
            clause={card.ref}
            onCancel={() => setAdding(false)}
            onSave={(p) => {
              addPoint(view.record.id, version.key, p)
              setAdding(false)
            }}
          />
        ) : (
          <button type="button" className="mt-2 text-xs underline-offset-2 hover:underline" onClick={() => setAdding(true)}>
            {t('assess.points.add')}
          </button>
        ))}
    </article>
  )
}

/** A 修改要点 as the report writes it; whether rules or AI found it does not matter to the reader (UX-50). A person's is named as theirs, and can be changed. */
function PointRow({ point: p, clause, view, version, editable }: { point: ChangePoint; clause: string; view: ChangeView; version: DocumentVersion; editable: boolean }) {
  const { t } = useTranslation()
  const { editPoint, deletePoint, restorePoint } = useDemo()
  const [editing, setEditing] = useState(false)
  const link = 'underline-offset-2 hover:underline'
  if (editing)
    return (
      <li>
        <PointForm
          versionKey={version.key}
          clause={clause}
          initial={p}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            editPoint(view.record.id, version.key, p.id, next)
            setEditing(false)
          }}
        />
      </li>
    )
  return (
    <li>
      {p.text || t('assess.note.point', { from: p.from, to: p.to })}
      {p.source.length > 0 && <span className="ml-1 text-xs text-muted-foreground">{p.source.map((n) => t('assess.note.source', { number: n })).join(' ')}</span>}
      {p.origin === 'person' && p.by && <span className="ml-1 text-xs text-muted-foreground">{t('assess.points.by', { by: p.by, date: shortDate(p.on ?? '') })}</span>}
      {/* Rule points are locked (UX-57): the draft always applies them. */}
      {editable && p.origin !== 'rule' && (
        <span className="ml-1.5 inline-flex gap-1.5 text-xs text-muted-foreground">
          <button type="button" className={link} onClick={() => setEditing(true)}>
            {t('assess.points.edit')}
          </button>
          <button type="button" className={link} onClick={() => deletePoint(view.record.id, version.key, p.id)}>
            {t('assess.points.delete')}
          </button>
          {p.origin === 'person' && p.id.startsWith('ai:') && (
            <button type="button" className={link} onClick={() => restorePoint(view.record.id, version.key, p.id)}>
              {t('assess.points.restoreAi')}
            </button>
          )}
        </span>
      )}
    </li>
  )
}

type PointInput = { clause: string; text: string; from: string | null; to: string | null }

/** One sentence, or 原文 → 改成 — the 原文 must be in this clause, so the draft can replace it word for word. */
function PointForm({ versionKey, clause, initial, onSave, onCancel }: { versionKey: string; clause: string; initial?: ChangePoint; onSave: (p: PointInput) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'text' | 'replace'>(initial?.from ? 'replace' : 'text')
  const [text, setText] = useState(initial?.text ?? '')
  const [from, setFrom] = useState(initial?.from ?? '')
  const [to, setTo] = useState(initial?.to ?? '')
  const missing = mode === 'replace' && from.trim() !== '' && !clauseWords(versionKey, clause).includes(from.trim())
  const ready = mode === 'text' ? text.trim() !== '' : from.trim() !== '' && to.trim() !== '' && !missing
  return (
    <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2" onClick={(e) => e.stopPropagation()}>
      <Choice
        label={t('assess.points.text')}
        options={[
          { value: 'text', label: t('assess.points.modeText') },
          { value: 'replace', label: t('assess.points.modeReplace') },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'text' ? (
        <Textarea aria-label={t('assess.points.text')} rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      ) : (
        <div className="space-y-1.5 text-xs">
          <label className="block">
            <span className="text-muted-foreground">{t('assess.points.from')}</span>
            <Input aria-label={t('assess.points.from')} value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5" />
          </label>
          {missing && <p className="text-destructive">{t('assess.points.notInClause')}</p>}
          <label className="block">
            <span className="text-muted-foreground">{t('assess.points.to')}</span>
            <Input aria-label={t('assess.points.to')} value={to} onChange={(e) => setTo(e.target.value)} className="mt-0.5" />
          </label>
        </div>
      )}
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('assess.points.cancel')}
        </Button>
        <Button
          size="sm"
          disabled={!ready}
          onClick={() => onSave(mode === 'text' ? { clause, text: text.trim(), from: null, to: null } : { clause, text: '', from: from.trim(), to: to.trim() })}
        >
          {t('assess.points.save')}
        </Button>
      </div>
    </div>
  )
}

/** 「＋ 加一处」: a clause AI and the rules did not name, picked from the document, with its first point. */
function AddPlace({ view, version, taken, onAdded }: { view: ChangeView; version: DocumentVersion; taken: string[]; onAdded: (ref: string) => void }) {
  const { t } = useTranslation()
  const addPoint = useDemo((s) => s.addPoint)
  const [ref, setRef] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const free = clausesOf(version.key).filter((c, i, all) => !taken.includes(c.ref) && all.findIndex((x) => x.ref === c.ref) === i)
  if (!open)
    return (
      <button type="button" className="text-xs underline-offset-2 hover:underline" onClick={() => setOpen(true)}>
        {t('assess.points.addPlace')}
      </button>
    )
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <select aria-label={t('assess.points.pickPlace')} value={ref ?? ''} onChange={(e) => setRef(e.target.value || null)} className="w-full rounded-md border bg-background px-2 py-1 text-sm">
        <option value="">{t('assess.points.pickPlace')}</option>
        {free.map((c) => (
          <option key={c.ref} value={c.ref}>
            {placeTitle(t, c.ref, c.heading)}
          </option>
        ))}
      </select>
      {ref ? (
        <PointForm
          key={ref}
          versionKey={version.key}
          clause={ref}
          onCancel={() => {
            setRef(null)
            setOpen(false)
          }}
          onSave={(p) => {
            addPoint(view.record.id, version.key, p)
            onAdded(ref)
            setRef(null)
            setOpen(false)
          }}
        />
      ) : (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            {t('assess.points.cancel')}
          </Button>
        </div>
      )}
    </div>
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

function placeTitle(t: T, ref: string, heading: string): string {
  if (ref === 'header') return t('assess.note.header')
  if (ref === 'body') return t('assess.note.body')
  return t('assess.note.clause', { number: ref, heading: heading.length > 24 ? `${heading.slice(0, 24)}…` : heading })
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
