import type { TFunction } from 'i18next'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns2, List, PanelLeftClose, Sparkles, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext, useSearchParams } from 'react-router'
import { Tag } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { displayCode } from '@/data/model'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TERMS } from '@/domain/source-terms'
import { USER_DEPARTMENT, useDemo } from '@/store/demo'
import { draftKey } from '@/store/drafts'
import type { ChangeView } from '../view'
import { DocxEditor, DocxOriginal, type DraftApi } from './DocxEditor'
import { originalDocx } from './docx'
import { docFormats } from './formats'
import { whyLine } from './labels'
import { approvedEffective } from '../rollout/model'
import { ReviewList } from './ReviewList'
import { type ReviewTarget, reviewTargets } from './model'
import { AI_AUTHOR, type ChangeReason, reasonOf, type TrackedChange } from './reasons'

/**
 * 审阅 (UX-50): AI has revised every 必须改 document of the exported report,
 * as tracked changes in its Word document. One document at a time: 原稿 (the
 * version in force, to look at) beside 修订稿 (AI's draft with its marks, where
 * the drafting department types directly — tracked in its name). Over the
 * draft: where each change is and why, one at a time; all of them on request;
 * AI's summary bottom right.
 */
export function ReviewPage() {
  const { t } = useTranslation()
  const view = useOutletContext<ChangeView>()
  const [params, setParams] = useSearchParams()
  const [showOriginal, setShowOriginal] = useState(true)
  const targets = useMemo(() => reviewTargets(view, view.reviews), [view])
  if (targets.length === 0) return <p className="mx-auto max-w-xl p-10 text-center text-sm text-muted-foreground">{t('review.waiting')}</p>
  // The station opens on the list; a draft is ?doc=…, so the browser's back returns to the list.
  const at = targets.findIndex((x) => x.version.identity === params.get('doc'))
  // A draft AI has not finished yet (R1-02) cannot be opened: the list shows where AI is.
  const progress = view.ai.revise
  if (at < 0 || (progress && at >= progress.done)) return <ReviewList targets={targets} progress={progress} onOpen={(i) => setParams({ doc: targets[i].version.identity })} />
  const go = (i: number) => setParams({ doc: targets[i].version.identity }, { replace: true })
  return (
    <Review
      key={targets[at].version.key}
      view={view}
      targets={targets}
      at={at}
      go={go}
      back={() => setParams({})}
      showOriginal={showOriginal}
      setShowOriginal={setShowOriginal}
    />
  )
}

