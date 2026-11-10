import type { ReactNode } from 'react'
import type { Block, Clause, SourceDocument } from '@/data/schema'
import { cn } from '@/lib/utils'
import { anchorId, anchorKey, type DocAnchor, type TextPlace } from './doc-anchor'

type RenderText = (anchor: DocAnchor, text: string, place: TextPlace) => ReactNode
const plain: RenderText = (_a, text) => text

interface DocumentPaperProps {
  doc: SourceDocument
  /** Prefix for anchor ids; unique per paper on the page. */
  idPrefix: string
  /** Anchor keys to mark (grey background), e.g. the clause a reference sits in. */
  highlight?: ReadonlySet<string>
  className?: string
  /** Extra content shown to the right of an anchor, inside the page margin (批注 markers). */
  marginOf?: (anchor: DocAnchor) => ReactNode
  /** Renders each piece of text — to mark hits, or a word diff; default prints it as is. */
  renderText?: RenderText
  /** Anchor keys with a change bar in the left margin (源头对比: 这一条有改动). */
  bars?: ReadonlySet<string>
}

/**
 * A plant document the way it is printed: 页眉, the header table, numbered
 * clauses in 宋体 with chapter headings in 黑体, tables, footer. A4 width
 * ratio at 540px; one long page that scrolls (00-overview 全站约定).
 */
export function DocumentPaper({ doc, idPrefix, highlight, className, marginOf, renderText = plain, bars }: DocumentPaperProps) {
  const isRecord = doc.header.category === 'SOR'
  const marked = (a: DocAnchor) => highlight?.has(anchorKey(a)) ?? false

  return (
    <article className={cn('mx-auto w-[540px] min-h-[764px] bg-paper px-11 py-8 font-song text-[12.5px] leading-[1.8] text-foreground shadow-sm ring-1 ring-border', className)}>
      <PageHeader lines={doc.pageHeader} />
      {isRecord && <h2 className="mt-4 text-center font-hei text-[15px]">{doc.header.name}</h2>}
      <div id={anchorId(idPrefix, { kind: 'header' })} className={cn('relative mt-3 scroll-mt-6', marked({ kind: 'header' }) && 'bg-mark')}>
        <Bar on={bars?.has('header')} />
        <HeaderTable rows={doc.headerTable} render={(text, row, cell) => renderText({ kind: 'header' }, text, { kind: 'header', row, cell })} />
        <Margin>{marginOf?.({ kind: 'header' })}</Margin>
      </div>
      <div className="mt-4 space-y-1">
        {doc.clauses.map((clause, i) => {
          const anchor: DocAnchor = { kind: 'clause', number: clause.number }
          return (
            <section
              key={`${clause.number ?? 'body'}-${i}`}
              id={anchorId(idPrefix, anchor)}
              className={cn('relative scroll-mt-6 rounded-sm', marked(anchor) && 'bg-mark')}
            >
              <Bar on={bars?.has(anchorKey(anchor))} />
              <ClauseView clause={clause} render={(text, place) => renderText(anchor, text, place)} />
              <Margin>{marginOf?.(anchor)}</Margin>
            </section>
          )
        })}
      </div>
      {doc.footer.length > 0 && (
        <footer className="mt-8 border-t border-foreground/40 pt-1.5 text-[10.5px] leading-snug text-muted-foreground">
          {doc.footer.map((line) => (
            <p key={line} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </footer>
      )}
    </article>
  )
}

function Bar({ on }: { on: boolean | undefined }) {
  if (!on) return null
  return <span aria-hidden className="absolute top-0 -left-4 h-full w-0.5 bg-foreground" />
}

function Margin({ children }: { children: ReactNode }) {
  if (!children) return null
  return <div className="absolute top-0 -right-9 flex w-7 flex-col items-center gap-1 font-sans">{children}</div>
}

/** 页眉: the samples print "company · line<TAB><TAB>note" — left and right of one rule. */
function PageHeader({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <header className="border-b border-foreground/50 pb-1 text-[10.5px] text-muted-foreground">
      {lines.map((line) => {
        const [left, ...rest] = line.split(/\t+/)
        return (
          <p key={line} className="flex justify-between gap-4">
            <span>{left}</span>
            <span>{rest.join(' ')}</span>
          </p>
        )
      })}
    </header>
  )
}

/** Rows alternate label, value…; a short row's last value spans the rest of the table. */
function HeaderTable({ rows, render }: { rows: string[][]; render: (text: string, row: number, cell: number) => ReactNode }) {
  const columns = Math.max(0, ...rows.map((r) => r.length))
  return (
    <table className="w-full table-fixed border-collapse text-[11.5px] leading-snug">
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => {
              const last = c === row.length - 1
              return (
                <td
                  key={c}
                  colSpan={last ? columns - row.length + 1 : 1}
                  className={cn('border border-foreground/60 px-1.5 py-1 align-middle', c % 2 === 0 ? 'w-[17%] text-center font-hei' : '')}
                >
                  {render(cell, r, c)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Chapters print as 「4 程序」 with an ideographic space (U+3000) between number and heading. */
const CHAPTER_GAP = String.fromCharCode(0x3000)

function ClauseView({ clause, render }: { clause: Clause; render: (text: string, place: TextPlace) => ReactNode }) {
  const { number, heading, body } = clause
  const isChapter = number !== null && !number.includes('.')
  return (
    <>
      {number !== null &&
        (isChapter ? (
          <h3 className="mt-3 font-hei text-[13px]">
            {number}
            {CHAPTER_GAP}
            {render(heading, { kind: 'heading' })}
          </h3>
        ) : (
          <p>
            {number} {render(heading, { kind: 'heading' })}
          </p>
        ))}
      {body.map((block, i) => (
        <BlockView key={i} block={block} indent={number !== null} render={(text, row, cell) => render(text, row === undefined ? { kind: 'paragraph', block: i } : { kind: 'cell', block: i, row, cell: cell! })} />
      ))}
    </>
  )
}

function BlockView({ block, indent, render }: { block: Block; indent: boolean; render: (text: string, row?: number, cell?: number) => ReactNode }) {
  if (block.kind === 'paragraph') return <p className={cn('whitespace-pre-wrap', indent && 'pl-[2em]')}>{render(block.text)}</p>
  const [head, ...rows] = block.rows
  return (
    <table className="my-1.5 w-full border-collapse text-[11.5px] leading-snug">
      <thead>
        <tr>
          {head.map((cell, i) => (
            <th key={i} className="border border-foreground/60 px-1.5 py-1 text-center font-hei font-normal whitespace-pre-wrap">
              {render(cell, 0, i)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td key={c} className="h-6 border border-foreground/60 px-1.5 py-1 whitespace-pre-wrap">
                {render(cell, r + 1, c)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
