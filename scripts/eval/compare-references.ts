// Compares AI's 整篇抽引用 (ai-cache/referenceExtraction/) with the answer key
// (answers/references.csv), clause by clause, and writes one row per pair to
// scripts/eval/out/references-vs-ai.csv.
//
//   node scripts/eval/compare-references.ts
//
// A key row and an AI entry pair up when they sit in the same file and clause
// and point at the same thing: the same file, the same candidate set, the same
// 外部标准, or the same number that is not in the catalog. Results:
//   一致      same thing, same type
//   类型不同  same thing, different type (e.g. key 显式, AI 隐式)
//   部分一致  overlapping only: a target inside the other's candidates, candidate
//             sets that intersect, the same 通则 number with a different 版次,
//             or two standards that name no 通则 number, worded differently
//   AI 漏     key row with no AI entry
//   AI 多找   AI entry with no key row
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCatalog } from '../../src/domain/catalog.ts'
import { findCodes } from '../../src/domain/codes.ts'
import type { AIRun, ReferenceExtraction } from '../../src/domain/model.ts'
import { loadSampleLibrary } from '../../vite-plugins/import/library.ts'
import { BODY_CLAUSE, fileLabel, HEADER_CLAUSE, readCsv, type Row, writeCsv } from './answer-key.ts'

const TYPE_NAMES = { explicit: '显式', implicit: '隐式', external: '外部标准', notFound: '找不到' } as const
const RESULTS = ['一致', '类型不同', '部分一致', 'AI 漏', 'AI 多找'] as const
type Result = (typeof RESULTS)[number]

const root = join(import.meta.dirname, '..', '..')
const catalog = buildCatalog(loadSampleLibrary(root).library)
const labelOf = new Map(catalog.versions.filter((v) => v.origin !== 'draft').map((v) => [`${v.identity}@${v.version}`, fileLabel(v)]))
const label = (id: string) => labelOf.get(id) ?? id

/** One reference, either side, in the key's terms. */
interface Entry {
  file: string
  clause: string
  type: string
  target: string | null
  candidates: Set<string>
  standard: string | null
  /** Numbers a 找不到 names. */
  codes: Set<string>
  excerpt: string
  confidence: string
  reason: string
  note: string
}

const key = readCsv(join(root, 'answers', 'references.csv'))
if (!key) throw new Error('answers/references.csv is missing')
const keyEntries: Entry[] = key.rows.map((r) => {
  const isStandard = r.引用类型 === '外部标准'
  const target = isStandard ? null : r.对应文件编号 || null
  const candidates = new Set(r.候选文件编号.split(';').filter((c) => c && c !== target))
  return {
    file: r.文件编号,
    clause: r.条款编号,
    type: r.引用类型,
    target,
    candidates,
    standard: isStandard ? r.对应文件编号 : null,
    codes: r.引用类型 === '找不到' ? numbersIn(r.原文片段) : new Set(),
    excerpt: r.原文片段,
    confidence: '',
    reason: '',
    note: r.备注,
  }
})

const cacheDir = join(root, 'ai-cache', 'referenceExtraction')
const runs = readdirSync(cacheDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(cacheDir, f), 'utf8')) as AIRun<ReferenceExtraction>)
const aiEntries: Entry[] = runs.flatMap((run) =>
  run.output.references.map((r) => {
    const target = r.target ? label(r.target) : null
    return {
      file: label(run.subject),
      clause: r.clause === 'header' ? HEADER_CLAUSE : r.clause === 'body' ? BODY_CLAUSE : r.clause,
      type: TYPE_NAMES[r.type],
      target,
      candidates: new Set(r.candidates.map(label).filter((c) => c !== target)),
      standard: r.standard,
      codes: r.type === 'notFound' ? numbersIn(r.excerpt) : new Set<string>(),
      excerpt: r.excerpt,
      confidence: r.confidence,
      reason: r.reason,
      note: r.note,
    }
  }),
)

const keyFiles = new Set(keyEntries.map((e) => e.file))
const aiFiles = new Set(runs.map((r) => label(r.subject)))
const missingRuns = [...keyFiles].filter((f) => !aiFiles.has(f))

