// Joins files and the ledger into document identities and their versions.
import type { LedgerRow, SampleLibrary, SourceDocument } from '../data/schema.ts'
import { compareVersions, identityOf, parseCode } from './codes.ts'
import type { DocumentVersion, LedgerLink, ReviewDate, VersionStatus } from './model.ts'
import { TERMS } from './source-terms.ts'

export interface Catalog {
  versions: DocumentVersion[]
  /** Versions per identity, oldest first. */
  byIdentity: Map<string, DocumentVersion[]>
}

interface LedgerGroup {
  key: string
  identity: string
  code: string
  version: string
  rows: LedgerRow[]
}

export function buildCatalog(library: SampleLibrary): Catalog {
  const ledger = groupLedger(library.ledger)
  const taken = new Set<string>()
  const take = (group: LedgerGroup, match: LedgerLink['match']): LedgerLink => {
    taken.add(group.key)
    return { match, code: group.code, version: group.version, rows: group.rows }
  }

  // Exact number + version first, so a name fallback never takes a row another file owns.
  const exact = library.documents.map((doc) => {
    const group = ledger.get(versionKey(identityOf(doc.header.code), doc.header.version))
    return group && !taken.has(group.key) ? take(group, 'exact') : null
  })
  const fileVersions = library.documents.map((doc, i) => {
    const byName = exact[i] ? null : findByName(doc, ledger, taken)
    return fileVersion(doc, 'library', exact[i] ?? (byName ? take(byName, 'byName') : null))
  })
  const drafts = library.scenarioInputs.map((doc) => fileVersion(doc, 'draft', null))
  const ledgerOnly = [...ledger.values()].filter((g) => !taken.has(g.key)).map(ledgerOnlyVersion)

  const versions = [...fileVersions, ...drafts, ...ledgerOnly]
  const byIdentity = new Map<string, DocumentVersion[]>()
  for (const v of versions) byIdentity.set(v.identity, [...(byIdentity.get(v.identity) ?? []), v])
  for (const list of byIdentity.values()) list.sort((a, b) => compareVersions(a.version, b.version))
  return { versions, byIdentity }
}

/** The newest current version of an identity, if any. */
export function currentVersion(versions: readonly DocumentVersion[] | undefined): DocumentVersion | undefined {
  return versions?.filter((v) => v.status === 'current').at(-1)
}

function fileVersion(doc: SourceDocument, origin: 'library' | 'draft', ledger: LedgerLink | null): DocumentVersion {
  const { code, name, version, category, effectiveDate } = doc.header
  return {
    key: doc.source,
    identity: ledger?.match === 'byName' ? identityOf(ledger.code) : identityOf(code),
    printedCode: code,
    category,
    version,
    name,
    effectiveDate,
    origin,
    document: doc,
    status: origin === 'draft' ? 'draft' : ledger ? statusOf(ledger.rows) : 'unregistered',
    ledger,
    nextReview: ledger ? reviewOf(ledger.rows) : { kind: 'none' },
  }
}

function ledgerOnlyVersion(group: LedgerGroup): DocumentVersion {
  const [first] = group.rows
  return {
    key: `ledger:${group.key}`,
    identity: group.identity,
    printedCode: null,
    category: parseCode(group.code)?.category ?? null,
    version: group.version,
    name: first.name,
    effectiveDate: first.effectiveDate,
    origin: 'ledgerOnly',
    document: null,
    status: statusOf(group.rows),
    ledger: { match: 'exact', code: group.code, version: group.version, rows: group.rows },
    nextReview: reviewOf(group.rows),
  }
}

/** A ledger entry with the file's name, preferring the same identity, then the newest version. */
function findByName(doc: SourceDocument, ledger: Map<string, LedgerGroup>, taken: Set<string>): LedgerGroup | undefined {
  const own = identityOf(doc.header.code)
  return [...ledger.values()]
    .filter((g) => !taken.has(g.key) && g.rows[0].name === doc.header.name)
    .sort((a, b) => Number(b.identity === own) - Number(a.identity === own) || compareVersions(b.version, a.version))[0]
}

function groupLedger(rows: readonly LedgerRow[]): Map<string, LedgerGroup> {
  const groups = new Map<string, LedgerGroup>()
  for (const row of rows) {
    const identity = identityOf(row.code)
    const key = versionKey(identity, row.version)
    const group = groups.get(key) ?? { key, identity, code: row.code, version: row.version, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  return groups
}

function statusOf(rows: readonly LedgerRow[]): VersionStatus {
  if (rows.some((r) => r.status === TERMS.statusCurrent)) return 'current'
  if (rows.some((r) => r.status === TERMS.statusObsolete)) return 'obsolete'
  return 'unregistered'
}

function reviewOf(rows: readonly LedgerRow[]): ReviewDate {
  const value = rows.find((r) => r.nextReview)?.nextReview
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return { kind: 'date', date: value }
  if (value === TERMS.reviewFollowsParent) return { kind: 'followsParent' }
  if (value === TERMS.reviewNotApplicable) return { kind: 'notApplicable' }
  return { kind: 'none' }
}

const versionKey = (identity: string, version: string) => `${identity}@${version}`
