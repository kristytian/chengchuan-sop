import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DraftOperations } from '@/domain/revision'
import { TERMS } from '@/domain/source-terms'
import { loadDraft, saveDraft } from '@/store/drafts'
import { BASE, loadSuperDoc } from './superdoc'
import { type DocFormat, lineTwips, referenceOf, twips } from './formats'
import { AI_AUTHOR, formattedOf, type TrackedChange } from './reasons'
import { type Segment, undoneEdits } from './tidy'

/** The slice of SuperDoc's API the page uses (superdoc@2 Document API). */
interface Match {
  target: unknown
  address: unknown
  snippet?: string
}
interface ParagraphProps {
  indent?: { left?: number; right?: number; firstLine?: number; hanging?: number }
  spacing?: { before?: number; after?: number; line?: number; lineRule?: string }
  alignment?: string
}
interface Node {
  paragraphIds?: { paraId: string }
  paragraph?: { inlines?: { run?: { text?: string } }[]; props?: ParagraphProps }
  table?: { rows: { cells: { content: { paragraphIds?: { paraId: string } }[] }[] }[] }
}
type Read<T> = { state: string; value?: T }
export interface DocApi {
  query: { match(input: unknown): Promise<{ items: Match[] }> }
  replace(input: unknown, options?: unknown): Promise<unknown>
  insert(input: unknown, options?: unknown): Promise<unknown>
  find(input: unknown): Promise<{ items: { address: unknown }[] }>
  getNode(address: unknown): Promise<{ node: Node }>
  tables: { insertRow(input: unknown, options?: unknown): Promise<unknown> }
  headerFooters: { parts: { list(): Promise<{ items: { refId: string }[] }> } }
  format: {
    readSelection(input: unknown): Promise<{ properties: { bold?: Read<boolean>; fontSize?: Read<number>; fontFamily?: Read<string> } }>
    apply(input: unknown, options?: unknown): Promise<unknown>
  }
  paragraphs: Record<'clearIndentation' | 'setIndentation' | 'clearSpacing' | 'setSpacing', (input: unknown, options?: unknown) => Promise<unknown>>
  trackChanges: {
    list(query?: unknown): Promise<{
      items: {
        id: string
        author?: string
        type: string
        subtype?: string
        insertedText?: string | null
        deletedText?: string | null
        formattingDeltaSummary?: string | null
        navigationTarget?: { blockId?: string; story?: { storyType?: string } }
        address: unknown
      }[]
    }>
    get(input: { id: string }): Promise<{ before?: { formatting?: { properties?: Record<string, unknown> } }; after?: { formatting?: { properties?: Record<string, unknown> } } }>
    decide(input: unknown): Promise<unknown>
  }
  projectHtml(input: unknown): Promise<{ content: string }>
  getHtml(input: unknown): string | Promise<string>
  blocks: {
    list(input: unknown): { blocks: { nodeId: string; nodeType: string; text?: string | null }[] } | Promise<{ blocks: { nodeId: string; nodeType: string; text?: string | null }[] }>
    delete(input: unknown): unknown
  }
}
export interface Instance {
  activeEditor: { doc: DocApi; focus(): void } | null
  setUser(user: { name: string; email: string }): Promise<void>
  setDocumentMode(mode: 'editing' | 'suggesting' | 'viewing'): void
  navigateTo(address: unknown): Promise<boolean>
  ui: {
    selection: {
      getSnapshot(): { target?: { segments?: { blockId: string }[] } | null; selectionTarget?: unknown }
      apply(target: unknown): unknown
    }
    trackChanges: {
      scrollTo(id: string): Promise<unknown>
      setActive(id: string | null): boolean
      subscribe(listener: (event: { snapshot: { activeId: string | null; listStatus: string } }) => void): () => void
    }
  }
  export(params: { exportType: string[]; exportedName?: string; triggerDownload?: boolean }): Promise<Blob>
  destroy(): void
}