// Pair within each file + clause: exact matches first, then overlaps.
const pairs: { result: Result; k: Entry | null; a: Entry | null }[] = []
const group = (entries: Entry[]) => {
  const m = new Map<string, Entry[]>()
  for (const e of entries) m.set(`${e.file}\u0000${e.clause}`, [...(m.get(`${e.file}\u0000${e.clause}`) ?? []), e])
  return m
}
const keyGroups = group(keyEntries)
const aiGroups = group(aiEntries)
for (const place of new Set([...keyGroups.keys(), ...aiGroups.keys()])) {
  const ks = [...(keyGroups.get(place) ?? [])]
  const as = [...(aiGroups.get(place) ?? [])]
  for (const level of ['same', 'overlap'] as const) {
    for (const k of [...ks]) {
      const a = as.find((x) => (level === 'same' ? same(k, x) : overlaps(k, x)))
      if (!a) continue
      ks.splice(ks.indexOf(k), 1)
      as.splice(as.indexOf(a), 1)
      pairs.push({ result: level === 'overlap' ? '部分一致' : k.type === a.type ? '一致' : '类型不同', k, a })
    }
  }
  for (const k of ks) pairs.push({ result: 'AI 漏', k, a: null })
  for (const a of as) pairs.push({ result: 'AI 多找', k: null, a })
}

const order = new Map(catalog.versions.map((v, i) => [fileLabel(v), i]))
pairs.sort((x, y) => {
  const ex = (x.k ?? x.a)!
  const ey = (y.k ?? y.a)!
  return (order.get(ex.file) ?? 0) - (order.get(ey.file) ?? 0) || ex.clause.localeCompare(ey.clause, undefined, { numeric: true })
})

const HEADER = ['文件编号', '条款编号', '结果', '答案表类型', '答案表对应', '答案表候选', 'AI 类型', 'AI 对应', 'AI 候选', 'AI 置信度', '答案表片段', 'AI 片段', 'AI 理由', 'AI 备注', '答案表备注']
const rows: Row[] = pairs.map(({ result, k, a }) => ({
  文件编号: (k ?? a)!.file,
  条款编号: (k ?? a)!.clause,
  结果: result,
  答案表类型: k?.type ?? '',
  答案表对应: k ? (k.standard ?? k.target ?? '') : '',
  答案表候选: k ? [...k.candidates].join(';') : '',
  'AI 类型': a?.type ?? '',
  'AI 对应': a ? (a.standard ?? a.target ?? '') : '',
  'AI 候选': a ? [...a.candidates].join(';') : '',
  'AI 置信度': a?.confidence ?? '',
  答案表片段: k?.excerpt ?? '',
  'AI 片段': a?.excerpt ?? '',
  'AI 理由': a?.reason ?? '',
  'AI 备注': a?.note ?? '',
  答案表备注: k?.note ?? '',
}))
const outDir = join(root, 'scripts', 'eval', 'out')
mkdirSync(outDir, { recursive: true })
writeCsv(join(outDir, 'references-vs-ai.csv'), HEADER, rows)

// Summary: results overall, and per key type how many the AI found.
const tally = (filter: (p: (typeof pairs)[number]) => boolean) => RESULTS.map((r) => [r, pairs.filter((p) => p.result === r && filter(p)).length] as const)
console.log(`AI runs ${runs.length} · key rows ${keyEntries.length} · AI entries ${aiEntries.length}${missingRuns.length ? ` · no AI run for ${missingRuns.join(', ')}` : ''}`)
console.log(`all         ${tally(() => true).map(([r, n]) => `${r} ${n}`).join(' · ')}`)
// Per type: key rows by result (by the key's type), and AI 多找 by the AI's type.
for (const type of Object.values(TYPE_NAMES)) {
  const t = tally((p) => (p.k ? p.k.type === type : p.a!.type === type))
  console.log(`${type.padEnd(4, '　')}  key ${keyEntries.filter((e) => e.type === type).length} · ${t.map(([r, n]) => `${r} ${n}`).join(' · ')}`)
}
console.log('→ scripts/eval/out/references-vs-ai.csv')

function same(k: Entry, a: Entry): boolean {
  if (k.standard !== null || a.standard !== null) return k.standard !== null && a.standard !== null && squash(k.standard) === squash(a.standard)
  if (k.codes.size > 0 || a.codes.size > 0) return intersects(k.codes, a.codes)
  if (k.target || a.target) return k.target === a.target
  return k.candidates.size === a.candidates.size && [...k.candidates].every((c) => a.candidates.has(c))
}

function overlaps(k: Entry, a: Entry): boolean {
  if (k.standard !== null || a.standard !== null) {
    if (k.standard === null || a.standard === null) return false
    const chapter = (s: string) => s.match(/通则\s*(\d{4})/)?.[1] ?? null
    // Same 通则 number; or neither names one (e.g. two wordings of 指导原则（未写编号）).
    return chapter(k.standard) === chapter(a.standard)
  }
  const ks = new Set([...(k.target ? [k.target] : []), ...k.candidates])
  const as = new Set([...(a.target ? [a.target] : []), ...a.candidates])
  return intersects(ks, as)
}

function numbersIn(text: string): Set<string> {
  return new Set(findCodes(text).map((c) => c.code))
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true
  return false
}

function squash(s: string): string {
  return s.replace(/\s+/g, '')
}
