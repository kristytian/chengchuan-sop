// 审阅 (UX-50): what AI does to a document to revise, as operations on its
// .docx — each a tracked change written in the name of 「AI」 by the editor
// (SuperDoc), so the reviewer accepts or rejects them one by one and their
// own typing is tracked in their name. Rules decide most of it from the
// exported report: the next version, 生效日期 待定, the signatures blank,
// every versioned number of a document revised in this change moved on, the
// report's from → to points; AI's example adds whole rewrites and the
// 变更历史 row. Each operation keeps why, for the change list.
import type { SourceDocument } from '../data/schema.ts'
import { TERMS } from './source-terms.ts'
import { contentClauses } from './texts.ts'

/** 03 → 04, keeping the width. */
export const nextVersion = (version: string) => String(Number(version) + 1).padStart(version.length, '0')

/** A printed number with the version moved on: SOP-SC-041-01 → SOP-SC-041-02; records (no version suffix) stay. */
export function bumpedCode(code: string, version: string): string {
  return code.endsWith(`-${version}`) ? `${code.slice(0, -version.length)}${nextVersion(version)}` : code
}

/** A place AI rewrote whole: clause ref ("4.2", "body"); no block = the numbered line, no row = a paragraph. */
export interface Rewrite {
  clause: string
  block?: number
  row?: number
  cell?: number
  text: string
  /** The 修改要点 (by label) this rewrite carries out (UX-57). */
  points?: readonly string[]
}

/** How the reviewer closed a 修改要点 the draft did not carry out (UX-57): done by hand, or 不按这条改 with why. */
export interface PointClosure {
  state: 'done' | 'declined'
  note: string
  by: string
  on: string
}

/** How a 修改要点 reads, and how it is known from one stage to the next: its words, or 原文 → 改成. */
export const pointLabel = (p: { text: string; from: string | null; to: string | null }) => p.text || `${p.from} → ${p.to}`

/**
 * The rewrites that still stand on the report (UX-57): one is kept while every
 * point it carries out is on the report, unchanged, at its clause. A rewrite
 * that names no points is kept.
 */
export function applicableRewrites(rewrites: readonly Rewrite[], points: readonly { clause: string; text: string; from: string | null; to: string | null }[]): Rewrite[] {
  const on = new Set(points.map((p) => `${p.clause}|${pointLabel(p)}`))
  return rewrites.filter((r) => (r.points ?? []).every((label) => on.has(`${r.clause}|${label}`)))
}

export interface RevisionPlan {
  oldVersion: string
  /** Versioned numbers to move on: the source's and every document revised in this change. */
  codes: ReadonlyMap<string, string>
  /** The report's 修改要点 for this document; only those with from → to are applied by rule. */
  points: readonly { clause: string; text: string; from: string | null; to: string | null; source: readonly string[] }[]
  rewrites: readonly Rewrite[]
  /** AI's 变更描述 for a new 变更历史 row; null when there is none. */
  history: string | null
}

/** Why an operation is there — what the change list says about it. */
export type DraftReason =
  | { kind: 'point'; text: string; source: readonly string[] }
  | { kind: 'code' }
  | { kind: 'header'; field: 'version' | 'effective' | 'signature' }
  | { kind: 'rewrite'; basis: readonly string[] }
  | { kind: 'history' }

export interface DraftReplacement {
  find: string
  replace: string
  /** Only the first occurrence (a header-table value, a rewritten place); otherwise every one. */
  first: boolean
  /** The whole paragraph must read exactly `find` (header-table values such as 「01」). */
  exact: boolean
  /** Also in the page header and footer, where numbers and a record's version are printed too. */
  margins: boolean
  why: DraftReason
}

export interface DraftOperations {
  replacements: DraftReplacement[]
  /** A new last row of the 变更历史 table: version, date, description. */
  historyRow: string[] | null
}

export function draftOperations(doc: SourceDocument, plan: RevisionPlan): DraftOperations {
  const replacements: DraftReplacement[] = []
  const texts = allTexts(doc)
  const has = (s: string) => texts.some((t) => t.includes(s))

  // Rewrites first: they replace whole places, before smaller replacements could split them.
  const clauses = contentClauses(doc)
  for (const r of plan.rewrites) {
    const original = rewriteSource(clauses, r)
    const basis = r.points ?? plan.points.filter((p) => p.clause === r.clause && !p.from).map((p) => p.text)
    if (original) replacements.push({ find: original, replace: r.text, first: true, exact: false, margins: false, why: { kind: 'rewrite', basis } })
  }

  // The header table: label, value, label, value… — the draft is unsigned and not yet in force.
  const newVersion = nextVersion(plan.oldVersion)
  for (const row of doc.headerTable) {
    for (let i = 1; i < row.length; i += 2) {
      const [label, value] = [row[i - 1], row[i]]
      const set = (replace: string, field: 'version' | 'effective' | 'signature') => {
        if (value && value !== replace) replacements.push({ find: value, replace, first: true, exact: true, margins: false, why: { kind: 'header', field } })
      }
      if (TERMS.versionLabel.test(label)) set(newVersion, 'version')
      else if (TERMS.effectiveLabel.test(label)) set(TERMS.pendingDate, 'effective')
      else if (TERMS.drafterLabel.test(label)) set(TERMS.unsigned, 'signature')
      else if (TERMS.reviewerLabel.test(label)) set(TERMS.unreviewed, 'signature')
      else if (TERMS.approverLabel.test(label)) set(TERMS.unapproved, 'signature')
    }
  }

  // A record has no version cell; its footer reads 「SOR-SB-021-R01（第 02 版）」.
  for (const line of [...doc.pageHeader, ...doc.footer]) {
    const printed = TERMS.versionInFooter.exec(line)
    if (printed && printed[1] === plan.oldVersion) {
      replacements.push({ find: printed[0], replace: printed[0].replace(printed[1], newVersion), first: false, exact: false, margins: true, why: { kind: 'header', field: 'version' } })
    }
  }

  for (const [from, to] of plan.codes) if (has(from)) replacements.push({ find: from, replace: to, first: false, exact: false, margins: true, why: { kind: 'code' } })

  const seen = new Set<string>()
  for (const p of plan.points) {
    if (!p.from || !p.to || seen.has(p.from) || !has(p.from)) continue
    seen.add(p.from)
    replacements.push({ find: p.from, replace: p.to, first: false, exact: false, margins: true, why: { kind: 'point', text: pointLabel(p), source: p.source } })
  }

  const hasHistory = doc.clauses.some((c) => c.number && !c.number.includes('.') && c.heading === TERMS.historyChapter)
  return { replacements, historyRow: hasHistory && plan.history ? [newVersion, TERMS.pendingDate, plan.history] : null }
}

function allTexts(doc: SourceDocument): string[] {
  return [...doc.pageHeader, ...doc.footer, ...doc.headerTable.flat(), ...doc.clauses.flatMap((c) => [c.heading, ...c.body.flatMap((b) => (b.kind === 'paragraph' ? [b.text] : b.rows.flat()))])]
}

/** The text a rewrite replaces: the numbered line, a paragraph, or a table cell of the version in force. */
function rewriteSource(clauses: ReturnType<typeof contentClauses>, r: Rewrite): string | null {
  const c = clauses.find((x) => (x.number ?? 'body') === r.clause)
  if (!c) return null
  if (r.block === undefined) return c.heading || null
  const b = c.body[r.block]
  if (!b) return null
  if (r.row === undefined) return b.kind === 'paragraph' ? b.text : null
  return b.kind === 'table' ? (b.rows[r.row]?.[r.cell ?? 0] ?? null) : null
}