/** What the 审阅 page can do to the open draft. */
export interface DraftApi {
  list(): Promise<TrackedChange[]>
  /** Shown as 定稿: the changes the draft carries, all taken as accepted on screen. */
  settled: TrackedChange[]
  decide(ids: string[], decision: 'accept' | 'reject'): Promise<void>
  goTo(change: TrackedChange): Promise<void>
  /** Scroll to the first place reading `text`. */
  find(text: string): Promise<void>
  download(name: string): Promise<void>
  /** Save the working copy now, not after the pause. */
  flush(): Promise<void>
}

/**
 * The toolbar is Word's, less four things: AI (it calls SuperDoc's service),
 * the mode switch (the page decides who may type), accepting changes (the
 * marks stay until approval; 不采用 and 撤销 are on the page), and the .docx's
 * own named styles — the samples are set by direct formatting, so 「Heading 1」
 * would be Word's default, not the template; 本文件格式 takes its place.
 */
const EXCLUDE = ['ai', 'document-mode', 'linked-style', 'track-changes-accept-selection', 'track-changes-reject-selection']
const STRING_IDS = [
  'undo',
  'redo',
  'zoom',
  'search',
  'font-family',
  'font-size',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'text-color',
  'highlight-color',
  'link',
  'image',
  'table',
  'table-actions',
  'insert-row-before',
  'insert-row-after',
  'insert-column-before',
  'insert-column-after',
  'delete-row',
  'delete-column',
  'delete-table',
  'remove-borders',
  'merge-cells',
  'split-cell',
  'fix-tables',
  'text-align',
  'bullet-list',
  'numbered-list',
  'indent-decrease',
  'indent-increase',
  'line-height',
  'copy-format',
  'clear-formatting',
  'table-of-contents',
  'watermark',
  'page-number',
  'ruler',
  'formatting-marks',
  'measurement-unit',
] as const

/** The samples' typefaces first (system fonts only, CLAUDE.md), then the two Latin ones Word documents use most. */
const FONTS = [...Object.entries(TERMS.fontStacks), ['Times New Roman', '"Times New Roman", serif'], ['Arial', 'Arial, sans-serif']].map(([label, stack]) => ({
  label,
  key: label,
  props: { style: { fontFamily: stack } },
}))

/** AI's changes grey, a person's near black — the same two tones as the change list (D-14). */
const AUTHOR_COLORS = { ai: '#8c8c8c', person: '#1f1f1f' }


const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const tracked = { changeMode: 'tracked', author: { name: AI_AUTHOR } }
const at = (paraId: string) => ({ kind: 'selection', start: { kind: 'text', blockId: paraId, offset: 0 }, end: { kind: 'text', blockId: paraId, offset: 0 } })

/** AI's draft, written into the .docx as tracked changes in the name of 「AI」. */
async function applyDraft(doc: DocApi, ops: DraftOperations) {
  const margins = (await doc.headerFooters.parts.list()).items.map((p) => ({ kind: 'story', storyType: 'headerFooterPart', refId: p.refId }))
  for (const r of ops.replacements) {
    for (const story of [undefined, ...(r.margins ? margins : [])]) {
      const found = await doc.query.match({ select: { type: 'text', pattern: r.find, caseSensitive: true }, in: story })
      // A header-table value is a whole cell (「01」), not every 01 in the text.
      const hits = r.exact ? found.items.filter((m) => m.snippet === r.find) : found.items
      for (const m of [...(r.first ? hits.slice(0, 1) : hits)].reverse()) await doc.replace({ target: m.target, text: r.replace }, tracked)
    }
  }
  if (ops.historyRow) {
    const tables = await doc.find({ select: { type: 'node', nodeType: 'table' } })
    const history = tables.items.at(-1)
    if (history) {
      await doc.tables.insertRow({ target: history.address })
      const row = (await doc.getNode(history.address)).node.table?.rows.at(-1)
      for (const [i, text] of ops.historyRow.entries()) {
        const paraId = row?.cells[i]?.content[0]?.paragraphIds?.paraId
        if (paraId) await doc.insert({ target: at(paraId), value: text }, tracked)
      }
    }
  }
}

