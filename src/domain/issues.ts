// The seven kinds of import issue for the QA-only 待确认清单, plus "due soon"
// reminders. Only library files are judged; drafts are not part of the library.
import { type Catalog, currentVersion } from './catalog.ts'
import { compareVersions, identityOf, parseCode } from './codes.ts'
import type { DocumentVersion, ImportIssue, IssueKind, Reference, Reminder } from './model.ts'
import { CURRENT_EDITION } from './references.ts'
import type { Settings } from './settings.ts'
import { TERMS } from './source-terms.ts'

export interface IssueInput {
  catalog: Catalog
  references: readonly Reference[]
  citedEditions: ReadonlyMap<string, readonly string[]>
  settings: Settings
}

/**
 * How an issue gets fixed (01 画面 7): editing the document goes through a
 * change; fixing the ledger or withdrawing an old original does not; an
 * overdue review is reviewed first.
 */
export type IssueFix = 'reviseDocument' | 'fixLedger' | 'review'

export function fixOf(kind: ImportIssue['kind']): IssueFix {
  switch (kind) {
    case 'numberConflict':
    case 'oldPharmacopoeia':
    case 'obsoleteReference':
      return 'reviseDocument'
    case 'multipleVersions':
    case 'ledgerMismatch':
    // Not found within what was imported: first find the original and add it to
    // the shared drive and ledger; only if there is none, draft it through a change.
    case 'missingCompanion':
      return 'fixLedger'
    case 'overdueReview':
      return 'review'
  }
}

export function detectIssues(input: IssueInput): { issues: ImportIssue[]; reminders: Reminder[] } {
  const files = input.catalog.versions.filter((v) => v.origin === 'library')
  const { issues: reviewIssues, reminders } = reviewChecks(files, input.settings)
  return {
    issues: [
      ...numberConflicts(files, input.references),
      ...multipleVersions(files),
      ...oldPharmacopoeia(files, input.citedEditions, input.settings),
      ...obsoleteReferences(input),
      ...reviewIssues,
      ...ledgerMismatches(files),
      ...missingCompanions(input),
    ],
    reminders,
  }
}

const issue = (kind: ImportIssue['kind'], rule: string, versions: string[], params: ImportIssue['params'] = {}): ImportIssue => ({
  id: `${kind}:${rule}:${versions.join('+')}${params.cited ? `:${String(params.cited)}` : ''}`,
  kind,
  rule,
  versions,
  params,
  status: 'pending',
})

const groupBy = <T>(items: readonly T[], key: (item: T) => string) => {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}
const distinct = (values: readonly string[]) => [...new Set(values)]

/**
 * 编号冲突:
 *   sameNumberDifferentNames — one number names different documents (一号两义);
 *   duplicateCode — two files print exactly the same number;
 *   recordParentMismatch — a record template's number and its 对应文件 disagree on the 序号.
 */
function numberConflicts(files: DocumentVersion[], references: readonly Reference[]): ImportIssue[] {
  const issues: ImportIssue[] = []
  const printed = (v: DocumentVersion) => v.printedCode ?? v.identity

  for (const [identity, versions] of groupBy(files, (v) => identityOf(printed(v)))) {
    const codes = distinct(versions.map(printed))
    const names = distinct(versions.map((v) => v.name))
    if (codes.length < 2 || names.length < 2) continue
    const citedBy = references.filter((r) => r.ambiguous && r.target.kind === 'document' && r.target.identity === identity)
    issues.push(
      issue('numberConflict', 'sameNumberDifferentNames', versions.map((v) => v.key), {
        identity,
        codes,
        names,
        ambiguousCitations: distinct(citedBy.map((r) => r.from.version)),
      }),
    )
  }

  const duplicated = new Set<string>()
  for (const [code, versions] of groupBy(files, printed)) {
    if (versions.length < 2) continue
    versions.forEach((v) => duplicated.add(v.key))
    issues.push(
      issue('numberConflict', 'duplicateCode', versions.map((v) => v.key), {
        code,
        names: versions.map((v) => v.name),
        correspondingDocs: versions.map((v) => v.document?.header.correspondingDoc ?? ''),
      }),
    )
  }

  for (const v of files) {
    const own = parseCode(printed(v))
    const corresponding = v.document?.header.correspondingDoc
    const parent = corresponding ? parseCode(corresponding) : null
    if (own?.category !== 'SOR' || !parent || parent.seq === own.seq || duplicated.has(v.key)) continue
    issues.push(issue('numberConflict', 'recordParentMismatch', [v.key], { code: printed(v), correspondingDoc: corresponding! }))
  }
  return issues
}