function Review({
  view,
  targets,
  at,
  go,
  back,
  showOriginal,
  setShowOriginal,
}: {
  view: ChangeView
  targets: ReviewTarget[]
  at: number
  go: (i: number) => void
  back: () => void
  showOriginal: boolean
  setShowOriginal: (show: boolean) => void
}) {
  const { t } = useTranslation()
  const setReviewed = useDemo((s) => s.setReviewed)
  const startGeneration = useDemo((s) => s.startGeneration)
  const target = targets[at]
  // QA reviews every draft (UX-51); a confirmed one is read-only until withdrawn.
  const editable = !target.review.reviewedOn
  // Once reviewed, the draft reads as it will be: changes accepted on screen, the marks kept for 撤回.
  const final = !!target.review.reviewedOn
  const effective = final ? approvedEffective(view, target.version.key) : null
  const id = view.record.id
  const api = useRef<DraftApi | null>(null)
  const sync = useScrollSync()
  const [ready, setReady] = useState(false)
  const [changes, setChanges] = useState<TrackedChange[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [settled, setSettled] = useState<TrackedChange[]>([])
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null)
  const formats = useMemo(() => (target.version.document ? docFormats(target.version.document) : []), [target])
  const user = useMemo(() => ({ name: USER_DEPARTMENT, email: 'qa@chengchuan.test' }), [])

  const refresh = async () => {
    if (api.current) setChanges(await api.current.list())
  }
  const goTo = (c: TrackedChange) => {
    setActive(c.id)
    void api.current?.goTo(c)
  }
  const reject = async (c: TrackedChange) => {
    await api.current?.decide([c.id], 'reject')
    setActive(null)
    await refresh()
  }
  const confirm = async () => {
    await api.current?.flush()
    setReviewed(id, target.version.key, true)
    // The last draft confirmed opens 培训: AI starts on the training packs (R1-02).
    if (view.reviewed + 1 === view.toRevise && !useDemo.getState().generating[`${id}:training`]) startGeneration(id, 'training')
  }
  const current = changes.find((c) => c.id === active)

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b bg-background px-5 py-2 text-sm">
        <button type="button" onClick={back} className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <List className="size-4" />
          {t('review.list.back')}
        </button>
        <span className="h-5 border-l" />
        <button type="button" aria-label={t('review.prev')} disabled={at === 0} onClick={() => go(at - 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronLeft className="size-4" />
        </button>
        <Switcher view={view} targets={targets} at={at} go={go} />
        <button type="button" aria-label={t('review.next')} disabled={at === targets.length - 1} onClick={() => go(at + 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronRight className="size-4" />
        </button>
        <Tag tone={target.review.reviewedOn ? 'strong' : 'plain'}>{target.review.reviewedOn ? t('review.list.reviewedOn', { date: shortDate(target.review.reviewedOn) }) : t('review.status.pending')}</Tag>
        <span className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!ready}
            onClick={() => void api.current?.download(t(final ? 'review.fileNameFinal' : 'review.fileName', { code: target.newCode, name: target.version.name }))}
          >
            {t('review.export')}
          </Button>
          {target.review.reviewedOn ? (
            <Button size="sm" variant="ghost" onClick={() => setReviewed(id, target.version.key, false)}>
              {t('review.undo')}
            </Button>
          ) : (
            <Button size="sm" disabled={!ready} onClick={() => void confirm()}>
              {t('review.confirm')}
            </Button>
          )}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-4 border-b bg-muted/30 px-5 py-1.5 text-xs">
        <span className="min-w-0 truncate">{whyLine(t, target)}</span>
      </div>

      {/* Word's toolbar, for the draft, across both columns */}
      {editable && <div ref={setToolbar} className="draft-toolbar h-10 shrink-0 border-b bg-background" />}
      <div className="flex min-h-0 flex-1">
        {showOriginal && (
          <section className="flex min-w-0 flex-1 border-r">
            <DocxOriginal
              load={() => originalDocx(target.version.key)}
              scroller={sync.left}
              head={
                <>
                  <span className="min-w-0 truncate px-4 text-xs">
                    <span className="font-semibold">{t('review.original')}</span>
                    <span className="text-muted-foreground"> · {t('review.originalOf', { version: target.version.version })}</span>
                  </span>
                  <button
                    type="button"
                    title={t('review.hideOriginal')}
                    aria-label={t('review.hideOriginal')}
                    onClick={() => setShowOriginal(false)}
                    className="mr-2 ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <PanelLeftClose className="size-4" />
                  </button>
                </>
              }
            />
          </section>
        )}
        <section className="relative flex min-w-0 flex-1">
          {(!editable || toolbar) && (
          <DocxEditor
            final={final}
            fill={effective ? { find: TERMS.pendingDate, replace: effective } : null}
            toolbar={editable ? toolbar : null}
            formats={formats}
            draftKey={draftKey(id, target.version.key)}
            original={() => originalDocx(target.version.key)}
            ops={target.ops}
            user={user}
            editable={editable}
            scroller={sync.right}
            title={
              <span className="flex shrink-0 items-center gap-2 pl-4 text-xs">
                {!showOriginal && (
                  <button type="button" onClick={() => setShowOriginal(true)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Columns2 className="size-3.5" />
                    {t('review.showOriginal')}
                  </button>
                )}
                <span className="font-semibold">{t('review.draft')}</span>
                <span className="text-muted-foreground">
                  · {t(final ? 'review.draftOfFinal' : editable ? 'review.draftOfEdit' : 'review.draftOfRead', { version: target.newVersion })}
                </span>
              </span>
            }
            head={
              ready &&
              (final ? (
                <Settled target={target} settled={settled} />
              ) : (
                <ChangeNav target={target} changes={changes} active={active} editable={editable} onGo={goTo} onReject={(c) => void reject(c)} />
              ))
            }
            onReady={(a) => {
              api.current = a
              setSettled(a.settled)
              setReady(true)
              void refresh()
            }}
            onChange={(listed) => {
              void refresh()
              if (listed) setActive(listed.active)
            }}
          />
          )}
          {current && (
            <ThisChange target={target} change={current} editable={editable} onReject={() => void reject(current)} onClose={() => setActive(null)} />
          )}
          <Summary
            target={target}
            onJump={(item) => {
              const hit = item.near
                ? changes.find((c) => c.inserted?.includes(item.near!))
                : changes.find((c) => reasonOf(target.ops, c).kind === (item.at === 'header' ? 'header' : 'history'))
              if (hit) goTo(hit)
              else if (item.near) void api.current?.find(item.near)
            }}
          />
        </section>
      </div>
    </div>
  )
}

/**
 * 原稿 follows 修订稿 as either scrolls, by how far down each is — the two run
 * page for page, the draft only a little longer by what it strikes out.
 */
function useScrollSync() {
  const [sync] = useState(() => {
    type Side = 'left' | 'right'
    const els: Record<Side, HTMLElement | null> = { left: null, right: null }
    const moving: Record<Side, boolean> = { left: false, right: false }
    const other = { left: 'right', right: 'left' } as const
    const follow = (side: Side) => () => {
      if (moving[side]) {
        moving[side] = false
        return
      }
      const [a, b] = [els[side], els[other[side]]]
      if (!a || !b) return
      const top = Math.round((a.scrollTop / Math.max(1, a.scrollHeight - a.clientHeight)) * (b.scrollHeight - b.clientHeight))
      if (Math.abs(b.scrollTop - top) < 2) return
      moving[other[side]] = true
      b.scrollTop = top
    }
    const handlers = { left: follow('left'), right: follow('right') }
    const attach = (side: Side) => (el: HTMLDivElement | null) => {
      els[side]?.removeEventListener('scroll', handlers[side])
      els[side] = el
      el?.addEventListener('scroll', handlers[side], { passive: true })
    }
    return { left: attach('left'), right: attach('right') }
  })
  return sync
}

/** 「改动 2 / 6 ↑↓ · 全部 13 ▾」: the changes that need reading, one by one; the rule ones only in the full list. */
function ChangeNav({
  target,
  changes,
  active,
  editable,
  onGo,
  onReject,
}: {
  target: ReviewTarget
  changes: TrackedChange[]
  active: string | null
  editable: boolean
  onGo: (c: TrackedChange) => void
  onReject: (c: TrackedChange) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const reasons = new Map(changes.map((c) => [c.id, reasonOf(target.ops, c)]))
  const ruled = changes.filter((c) => byRule(reasons.get(c.id)))
  const content = changes.filter((c) => !ruled.includes(c))
  const at = content.findIndex((c) => c.id === active)
  const step = (by: 1 | -1) => {
    if (content.length === 0) return
    const next = at < 0 ? (by > 0 ? 0 : content.length - 1) : (at + by + content.length) % content.length
    onGo(content[next])
  }
  const byAi = changes.filter((c) => c.author === AI_AUTHOR).length
  const item = (c: TrackedChange) => (
    <ChangeItem
      key={c.id}
      target={target}
      change={c}
      active={c.id === active}
      editable={editable}
      onOpen={() => {
        onGo(c)
        setOpen(false)
      }}
      onReject={() => onReject(c)}
    />
  )
  return (
    <div className="flex shrink-0 items-center gap-1 pr-3 text-xs">
      <span className="tabular-nums text-muted-foreground" title={t('review.navHint', { count: ruled.length })}>
        {at >= 0 ? t('review.nav', { n: at + 1, total: content.length }) : t('review.navNone', { total: content.length })}
      </span>
      <button type="button" aria-label={t('review.prevChange')} disabled={content.length === 0} onClick={() => step(-1)} className="rounded p-0.5 hover:bg-muted disabled:opacity-30">
        <ChevronUp className="size-4" />
      </button>
      <button type="button" aria-label={t('review.nextChange')} disabled={content.length === 0} onClick={() => step(1)} className="rounded p-0.5 hover:bg-muted disabled:opacity-30">
        <ChevronDown className="size-4" />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="ml-1 flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-muted aria-expanded:bg-muted">
          {t('review.allChanges', { count: changes.length })}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="end" className="flex max-h-[70vh] w-[24rem] flex-col p-0">
          <p className="shrink-0 border-b px-4 py-2 text-xs text-muted-foreground">{t('review.changesBy', { ai: byAi, department: target.department, person: changes.length - byAi })}</p>
          <ol className="min-h-0 flex-1 divide-y overflow-auto">
            {ruled.length > 0 && (
              <li>
                <button type="button" onClick={() => setRulesOpen(!rulesOpen)} className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-xs hover:bg-muted/50">
                  <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', rulesOpen && 'rotate-90')} />
                  <span className="shrink-0 font-medium">{t('review.ruled', { count: ruled.length })}</span>
                  <span className="min-w-0 truncate text-muted-foreground">{ruledWhat(t, ruled.map((c) => reasons.get(c.id)))}</span>
                </button>
                {rulesOpen && <ol className="divide-y border-t bg-muted/30">{ruled.map(item)}</ol>}
              </li>
            )}
            {content.map(item)}
            {changes.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted-foreground">{t('review.noChanges')}</li>}
          </ol>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** 定稿: what the draft took on its way here — 「含修订 13 处 · AI 12 · 生产技术部 1」. */
function Settled({ target, settled }: { target: ReviewTarget; settled: TrackedChange[] }) {
  const { t } = useTranslation()
  const ai = settled.filter((c) => c.author === AI_AUTHOR).length
  return (
    <span className="shrink-0 pr-4 text-xs text-muted-foreground" title={t('review.settledHint')}>
      {t('review.settled', { count: settled.length, ai, department: target.department, person: settled.length - ai })}
    </span>
  )
}

/** 「这一处」: over the top of the draft while the cursor is in a change — who, what, why, and taking it out. */
function ThisChange({ target, change, editable, onReject, onClose }: { target: ReviewTarget; change: TrackedChange; editable: boolean; onReject: () => void; onClose: () => void }) {
  const { t } = useTranslation()
  const ai = change.author === AI_AUTHOR
  return (
    <div className="absolute inset-x-0 top-9 z-10 flex items-start gap-3 border-b bg-background/95 px-4 py-2 text-xs shadow-sm backdrop-blur">
      <div className="min-w-0 flex-1">
        <p className="truncate">
          <span className={cn('mr-1.5 font-medium', ai ? 'text-ai' : 'text-foreground')}>{ai ? t('review.byAi') : change.author}</span>
          <span className="mr-1.5 text-muted-foreground">{t(`review.type.${typeOf(change)}`)}</span>
          <Excerpt change={change} />
        </p>
        <p className={cn('mt-0.5 truncate', ai ? 'text-ai' : 'text-muted-foreground')}>{reasonText(t, reasonOf(target.ops, change))}</p>
      </div>
      {editable && (
        <button type="button" onClick={onReject} className="shrink-0 font-medium hover:underline">
          {t(ai ? 'review.reject' : 'review.undoMine')}
        </button>
      )}
      <button type="button" aria-label={t('review.close')} onClick={onClose} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function Excerpt({ change }: { change: TrackedChange }) {
  const { t } = useTranslation()
  if (change.type === 'formatting') return <span>{change.formatted.map((k) => t(`review.formatWhat.${k}`)).join(t('common.listSep'))}</span>
  return (
    <>
      {change.deleted && <span className="text-muted-foreground line-through">{change.deleted}</span>}
      {change.deleted && change.inserted && <span className="text-muted-foreground"> → </span>}
      {change.inserted && <span className="underline decoration-1 underline-offset-2">{change.inserted}</span>}
    </>
  )
}

/** One change in the full list: who, what, why; the department can take it out. */
function ChangeItem({
  target,
  change,
  active,
  editable,
  onOpen,
  onReject,
}: {
  target: ReviewTarget
  change: TrackedChange
  active: boolean
  editable: boolean
  onOpen: () => void
  onReject: () => void
}) {
  const { t } = useTranslation()
  const ai = change.author === AI_AUTHOR
  return (
    <li className={cn('px-4 py-2 text-xs', active ? 'bg-mark/60' : 'hover:bg-muted/50')}>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <span className={cn('mr-1.5 font-medium', ai ? 'text-ai' : 'text-foreground')}>{ai ? t('review.byAi') : change.author}</span>
        <span className="text-muted-foreground">{t(`review.type.${typeOf(change)}`)}</span>
        <span className="mt-0.5 line-clamp-2 block text-sm leading-snug">
          <Excerpt change={change} />
        </span>
        <span className={cn('mt-0.5 block', ai ? 'text-ai' : 'text-muted-foreground')}>{reasonText(t, reasonOf(target.ops, change))}</span>
      </button>
      {editable && (
        <button type="button" onClick={onReject} className="mt-1 text-muted-foreground hover:text-foreground hover:underline">
          {t(ai ? 'review.reject' : 'review.undoMine')}
        </button>
      )}
    </li>
  )
}

const byRule = (r: ChangeReason | undefined) => r?.kind === 'code' || r?.kind === 'header'

/** 「文件编号、版本号、签字、生效日期」 — what the folded rule changes touch. */
function ruledWhat(t: TFunction, reasons: (ChangeReason | undefined)[]): string {
  const what = new Set(reasons.map((r) => (r?.kind === 'header' ? r.field : 'code')))
  return (['code', 'version', 'signature', 'effective'] as const)
    .filter((w) => what.has(w))
    .map((w) => t(`review.ruledWhat.${w}`))
    .join(t('common.listSep'))
}

function typeOf(c: TrackedChange) {
  if (c.type === 'formatting') return 'format'
  if (c.subtype.includes('table')) return 'table'
  if (c.subtype === 'paragraph-split') return 'split'
  return c.inserted && c.deleted ? 'replace' : c.deleted ? 'delete' : c.inserted ? 'insert' : 'other'
}

function reasonText(t: TFunction, r: ChangeReason): string {
  switch (r.kind) {
    case 'person':
      return t('review.reason.person')
    case 'ai':
      return t('review.reason.ai')
    case 'point':
      return t('review.reason.point', { text: r.text, source: r.source.map((s) => t('assess.note.source', { number: s })).join(' ') })
    case 'rewrite':
      return r.basis.length > 0 ? t('review.reason.rewriteBasis', { basis: r.basis.join(t('common.pointSep')) }) : t('review.reason.rewrite')
    case 'code':
      return t('review.reason.code')
    case 'header':
      return t(`review.reason.header.${r.field}`)
    case 'history':
      return t('review.reason.history')
  }
}

/** 「STP-GY-010 03 → 04 尿素乳膏工艺规程 ▾ · 第 2 / 7 份」 with the list of documents and where each stands. */
function Switcher({ view, targets, at, go }: { view: ChangeView; targets: ReviewTarget[]; at: number; go: (i: number) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const target = targets[at]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted aria-expanded:bg-muted">
        <span className="font-mono text-xs whitespace-nowrap">
          {displayCode(target.version)} → {target.newVersion}
        </span>
        <span className="truncate font-semibold">{target.version.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{t('review.of', { n: at + 1, total: targets.length })}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[32rem] p-1 text-sm">
        <p className="px-2 py-1 text-xs text-muted-foreground">{t('review.listTitle', { total: targets.length, done: view.reviewed })}</p>
        {targets.map((x, i) => (
          <button
            key={x.version.key}
            type="button"
            onClick={() => {
              go(i)
              setOpen(false)
            }}
            className={cn('flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-muted', i === at && 'bg-muted')}
          >
            <span className="w-44 shrink-0 font-mono text-xs whitespace-nowrap">
              {displayCode(x.version)} → {x.newVersion}
            </span>
            <span className="min-w-0 flex-1 truncate">{x.version.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{x.department}</span>
            <span className={cn('w-12 shrink-0 text-right text-xs', !x.review.reviewedOn && 'text-muted-foreground')}>
              {t(x.review.reviewedOn ? 'review.status.reviewed' : 'review.status.pending')}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** AI 修改总结, floating bottom right over the draft; each item goes to its place; collapses to a small pill. */
function Summary({ target, onJump }: { target: ReviewTarget; onJump: (item: ReviewTarget['summary'][number]) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  if (target.summary.length === 0) return null
  const label = t(target.example ? 'review.summaryExample' : 'review.summary')
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute right-4 bottom-4 z-10 flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-ai shadow-sm hover:text-foreground"
      >
        <Sparkles className="size-3.5" />
        {t('review.summaryCount', { label, count: target.summary.length })}
      </button>
    )
  return (
    <aside className="absolute right-4 bottom-4 z-10 max-h-[45%] w-80 overflow-auto rounded-lg border bg-background p-3 text-sm shadow-md">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ai">
        <Sparkles className="size-3.5" />
        <span title={target.example ? t('assess.aiExampleHint') : undefined}>{label}</span>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto hover:text-foreground">
          {t('review.collapse')}
        </button>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-ai">
        {target.summary.map((item) => (
          <li key={item.text}>
            <button type="button" onClick={() => onJump(item)} className="block text-left hover:text-foreground hover:underline">
              {item.text}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  )
}