/** A paragraph's redline — 「效果<del id>检查</del><ins id>检查</ins>。」 — as segments. */
function segmentsOf(html: string): Segment[] {
  const out: Segment[] = []
  const walk = (node: globalThis.Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out.push({ kind: 'text', text: child.textContent ?? '' })
      else if (child instanceof Element) {
        const id = child.getAttribute('data-superdoc-change-id')
        const tag = child.tagName.toLowerCase()
        if (id && (tag === 'ins' || tag === 'del')) out.push({ kind: tag, id, text: child.textContent ?? '' })
        else walk(child)
      }
    }
  }
  walk(new DOMParser().parseFromString(html, 'text/html').body)
  return out
}

/**
 * Takes out a person's tracked changes that change nothing — text struck and
 * typed back, formatting put on and off — by rejecting them, which leaves the
 * text as it reads. True when it took any out.
 */
async function tidy(doc: DocApi): Promise<boolean> {
  const mine = (await doc.trackChanges.list({ in: 'all' })).items.filter((c) => c.author && c.author !== AI_AUTHOR)
  if (mine.length === 0) return false
  const undo = new Set<string>()
  const ids = new Set(mine.map((c) => c.id))
  const blocks = new Set(
    mine.flatMap((c) => (c.type !== 'formatting' && c.navigationTarget?.blockId && c.navigationTarget.story?.storyType === 'body' ? [c.navigationTarget.blockId] : [])),
  )
  for (const nodeId of blocks) {
    const redline = await doc.projectHtml({ reviewMode: 'redline', scope: { kind: 'block', nodeType: 'paragraph', nodeId } }).catch(() => null)
    if (redline) for (const id of undoneEdits(segmentsOf(redline.content), (x) => ids.has(x))) undo.add(id)
  }
  for (const id of undo) await doc.trackChanges.decide({ decision: 'reject', target: { kind: 'id', id } })
  return undo.size > 0
}

const textOf = (n: Node) => (n.paragraph?.inlines ?? []).map((i) => i.run?.text ?? '').join('')
const whole = (id: string, length: number) => ({ kind: 'selection', start: { kind: 'text', blockId: id, offset: 0 }, end: { kind: 'text', blockId: id, offset: length } })
const value = <T,>(r: Read<T> | undefined) => (r?.state === 'uniform' ? r.value : undefined)

/**
 * 本文件格式: the paragraphs at the cursor take the format of the document's
 * own paragraph of that level — font, size, bold, indent, spacing — as
 * tracked changes in the reviewer's name. False when there is nothing to copy.
 */