/** 多版本并存: the library holds more than one version of the same document. */
function multipleVersions(files: DocumentVersion[]): ImportIssue[] {
  return [...groupBy(files, (v) => identityOf(v.printedCode ?? v.identity)).entries()]
    .filter(([, versions]) => distinct(versions.map((v) => v.version)).length > 1 && distinct(versions.map((v) => v.name)).length === 1)
    .map(([identity, versions]) => {
      const sorted = [...versions].sort((a, b) => compareVersions(a.version, b.version))
      return issue('multipleVersions', 'sameDocument', sorted.map((v) => v.key), {
        identity,
        versions: sorted.map((v) => v.version),
        statuses: sorted.map((v) => v.status),
      })
    })
}

/** 引用旧版药典: a live document cites a 中国药典 edition older than the current one. */
function oldPharmacopoeia(files: DocumentVersion[], cited: IssueInput['citedEditions'], settings: Settings): ImportIssue[] {
  const current = Number(settings.currentPharmacopoeia.edition)
  return files
    .filter((v) => v.status !== 'obsolete')
    .flatMap((v) => {
      const old = (cited.get(v.key) ?? []).filter((e) => e !== CURRENT_EDITION && Number(e) < current)
      return old.length > 0 ? [issue('oldPharmacopoeia', 'olderEdition', [v.key], { editions: old, current: settings.currentPharmacopoeia.edition })] : []
    })
}

/**
 * 引用已作废文件:
 *   obsoleteDocument — the cited document has no current version (the ledger may name a replacement);
 *   outdatedVersion — the citation names a version older than the current one.
 */
function obsoleteReferences({ catalog, references }: IssueInput): ImportIssue[] {
  const byKey = new Map(catalog.versions.map((v) => [v.key, v]))
  const hits = new Map<string, { rule: string; from: string; params: ImportIssue['params']; clauses: string[] }>()

  for (const r of references) {
    if (r.target.kind !== 'document' || byKey.get(r.from.version)?.status === 'obsolete') continue
    const versions = (catalog.byIdentity.get(r.target.identity) ?? []).filter((v) => v.origin !== 'draft')
    const current = currentVersion(versions)
    let rule: string
    let params: ImportIssue['params']
    if (versions.length > 0 && versions.every((v) => v.status === 'obsolete')) {
      const replacement = versions.flatMap((v) => v.ledger?.rows ?? []).map((row) => TERMS.replacedBy.exec(row.remark)?.[1]).find(Boolean)
      rule = 'obsoleteDocument'
      params = { cited: r.target.identity, ...(replacement ? { replacement } : {}) }
    } else if (current && r.target.version && compareVersions(r.target.version, current.version) < 0) {
      rule = 'outdatedVersion'
      params = { cited: `${r.target.identity}-${r.target.version}`, current: current.version }
    } else continue

    const key = `${r.from.version}|${rule}|${String(params.cited)}`
    const hit = hits.get(key) ?? { rule, from: r.from.version, params, clauses: [] }
    hit.clauses.push(r.from.clause ?? '')
    hits.set(key, hit)
  }
  return [...hits.values()].map((h) => issue('obsoleteReference', h.rule, [h.from], { ...h.params, clauses: distinct(h.clauses) }))
}

/**
 * 超期未回顾: a current document's next review date (ledger, or effective date
 * + review period when the ledger has none) is before asOf. Due within
 * dueSoonDays after asOf is a reminder. Record templates that follow their
 * parent are covered by the parent.
 */
