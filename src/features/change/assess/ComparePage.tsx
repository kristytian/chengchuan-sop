import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { Fragment, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext } from 'react-router'
import { Breadcrumb } from '@/components/common'
import { anchorId, anchorKey, type DocAnchor, parseAnchor, type TextPlace } from '@/components/doc-anchor'
import { DocumentPaper } from '@/components/DocumentPaper'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { changeAnalysis } from '@/data/model'
import type { Clause, SourceDocument } from '@/data/schema'
import { wordDiff } from '@/domain/diff'
import type { TextSegment } from '@/domain/model'
import { cn } from '@/lib/utils'
import type { ChangeView } from '../view'

/**
 * 源头对比 02 / 03 (03 画面 11): both originals side by side, by rules, no AI.
 * Left keeps what was deleted (struck through), right what was added
 * (underlined); a bar in the margin marks each changed clause. ↑ ↓ walk the
 * changes and move both pages together.
 */
export function ComparePage() {
  const { t } = useTranslation()
  const view = useOutletContext<ChangeView>()
  const diff = changeAnalysis(view.change.id).diff
  const oldDoc = view.oldVersion.document
  const newDoc = view.newVersion.document
  const [at, setAt] = useState(0)
  if (!diff || !oldDoc || !newDoc) return null

  const stops = [...diff.header.map(() => 'header'), ...diff.clauses.map((c) => `clause:${c.number ?? 'body'}`)]
  const changed = new Set(stops)
  const go = (i: number) => {
    setAt(i)
    for (const prefix of ['old', 'new']) document.getElementById(anchorId(prefix, parseAnchor(stops[i])))?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const headerValues = { old: new Set(diff.header.map((h) => h.old)), new: new Set(diff.header.map((h) => h.new)) }
  const sourceCode = view.change.source.kind === 'revision' ? view.change.source.identity : ''

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b bg-background px-5 py-2 text-sm">
        <Breadcrumb items={[{ label: t('station.assess.name'), to: '..' }, { label: t('assess.compare.crumb', { code: sourceCode, from: view.oldVersion.version, to: view.newVersion.version }) }]} />
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {t('assess.compare.legend', { from: view.oldVersion.version, to: view.newVersion.version, fromStatus: t('status.current'), toStatus: t('status.draft') })}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {t('assess.compare.nav', { n: at + 1, total: stops.length })}
          <button type="button" aria-label={t('assess.compare.prev')} disabled={at === 0} onClick={() => go(at - 1)} className="rounded p-1 hover:bg-muted disabled:opacity-40">
            <ChevronUp className="size-4" />
          </button>
          <button type="button" aria-label={t('assess.compare.next')} disabled={at === stops.length - 1} onClick={() => go(at + 1)} className="rounded p-1 hover:bg-muted disabled:opacity-40">
            <ChevronDown className="size-4" />
          </button>
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <Pane>
          <DocumentPaper
            doc={oldDoc}
            idPrefix="old"
            bars={changed}
            highlight={new Set([stops[at]])}
            renderText={(anchor, text, place) => diffed(anchor, text, place, newDoc, 'old', changed, headerValues.old)}
          />
        </Pane>
        <Pane>
          <DocumentPaper
            doc={newDoc}
            idPrefix="new"
            bars={changed}
            highlight={new Set([stops[at]])}
            renderText={(anchor, text, place) => diffed(anchor, text, place, oldDoc, 'new', changed, headerValues.new)}
          />
        </Pane>
      </div>
      <AiSummary />
    </div>
  )
}

function Pane({ children }: { children: ReactNode }) {
  return <div className="min-h-0 overflow-auto border-r bg-canvas px-8 py-6 last:border-r-0">{children}</div>
}

/** AI 总结 floats bottom right (画面 11); before the pre-run it is a small 「暂无」 pill. */
function AiSummary() {
  const { t } = useTranslation()
  return (
    <Popover>
      <PopoverTrigger className="absolute right-4 bottom-4 flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-ai shadow-sm hover:text-foreground">
        <Sparkles className="size-3.5" />
        {t('assess.compare.aiSummary')}
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-80 text-xs text-muted-foreground">
        {t('assess.compare.aiSummaryHint')}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Renders one piece of text with its word diff against the same place in the
 * other version. Only changed clauses and the changed header values are diffed;
 * a place the other version lacks is marked whole.
 */
function diffed(
  anchor: DocAnchor,
  text: string,
  place: TextPlace,
  other: SourceDocument,
  side: 'old' | 'new',
  changed: ReadonlySet<string>,
  headerValues: ReadonlySet<string>,
): ReactNode {
  if (!text) return text
  if (place.kind === 'header') {
    if (!headerValues.has(text)) return text
  } else if (!changed.has(anchorKey(anchor))) return text
  const counterpart = textAt(other, anchor, place)
  const segments: TextSegment[] =
    counterpart === undefined ? [{ text, op: side === 'old' ? 'removed' : 'added' }] : side === 'old' ? wordDiff(text, counterpart) : wordDiff(counterpart, text)
  const shown = segments.filter((s) => s.op === 'same' || s.op === (side === 'old' ? 'removed' : 'added'))
  return shown.map((s, i) =>
    s.op === 'same' ? (
      <Fragment key={i}>{s.text}</Fragment>
    ) : (
      <span key={i} className={cn('bg-mark', s.op === 'removed' ? 'line-through decoration-foreground' : 'underline decoration-foreground underline-offset-2')}>
        {s.text}
      </span>
    ),
  )
}

/** The text at the same place in a document: same header cell, or same clause / block / row / cell. */
function textAt(doc: SourceDocument, anchor: DocAnchor, place: TextPlace): string | undefined {
  if (place.kind === 'header') return doc.headerTable[place.row]?.[place.cell]
  if (anchor.kind !== 'clause') return undefined
  const clause: Clause | undefined = doc.clauses.find((c) => c.number === anchor.number)
  if (!clause) return undefined
  if (place.kind === 'heading') return clause.heading
  const block = clause.body[place.block]
  if (place.kind === 'paragraph') return block?.kind === 'paragraph' ? block.text : undefined
  return block?.kind === 'table' ? block.rows[place.row]?.[place.cell] : undefined
}