async function applyFormat(sd: Instance, level: DocFormat): Promise<boolean> {
  const doc = sd.activeEditor?.doc
  const chosen = new Set((sd.ui.selection.getSnapshot().target?.segments ?? []).map((s) => s.blockId))
  if (!doc || chosen.size === 0) return false
  const found = (await doc.find({ select: { type: 'node', nodeType: 'paragraph' } })).items
  const nodes = await Promise.all(found.map(async (it) => (await doc.getNode(it.address)).node))
  const ids = nodes.map((n, i) => n.paragraphIds?.paraId ?? (found[i].address as { nodeId?: string }).nodeId ?? '')
  const texts = nodes.map(textOf)
  const ref = referenceOf(texts, level, new Set(ids.flatMap((id, i) => (chosen.has(id) ? [i] : []))))
  if (ref < 0) return false

  const runOf = async (i: number) => {
    const read = (await doc.format.readSelection({ target: whole(ids[i], texts[i].length) })).properties
    return { bold: value(read.bold) ?? false, fontSize: value(read.fontSize), font: value(read.fontFamily) }
  }
  const run = await runOf(ref)
  const inline = { bold: run.bold, fontSize: run.fontSize, ...(run.font ? { fontFamily: run.font, rFonts: { ascii: run.font, hAnsi: run.font, eastAsia: run.font } } : {}) }
  const props = nodes[ref].paragraph?.props ?? {}
  const { indent, spacing } = props
  const tracked = { changeMode: 'tracked' }
  // Only what differs, so a paragraph already in that format gets no empty formatting change.
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  for (const [i, id] of ids.entries()) {
    if (!chosen.has(id)) continue
    const target = { kind: 'block', nodeType: 'paragraph', nodeId: id }
    if (texts[i].length > 0 && !same(await runOf(i), run)) await doc.format.apply({ target: whole(id, texts[i].length), inline }, tracked)
    const own = nodes[i].paragraph?.props ?? {}
    if (same(own.indent, indent) && same(own.spacing, spacing)) continue
    await doc.paragraphs.clearIndentation({ target }, tracked)
    if (indent) {
      const set = Object.fromEntries(Object.entries(indent).flatMap(([k, v]) => (typeof v === 'number' ? [[k, twips(v)]] : [])))
      await doc.paragraphs.setIndentation({ target, ...set }, tracked)
    }
    await doc.paragraphs.clearSpacing({ target }, tracked)
    if (spacing) {
      const { before, after, line, lineRule } = spacing
      await doc.paragraphs.setSpacing(
        {
          target,
          ...(before !== undefined && { before: twips(before) }),
          ...(after !== undefined && { after: twips(after) }),
          ...(line !== undefined && { line: lineRule === 'auto' ? lineTwips(line) : twips(line), lineRule }),
        },
        tracked,
      )
    }
  }
  return true
}

/**
 * The draft as a Word document (SuperDoc, loaded only here). In 修订 mode a
 * person's typing becomes tracked changes in their name; the first time a
 * draft opens, AI's changes are written in as 「AI」. The working copy is
 * saved after each edit so the demo keeps it.
 */