function reviewChecks(files: DocumentVersion[], settings: Settings): { issues: ImportIssue[]; reminders: Reminder[] } {
  const issues: ImportIssue[] = []
  const reminders: Reminder[] = []
  const soon = addDays(settings.asOf, settings.dueSoonDays)

  for (const v of files) {
    if (v.status !== 'current') continue
    let due: string | null = null
    let rule = 'ledgerDate'
    if (v.nextReview.kind === 'date') due = v.nextReview.date
    else if (v.nextReview.kind === 'none' && v.category !== 'SOR' && v.effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(v.effectiveDate)) {
      due = addYears(v.effectiveDate, settings.reviewPeriodYears)
      rule = 'computedDate'
    }
    if (!due) continue
    if (due < settings.asOf) issues.push(issue('overdueReview', rule, [v.key], { due, asOf: settings.asOf }))
    else if (due <= soon) reminders.push({ kind: 'dueSoon', version: v.key, date: due })
  }
  return { issues, reminders }
}

/**
 * 台账与文件不一致:
 *   notInLedger — the ledger has no entry for the file;
 *   registeredDifferently — the ledger lists the file (same name) under another number or version;
 *   fieldsDiffer — same number and version, but the effective date or name differs.
 */
function ledgerMismatches(files: DocumentVersion[]): ImportIssue[] {
  return files.flatMap((v) => {
    const file = { code: v.printedCode ?? v.identity, version: v.version, effectiveDate: v.effectiveDate ?? '', name: v.name }
    if (!v.ledger) return [issue('ledgerMismatch', 'notInLedger', [v.key], file)]
    const [row] = v.ledger.rows
    const ledger = { ledgerCode: v.ledger.code, ledgerVersion: v.ledger.version, ledgerEffectiveDate: row.effectiveDate ?? '', ledgerName: row.name }
    if (v.ledger.match === 'byName') return [issue('ledgerMismatch', 'registeredDifferently', [v.key], { ...file, ...ledger })]
    if (row.effectiveDate !== v.effectiveDate || row.name !== v.name) return [issue('ledgerMismatch', 'fieldsDiffer', [v.key], { ...file, ...ledger })]
    return []
  })
}

/** The three documents every product must have (SMP-WJ-002 §4.2), by 品种号. */
export const PRODUCT_DOCUMENTS = ['standard', 'process', 'batchRecord'] as const
export type ProductDocument = (typeof PRODUCT_DOCUMENTS)[number]

const seq3 = (n: number) => String(n).padStart(3, '0')
const productCode: Record<ProductDocument, (product: number) => string> = {
  standard: (n) => `STP-BZ-${seq3(500 + n)}`,
  process: (n) => `STP-GY-${seq3(n)}`,
  batchRecord: (n) => `SOR-SC-${seq3(n)}-R01`,
}

/**
 * Reasons an issue lists, as i18n keys under issue.*: its kind, plus
 * unresolvedReference when what was not found is also cited by a library file
 * (配套缺失 and 引用找不到 have one source, so they share one row).
 */
export type IssueReason = IssueKind | 'unresolvedReference'

export function reasonsOf(issue: ImportIssue): IssueReason[] {
  return [issue.kind, ...(issue.kind === 'missingCompanion' && (issue.params.citedCodes ?? []).length > 0 ? (['unresolvedReference'] as const) : [])]
}

/**
 * 配套缺失 — two fixed rules, by the numbering rules (SMP-WJ-002 §4.2):
 *   productDocuments — every product has a quality standard STP-BZ-(500+品种号),
 *     a 工艺规程 STP-GY-品种号 and a batch record SOR-SC-品种号-R01;
 *   inspectionRecord — every inspection SOP (SOP-QC-5NN, or an SOP-QC whose name
 *     says 检验 / 检查; instrument SOPs are not) has SOR-QC-序号-R01.
 * Found means a version that is not obsolete, as a file or in the ledger. A
 * record is matched by its ledger number (catalog identity) and its 对应文件,
 * never by the number printed on its header alone. Library files citing what
 * was not found go into the same issue.
 */
