// 换版追踪 (UX-52): once the drafts are reviewed and approved in OA, the new
// versions go out and the old controlled copies come back. Everything here is
// rule work on the ledger: documents reissue by 文件组 (同组规则); each
// holder's copies are the ledger's rows of the version in force; the new copy
// takes the same number with the new version; the old ones are due back
// within the working days SMP-WJ-001 sets (「新版生效后 10 个工作日内」).
// Obsolete copies a holder never returned show as 上次换版遗留.
// What people did — approval registered, issue registered, a scan uploaded per
// returned copy — is a RolloutRecord; the state of every cell follows from it.
import type { Catalog } from './catalog.ts'
import type { DocumentVersion } from './model.ts'
import { TERMS } from './source-terms.ts'

/** A document reissued in this change: the version in force and the version it becomes. */
export interface Reissue {
  old: DocumentVersion
  newVersion: string
  /** The name the new version carries, when it is renamed (乳化均质机（RH-300）… → （RH-500）…). */
  newName?: string
  /** Its draft is confirmed in 审阅 (the source draft comes in whole, so it is ready). */
  ready: boolean
}

export interface RolloutCopy {
  /** Old controlled copy, e.g. SOP-SC-041-01-03. */
  copyNo: string
  /** The new one that replaces it, e.g. SOP-SC-041-02-03. */
  newCopyNo: string
  identity: string
  /** The new version's name, as issued. */
  name: string
  /** The old version's name, as the copy being returned reads. */
  oldName: string
  oldVersion: string
  newVersion: string
  holder: string
  group: string
}

/** An obsolete copy its holder never returned (台账 作废, no 收回日期). */
export interface LegacyCopy {
  copyNo: string
  identity: string
  name: string
  version: string
  holder: string
  remark: string
}

export interface RolloutGroup {
  /** The set's main identity (同组规则), or the document's own. */
  id: string
  members: Reissue[]
}

export interface RolloutPlan {
  groups: RolloutGroup[]
  /** Holders, the ones with most copies first. */
  departments: string[]
  copies: RolloutCopy[]
  legacy: LegacyCopy[]
}

const current = (row: { status: string; returnedDate: string | null }) => row.status === TERMS.statusCurrent && !row.returnedDate

/** Who holds what of the documents reissued, by 文件组. Reissues come in order (the source first). */
export function rolloutPlan(reissues: readonly Reissue[], setOf: ReadonlyMap<string, string>, catalog: Catalog): RolloutPlan {
  const groups: RolloutGroup[] = []
  for (const r of reissues) {
    const id = setOf.get(r.old.identity) ?? r.old.identity
    const group = groups.find((g) => g.id === id)
    if (group) group.members.push(r)
    else groups.push({ id, members: [r] })
  }
  // The set's main document first (SOP before its record, 工艺规程 before its batch record).
  for (const g of groups) g.members.sort((a, b) => Number(b.old.identity === g.id) - Number(a.old.identity === g.id))
  const copies = groups.flatMap((g) =>
    g.members.flatMap((r) =>
      (r.old.ledger?.rows ?? []).filter(current).map(
        (row): RolloutCopy => ({
          copyNo: row.copyNo,
          newCopyNo: newCopyNumber(row.copyNo, r.old.identity, r.old.version, r.newVersion),
          identity: r.old.identity,
          name: r.newName ?? r.old.name,
          oldName: r.old.name,
          oldVersion: r.old.version,
          newVersion: r.newVersion,
          holder: row.holder,
          group: g.id,
        }),
      ),
    ),
  )
  const counts = new Map<string, number>()
  for (const c of copies) counts.set(c.holder, (counts.get(c.holder) ?? 0) + 1)
  const departments = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!)
  const legacy = catalog.versions.flatMap((v) =>
    v.status !== 'obsolete'
      ? []
      : (v.ledger?.rows ?? [])
          .filter((row) => !row.returnedDate && counts.has(row.holder))
          .map((row): LegacyCopy => ({ copyNo: row.copyNo, identity: v.identity, name: v.name, version: v.version, holder: row.holder, remark: row.remark })),
  )
  return { groups, departments, copies, legacy }
}

/** SOP-SC-041-01-03 → SOP-SC-041-02-03: the same copy number, the new version. */
export function newCopyNumber(copyNo: string, identity: string, oldVersion: string, newVersion: string): string {
  const prefix = `${identity}-${oldVersion}-`
  return copyNo.startsWith(prefix) ? `${identity}-${newVersion}-${copyNo.slice(prefix.length)}` : `${copyNo} → ${newVersion}`
}

/** The return deadline in working days, as the document-control SMP words it; null when no text says. */
export function returnWorkdays(texts: readonly string[]): number | null {
  for (const text of texts) {
    const m = TERMS.returnDeadline.exec(text)
    if (m) return Number(m[1])
  }
  return null
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Working days after a date (Saturdays and Sundays skipped; public holidays are not modelled). */
export function addWorkdays(from: string, n: number): string {
  const d = day(from)
  let left = n
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--
  }
  return iso(d)
}