export function DocxEditor({
  draftKey,
  original,
  ops,
  user,
  editable,
  final,
  fill,
  toolbar,
  formats,
  title,
  head,
  scroller,
  onReady,
  onChange,
}: {
  draftKey: string
  original: () => Promise<Blob>
  ops: DraftOperations
  user: { name: string; email: string }
  editable: boolean
  /**
   * 已确认审阅: show the draft as it will read — every change accepted, on
   * screen only. The kept copy keeps its marks, so 撤回 brings them back.
   */
  final: boolean
  /**
   * In 定稿 only: a value a later step settles, written in as it now reads —
   * 生效日期 「待定」 becomes the date registered at 登记批准 (R1-04).
   */
  fill?: { find: string; replace: string } | null
  /** Where the toolbar goes — across both columns; none when the draft is only to look at. */
  toolbar: HTMLElement | null
  /** 本文件格式 levels on offer, from the document's numbered clauses. */
  formats: DocFormat[]
  /** The column's header: its name, and what sits on its right; none when the page heads the paper itself. */
  title?: ReactNode
  head?: ReactNode
  /** The scrolling element, for keeping 原稿 level with it. */
  scroller: (el: HTMLDivElement | null) => void
  onReady: (api: DraftApi) => void
  /** The changes may differ now; with `listed`, the editor has indexed them and says which is at the cursor. */
  onChange: (listed?: { active: string | null }) => void
}) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const callbacks = useRef({ onReady, onChange })
  callbacks.current = { onReady, onChange }

  useEffect(() => {
    let sd: Instance | null = null
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let dirty = false
    let unsubscribe: (() => void) | undefined
    let tidying = false
    const save = async () => {
      clearTimeout(timer)
      dirty = false
      const doc = sd?.activeEditor?.doc
      if (!sd || !doc) return
      // An edit taken back by hand leaves no mark: drop those changes before keeping the copy.
      // The text reads the same afterwards, so the caret goes back where it was and typing carries on.
      if (editable && !tidying) {
        tidying = true
        const caret = sd.ui.selection.getSnapshot().selectionTarget
        const typing = !!host.current?.contains(document.activeElement)
        const tidied = await tidy(doc).finally(() => (tidying = false))
        if (tidied && caret) {
          sd.ui.selection.apply(caret)
          if (typing) sd.activeEditor?.focus()
        }
      }
      await saveDraft(draftKey, await sd.export({ exportType: ['docx'], triggerDownload: false }))
    }

    // Pasted text takes the format where it lands: a web page's size and colour are left behind,
    // so text copied from a suggestion reads like the paragraph it goes into.
    const plainPaste = (e: ClipboardEvent) => {
      const data = e.clipboardData
      if (!editable || !data?.types.includes('text/html') || (e as ClipboardEvent & { plain?: boolean }).plain) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const text = new DataTransfer()
      text.setData('text/plain', data.getData('text/plain'))
      const again = Object.assign(new ClipboardEvent('paste', { clipboardData: text, bubbles: true, cancelable: true }), { plain: true })
      e.target?.dispatchEvent(again)
    }
    const hostEl = host.current
    hostEl?.addEventListener('paste', plainPaste, true)

    const open = async () => {
      const SuperDoc = await loadSuperDoc()
      const saved = loadDraft(draftKey)
      const blob = saved ?? (await original())
      if (cancelled || !host.current) return
      const first = !saved
      const strings = Object.fromEntries(STRING_IDS.map((id) => [id, t(`review.toolbar.${id}`)]))
      const docFormat = formats.length > 0 && {
        type: 'dropdown',
        id: 'doc-format',
        region: 'left',
        size: 'wide',
        label: t('review.docFormat.label'),
        tooltip: t('review.docFormat.tooltip'),
        hasCaret: true,
        options: formats.map((f) => ({ id: f, label: t(`review.docFormat.${f}`) })),
        onSelect: ({ option }: { option?: { id: string } }) => {
          if (sd && option) void applyFormat(sd, option.id as DocFormat).then(() => sd?.activeEditor?.focus())
        },
      }
      sd = new SuperDoc({
        ...BASE,
        selector: host.current,
        toolbar: toolbar ?? undefined,
        document: new File([blob], 'draft.docx', { type: blob.type }),
        documentMode: editable || first || final ? 'suggesting' : 'viewing',
        viewing: { trackedChanges: 'markup' },
        user: first ? { name: AI_AUTHOR, email: 'ai@chengchuan.test' } : user,
        trackChanges: { authorColors: { resolve: (author: { name?: string }) => (author.name === AI_AUTHOR ? AUTHOR_COLORS.ai : AUTHOR_COLORS.person) } },
        ui: { comments: false, contextMenu: false, loading: false, toolbar: { excludeItems: EXCLUDE, strings, fonts: FONTS, customItems: docFormat ? [docFormat] : [] } },
        onReady: async () => {
          const doc = sd?.activeEditor?.doc
          if (!sd || !doc || cancelled) return
          if (first) {
            await applyDraft(doc, ops)
            await sd.setUser(user)
            if (!editable && !final) sd.setDocumentMode('viewing')
            await save()
          }
          const draft = api(sd, save, [])
          if (final) {
            draft.settled = await draft.list()
            await doc.trackChanges.decide({ decision: 'accept', target: { kind: 'all', story: 'all' } })
            if (fill) {
              const found = await doc.query.match({ select: { type: 'text', pattern: fill.find, caseSensitive: true } })
              for (const m of [...found.items].reverse()) await doc.replace({ target: m.target, text: fill.replace }, { changeMode: 'direct' })
            }
            sd.setDocumentMode('viewing')
          }
          if (cancelled) return
          setState('ready')
          callbacks.current.onReady(draft)
          // The editor indexes tracked changes after it is ready, and again on every edit and decision.
          unsubscribe = sd.ui.trackChanges.subscribe(({ snapshot }) =>
            callbacks.current.onChange(snapshot.listStatus === 'ready' ? { active: snapshot.activeId } : undefined),
          )
        },
        onEditorUpdate: () => {
          // Only the reviewer's own typing is kept; showing a confirmed draft as 定稿 is not.
          if (!editable) return
          clearTimeout(timer)
          dirty = true
          timer = setTimeout(() => {
            void save()
            callbacks.current.onChange()
          }, 600)
        },
      } as ConstructorParameters<typeof SuperDoc>[0]) as unknown as Instance
    }
    open().catch(() => !cancelled && setState('failed'))

    return () => {
      cancelled = true
      hostEl?.removeEventListener('paste', plainPaste, true)
      clearTimeout(timer)
      unsubscribe?.()
      // Keep what was typed in the last moment before leaving the document.
      if (dirty) void save().finally(() => sd?.destroy())
      else sd?.destroy()
    }
    // One editor per draft and mode; ops and the loader belong to the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, editable, final, user.name, toolbar, fill?.replace])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {(title || head) && (
        <div className="flex h-9 shrink-0 items-center border-b bg-background">
          {title}
          <span className="ml-auto" />
          {head}
        </div>
      )}
      <Paper state={state} host={host} scroller={scroller} />
    </div>
  )
}

