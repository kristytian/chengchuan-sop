// One row per version in 文件库 · 本厂文件 (02 画面 1、2): library files,
// ledger-only entries and the revision drafts placed in a change.
import { displayCode, libraryModel } from '@/data/model'
import { incomingCitations, type LibraryCategory, libraryCategoryOf, type Supersession, supersessionOf } from '@/domain/library'
import type { DocumentVersion, ImportIssue } from '@/domain/model'
import type { ChangeView } from '@/features/change/view'

/** Status options of the filter; 已批准待生效 has no versions until a revision is approved. */
export const STATUS_OPTIONS = ['draft', 'approved', 'current', 'obsolete'] as const
export type StatusOption = (typeof STATUS_OPTIONS)[number]
export const DEFAULT_STATUSES: StatusOption[] = ['draft', 'approved', 'current']

export interface LibraryRow {
  version: DocumentVersion
  code: string
  category: LibraryCategory | null
  status: StatusOption
  department: string
  effectiveDate: string | null
  /** Live documents citing this one by number; null for obsolete versions and drafts. */
  citedBy: number | null
  /** Issues naming this version — shown to QA only. */
  issues: ImportIssue[]
  dueSoon: string | null
  supersession: Supersession | null
  /** Changes this version is part of: as the source (old or new version) or on the impact list. */
  inChanges: InChange[]
}

export interface InChange {
  view: ChangeView
  role: 'source' | 'draft' | 'impact'
}

const baseRows: LibraryRow[] = libraryModel.catalog.versions
  .filter((v) => v.origin !== 'draft')
  .map((v): LibraryRow => {
    const live = v.origin === 'library' && v.status === 'current'
    return {
      version: v,
      code: displayCode(v),
      category: libraryCategoryOf(v.identity),
      status: v.status === 'obsolete' ? 'obsolete' : 'current',
      department: v.document?.header.department ?? v.ledger?.rows[0]?.department ?? '',
      effectiveDate: v.effectiveDate,
      citedBy: live ? incomingCitations(libraryModel, v.identity).byNumber.length : null,
      issues: v.status === 'obsolete' ? [] : libraryModel.issues.filter((i) => i.versions.includes(v.key)),
      dueSoon: libraryModel.reminders.find((r) => r.version === v.key)?.date ?? null,
      supersession: v.status === 'obsolete' ? supersessionOf(libraryModel.catalog, v) : null,
      inChanges: [],
    }
  })

/** Rows for the current demo state: the library plus drafts placed in changes, with change roles filled in. */
export function libraryRows(views: readonly ChangeView[]): LibraryRow[] {
  const drafts: LibraryRow[] = views.map((view) => ({
    version: view.newVersion,
    code: displayCode(view.newVersion),
    category: libraryCategoryOf(view.newVersion.identity),
    status: 'draft',
    department: view.newVersion.document?.header.department ?? '',
    effectiveDate: view.newVersion.effectiveDate,
    citedBy: null,
    issues: [],
    dueSoon: null,
    supersession: null,
    inChanges: [{ view, role: 'draft' }],
  }))
  const rows = baseRows.map(
    (row): LibraryRow => ({
      ...row,
      inChanges: views.flatMap((view): InChange[] => {
        if (row.version.key === view.oldVersion.key) return [{ view, role: 'source' }]
        if (view.report.entries.some((e) => e.version === row.version.key)) return [{ view, role: 'impact' }]
        return []
      }),
    }),
  )
  return [...rows, ...drafts].sort((a, b) => a.code.localeCompare(b.code) || Number(a.version.version) - Number(b.version.version))
}