export const daysBetween = (from: string, to: string) => Math.round((day(to).getTime() - day(from).getTime()) / 86_400_000)

/** What people have done: approvals by group, issues by holder, returns by old copy number. */
export interface RolloutRecord {
  approvals: Readonly<Record<string, { approvedOn: string; effectiveOn: string }>>
  issued: Readonly<Record<string, { on: string }>>
  returns: Readonly<Record<string, { on: string }>>
}

export type CellState =
  | { kind: 'none' }
  | { kind: 'reviewing' }
  | { kind: 'awaitingApproval' }
  | { kind: 'toIssue'; count: number }
  | { kind: 'toReturn'; open: number; due: string; overdueDays: number }
  | { kind: 'returned'; on: string }

/** One cell of the board: a holder's copies of one group. */
export function cellState(plan: RolloutPlan, record: RolloutRecord, group: string, holder: string, today: string, workdays: number): CellState {
  const copies = plan.copies.filter((c) => c.group === group && c.holder === holder)
  if (copies.length === 0) return { kind: 'none' }
  const g = plan.groups.find((x) => x.id === group)!
  if (!g.members.every((m) => m.ready)) return { kind: 'reviewing' }
  const approval = record.approvals[group]
  if (!approval) return { kind: 'awaitingApproval' }
  if (!record.issued[holder]) return { kind: 'toIssue', count: copies.length }
  const open = copies.filter((c) => !record.returns[c.copyNo])
  if (open.length === 0) return { kind: 'returned', on: copies.map((c) => record.returns[c.copyNo].on).sort().at(-1)! }
  const due = addWorkdays(approval.effectiveOn, workdays)
  return { kind: 'toReturn', open: open.length, due, overdueDays: Math.max(0, daysBetween(due, today)) }
}

/** When a group's old copies are due back: working days after it takes effect; null before approval. */
export function dueDate(record: RolloutRecord, group: string, workdays: number): string | null {
  const approval = record.approvals[group]
  return approval ? addWorkdays(approval.effectiveOn, workdays) : null
}

/** Where one holder stands, for its row and its sign-off sheet. */
export interface HolderStatus {
  copies: number
  /** Groups it holds whose drafts are not all reviewed / not yet approved. */
  reviewing: number
  awaiting: number
  issuedOn: string | null
  /** Old copies not back yet (only counted once issued), and how many of them are late. */
  open: number
  overdue: number
  /** Legacy copies still out. */
  legacy: number
}

export function holderStatus(plan: RolloutPlan, record: RolloutRecord, holder: string, today: string, workdays: number): HolderStatus {
  const copies = plan.copies.filter((c) => c.holder === holder)
  const groups = plan.groups.filter((g) => copies.some((c) => c.group === g.id))
  const issuedOn = record.issued[holder]?.on ?? null
  const open = issuedOn ? copies.filter((c) => !record.returns[c.copyNo]) : []
  return {
    copies: copies.length,
    reviewing: groups.filter((g) => !g.members.every((m) => m.ready)).length,
    awaiting: groups.filter((g) => g.members.every((m) => m.ready) && !record.approvals[g.id]).length,
    issuedOn,
    open: open.length,
    overdue: open.filter((c) => today > (dueDate(record, c.group, workdays) ?? today)).length,
    legacy: plan.legacy.filter((l) => l.holder === holder && !record.returns[l.copyNo]).length,
  }
}

/** A holder's sign-off sheet can go out once every group it holds is approved. */
export function canIssue(plan: RolloutPlan, record: RolloutRecord, holder: string): boolean {
  const groups = new Set(plan.copies.filter((c) => c.holder === holder).map((c) => c.group))
  return [...groups].every((g) => record.approvals[g])
}

export interface RolloutSummary {
  groups: number
  /** Groups whose drafts are all reviewed but not yet approved. */
  toApprove: number
  approved: number
  /** Holders who can be issued to and are not yet. */
  toIssue: number
  copies: number
  returned: number
  overdue: number
  /** Legacy copies still out. */
  legacy: number
}

export function rolloutSummary(plan: RolloutPlan, record: RolloutRecord, today: string, workdays: number): RolloutSummary {
  const approved = plan.groups.filter((g) => record.approvals[g.id]).length
  const toApprove = plan.groups.filter((g) => !record.approvals[g.id] && g.members.every((m) => m.ready)).length
  const toIssue = plan.departments.filter((d) => !record.issued[d] && canIssue(plan, record, d)).length
  const overdue = plan.copies.filter((c) => {
    const approval = record.approvals[c.group]
    return approval && record.issued[c.holder] && !record.returns[c.copyNo] && today > addWorkdays(approval.effectiveOn, workdays)
  }).length
  return {
    groups: plan.groups.length,
    toApprove,
    approved,
    toIssue,
    copies: plan.copies.length,
    returned: plan.copies.filter((c) => record.returns[c.copyNo]).length,
    overdue,
    legacy: plan.legacy.filter((l) => !record.returns[l.copyNo]).length,
  }
}