function missingCompanions({ catalog, references }: IssueInput): ImportIssue[] {
  const live = (identity: string) =>
    (catalog.byIdentity.get(identity) ?? []).filter((v) => v.origin !== 'draft' && v.status !== 'obsolete')
  const latest = (versions: DocumentVersion[]) => currentVersion(versions) ?? versions.at(-1)
  const codeOf = (v: DocumentVersion) => v.printedCode ?? (v.category === 'SOR' ? v.identity : `${v.identity}-${v.version}`)

  const byKey = new Map(catalog.versions.map((v) => [v.key, v]))
  const citing = (codes: string[]) => {
    const hits = references.filter((r) => {
      const from = byKey.get(r.from.version)
      return r.target.kind === 'unresolved' && from?.origin === 'library' && from.status !== 'obsolete' && codes.includes(identityOf(r.target.code))
    })
    return {
      citingFiles: distinct(hits.map((r) => r.from.version)),
      citedCodes: distinct(hits.map((r) => (r.target.kind === 'unresolved' ? identityOf(r.target.code) : ''))),
    }
  }

  const issues: ImportIssue[] = []

  // Products, by 品种号, from the numbers that carry it: STP-BZ-5NN, STP-GY-NNN,
  // SOP-QC-5NN, and SOR-SC records whose 对应文件 is a 工艺规程.
  const products = new Map<number, DocumentVersion[]>()
  for (const identity of catalog.byIdentity.keys()) {
    const v = latest(live(identity))
    const code = parseCode(identity)
    if (!v || !code) continue
    const seq = Number(code.seq)
    const parent = v.document?.header.correspondingDoc ? parseCode(v.document.header.correspondingDoc) : null
    const product =
      code.category === 'STP' && code.area === 'BZ' && seq >= 500 ? seq - 500
      : code.category === 'STP' && code.area === 'GY' ? seq
      : code.category === 'SOP' && code.area === 'QC' && seq >= 500 ? seq - 500
      : code.category === 'SOR' && code.area === 'SC' && parent?.category === 'STP' && parent.area === 'GY' ? seq
      : null
    if (product !== null) products.set(product, [...(products.get(product) ?? []), v])
  }
  for (const [product, evidence] of [...products].sort(([a], [b]) => a - b)) {
    const found = PRODUCT_DOCUMENTS.map((kind) => ({ kind, v: latest(live(productCode[kind](product))) }))
    const missing = found.filter((f) => !f.v).map((f) => f.kind)
    if (missing.length === 0) continue
    const present = found.filter((f): f is { kind: ProductDocument; v: DocumentVersion } => f.v !== undefined)
    const productName = [...present.map((f) => f.v), ...evidence].map((v) => TERMS.productName.exec(v.name)?.[1]).find(Boolean) ?? ''
    const cited = citing(missing.map((kind) => productCode[kind](product)))
    issues.push(
      issue('missingCompanion', 'productDocuments', distinct([...present.map((f) => f.v.key), ...cited.citingFiles]), {
        product: String(product),
        productName,
        foundKinds: present.map((f) => f.kind),
        foundCodes: present.map((f) => codeOf(f.v)),
        missingKinds: missing,
        missingCodes: missing.map((kind) => productCode[kind](product)),
        ...cited,
      }),
    )
  }

  // Inspection SOPs and their records.
  for (const identity of catalog.byIdentity.keys()) {
    const code = parseCode(identity)
    const sop = latest(live(identity))
    if (!sop || code?.category !== 'SOP' || code.area !== 'QC') continue
    if (Number(code.seq) < 500 && !TERMS.inspectionSop.test(sop.name)) continue
    const record = `SOR-QC-${code.seq}-R01`
    const matched = live(record).some((v) => {
      const corresponding = v.document?.header.correspondingDoc
      return !v.document || (corresponding != null && identityOf(corresponding) === identity)
    })
    if (matched) continue
    const cited = citing([record])
    issues.push(
      issue('missingCompanion', 'inspectionRecord', distinct([sop.key, ...cited.citingFiles]), {
        sop: codeOf(sop),
        sopName: sop.name,
        missingCodes: [record],
        ...cited,
      }),
    )
  }
  return issues
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

function addYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}
