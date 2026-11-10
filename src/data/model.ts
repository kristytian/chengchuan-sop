import aiCache from 'virtual:ai-cache'
import { analyzeChange, type ChangeAnalysis, deriveLibraryModel } from '@/domain/library-model'
import type { Change, DocumentVersion } from '@/domain/model'
import { sampleLibrary } from './samples'

/** Derived once at startup from the bundled library (a few milliseconds for 35 documents). */
export const libraryModel = deriveLibraryModel(sampleLibrary)

/** Cached AI results from ai-cache/, bundled at build time; merged per change by analyzeChange. */
export const aiRuns = aiCache

const byKey = new Map(libraryModel.catalog.versions.map((v) => [v.key, v]))

export function versionByKey(key: string): DocumentVersion | undefined {
  return byKey.get(key)
}

/** A version by identity and version number, as used in routes (`SOP-SB-021` + `02`). */
export function findVersion(identity: string, version: string): DocumentVersion | undefined {
  return libraryModel.catalog.byIdentity.get(identity)?.find((v) => v.version === version)
}

/** Display number of a version: as printed, else identity + version for ledger-only entries. */
export function displayCode(v: DocumentVersion): string {
  return v.printedCode ?? (v.category === 'SOR' ? v.identity : `${v.identity}-${v.version}`)
}

export function domainChange(changeId: string): Change | undefined {
  return libraryModel.changes.find((c) => c.id === changeId)
}

const analyses = new Map<string, ChangeAnalysis>()

/** Clause diff and impact candidates of a change, computed once per change. */
export function changeAnalysis(changeId: string): ChangeAnalysis {
  let analysis = analyses.get(changeId)
  if (!analysis) {
    const change = domainChange(changeId)
    analysis = change ? analyzeChange(libraryModel, change, { aiRuns }) : { diff: null, impact: [], points: new Map() }
    analyses.set(changeId, analysis)
  }
  return analysis
}
