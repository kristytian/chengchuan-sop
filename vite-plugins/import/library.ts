// Loads the whole sample library from disk: samples/**/*.docx, the ledger
// samples/*.xlsx and scenario-inputs/*.docx. Reads nothing else.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SampleLibrary, SourceDocument } from '../../src/data/schema.ts'
import { toSourceDocument } from './document.ts'
import { readDocx } from './docx.ts'
import { toLedgerRows } from './ledger.ts'
import { readXlsx } from './xlsx.ts'

export const SAMPLES_DIR = 'samples'
export const SCENARIO_DIR = 'scenario-inputs'

export interface LoadedLibrary {
  library: SampleLibrary
  /** Absolute paths of every file read, for the dev server to watch. */
  files: string[]
}

export function loadSampleLibrary(root: string): LoadedLibrary {
  const files: string[] = []
  const read = <T>(rel: string, parse: (bytes: Uint8Array) => T): T => {
    const abs = join(root, rel)
    files.push(abs)
    try {
      return parse(readFileSync(abs))
    } catch (error) {
      throw new Error(`[sop-samples] ${rel}: ${(error as Error).message}`, { cause: error })
    }
  }
  const readDocument = (rel: string): SourceDocument => read(rel, (bytes) => toSourceDocument(rel, readDocx(bytes)))

  const sampleFiles = listFiles(root, SAMPLES_DIR)
  const ledgerFiles = sampleFiles.filter((f) => f.endsWith('.xlsx') && !f.slice(SAMPLES_DIR.length + 1).includes('/'))
  if (ledgerFiles.length > 1) throw new Error(`[sop-samples] expected one ledger in ${SAMPLES_DIR}/, found ${ledgerFiles.join(', ')}`)

  const library: SampleLibrary = {
    documents: sampleFiles.filter((f) => f.endsWith('.docx')).map(readDocument),
    ledger: ledgerFiles.flatMap((f) => read(f, (bytes) => toLedgerRows(readXlsx(bytes)))),
    scenarioInputs: listFiles(root, SCENARIO_DIR)
      .filter((f) => f.endsWith('.docx'))
      .map(readDocument),
  }
  return { library, files }
}

/** Repo-relative paths under `dir`, sorted; skips hidden files and Office lock files (~$…). */
function listFiles(root: string, dir: string): string[] {
  const abs = join(root, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { recursive: true, encoding: 'utf8' })
    .filter((rel) => /\.(docx|xlsx)$/.test(rel) && !rel.split('/').some((part) => part.startsWith('.') || part.startsWith('~$')))
    .map((rel) => `${dir}/${rel}`)
    .sort()
}