/** The scrolling desk a SuperDoc page sits on, with its loading line. */
function Paper({ state, host, scroller }: { state: 'loading' | 'ready' | 'failed'; host: RefObject<HTMLDivElement | null>; scroller: (el: HTMLDivElement | null) => void }) {
  const { t } = useTranslation()
  return (
    <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto bg-canvas">
      {state !== 'ready' && (
        <p className="absolute inset-x-0 top-10 z-10 text-center text-sm text-muted-foreground">{t(state === 'failed' ? 'review.loadFailed' : 'review.loading')}</p>
      )}
      <div ref={host} className="draft-host min-h-full py-4" />
    </div>
  )
}

/** 原稿: the version in force, as its .docx reads — only to look at. */
export function DocxOriginal({ load, head, scroller }: { load: () => Promise<Blob>; head: ReactNode; scroller: (el: HTMLDivElement | null) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  useEffect(() => {
    let sd: Instance | null = null
    let cancelled = false
    const open = async () => {
      const SuperDoc = await loadSuperDoc()
      const blob = await load()
      if (cancelled || !host.current) return
      sd = new SuperDoc({
        ...BASE,
        selector: host.current,
        document: new File([blob], 'original.docx', { type: blob.type }),
        documentMode: 'viewing',
        ui: { comments: false, contextMenu: false, loading: false },
        onReady: () => !cancelled && setState('ready'),
      } as ConstructorParameters<typeof SuperDoc>[0]) as unknown as Instance
    }
    open().catch(() => !cancelled && setState('failed'))
    return () => {
      cancelled = true
      sd?.destroy()
    }
    // One viewer per document; the loader belongs to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center border-b bg-background">{head}</div>
      <Paper state={state} host={host} scroller={scroller} />
    </div>
  )
}

function api(sd: Instance, flush: () => Promise<void>, settled: TrackedChange[]): DraftApi {
  const doc = () => sd.activeEditor?.doc
  return {
    async list() {
      // Body, page header and footer alike.
      const r = await doc()?.trackChanges.list({ in: 'all' })
      return (r?.items ?? []).map((c) => ({
        id: c.id,
        author: c.author ?? '',
        type: c.type,
        subtype: c.subtype ?? '',
        inserted: c.insertedText || null,
        deleted: c.deletedText || null,
        formatted: c.type === 'formatting' ? formattedOf(c.formattingDeltaSummary) : [],
        address: c.address,
      }))
    },
    async decide(ids, decision) {
      for (const id of ids) await doc()?.trackChanges.decide({ decision, target: { kind: 'id', id } })
    },
    async goTo(change) {
      sd.ui.trackChanges.setActive(change.id)
      await sd.ui.trackChanges.scrollTo(change.id)
    },
    async find(text) {
      const found = await doc()?.query.match({ select: { type: 'text', pattern: escapeRegex(text), mode: 'regex', caseSensitive: true } })
      const first = found?.items[0]
      if (first) await sd.navigateTo(first.address)
    },
    async download(name) {
      await sd.export({ exportType: ['docx'], exportedName: name, triggerDownload: true })
    },
    flush,
    settled,
  }
}
