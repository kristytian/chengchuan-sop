// Answer key for references: answers/references.csv (evaluation only — CLAUDE.md).
//
//   node scripts/eval/references.ts            regenerate the 显式 rows, then verify every row
//   node scripts/eval/references.ts --verify   verify only; exit 1 on any miss
//
// 显式 rows (来源「规则」) come from the rule-based extraction in
// src/domain/references.ts: every numbered reference that resolves to a
// document in the library or the ledger. Rows written by hand (来源「人工」:
// 隐式, 外部标准, 找不到) are kept as they are. Verifying is mechanical: the
// file and clause exist, the 原文片段 is in that clause, and the number (or
// 通则 number) the row names is in the 片段.
// Reads samples/ and scenario-inputs/ through the library loader, never ai-cache/.
import { join } from 'node:path'
import { buildCatalog, currentVersion } from '../../src/domain/catalog.ts'
import { findCodes, identityOf } from '../../src/domain/codes.ts'
import { findEquipment } from '../../src/domain/equipment.ts'
import { extractReferences } from '../../src/domain/references.ts'
import { TERMS } from '../../src/domain/source-terms.ts'
import { loadSampleLibrary } from '../../vite-plugins/import/library.ts'
import { clauseLabel, fileLabel, pieces, readCsv, type Row, snippet, snippetPosition, writeCsv } from './answer-key.ts'

const HEADER = ['文件编号', '条款编号', '原文片段', '引用类型', '对应文件编号', '候选文件编号', '来源', '已核对', '备注']
const TYPES = ['显式', '隐式', '外部标准', '找不到']
const SOURCES = { rule: '规则', manual: '人工' }

const root = join(import.meta.dirname, '..', '..')
const csvPath = join(root, 'answers', 'references.csv')
const catalog = buildCatalog(loadSampleLibrary(root).library)
const files = catalog.versions.filter((v) => v.origin === 'library')
const byLabel = new Map(catalog.versions.filter((v) => v.origin !== 'draft').map((v) => [fileLabel(v), v]))
const piecesOf = new Map(files.map((v) => [fileLabel(v), pieces(v.document!)]))
if (piecesOf.size !== files.length) throw new Error('two library files share a label')

const existing = readCsv(csvPath)
if (existing && existing.header.join() !== HEADER.join()) throw new Error(`${csvPath}: columns should be ${HEADER.join(',')}`)
let rows = existing?.rows ?? []

if (!process.argv.includes('--verify')) {
  const key = (r: Row) => [r.文件编号, r.条款编号, r.原文片段, r.对应文件编号, r.候选文件编号].join('\u0000')
  const checked = new Set(rows.filter((r) => r.来源 === SOURCES.rule && r.已核对 === '是').map(key))
  const generated = ruleRows().map((r) => (checked.has(key(r)) ? { ...r, 已核对: '是' } : r))
  const before = new Set(rows.filter((r) => r.来源 === SOURCES.rule).map(key))
  const added = generated.filter((r) => !before.delete(key(r))).length
  rows = sortRows([...generated, ...rows.filter((r) => r.来源 !== SOURCES.rule)])
  writeCsv(csvPath, HEADER, rows)
  console.log(`references.csv  ${generated.length} 规则 rows (${added} new, ${before.size} gone), ${rows.length} rows in all`)
}

const problems = verify(rows)
const count = (column: string) => {
  const n = new Map<string, number>()
  for (const r of rows) n.set(r[column], (n.get(r[column]) ?? 0) + 1)
  return [...n].map(([k, v]) => `${k} ${v}`).join(' · ')
}
console.log(`references.csv  ${rows.length} rows · ${count('引用类型')} · ${count('来源')}`)
if (problems.length > 0) {
  console.error(`verify  ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`)
  process.exit(1)
}
console.log('verify  ok: every 原文片段 is in its clause, and every number it names is in the 片段')

/** One row per numbered reference the rules resolve, as the rules dedupe them (one per clause and target). */
function ruleRows(): Row[] {
  const { references } = extractReferences(catalog, findEquipment(catalog))
  const byKey = new Map(catalog.versions.map((v) => [v.key, v]))
  return references.flatMap((r) => {
    const target = r.target
    if (target.kind !== 'document') return []
    const from = byKey.get(r.from.version)!
    const clause = clauseLabel(r.from.location, r.from.clause)
    const hit = piecesOf
      .get(fileLabel(from))!
      .filter((p) => p.clause === clause)
      .map((p) => ({ text: p.text, at: findCodes(p.text).find((c) => c.code === r.text)?.index }))
      .find((p) => p.at !== undefined)
    if (!hit) throw new Error(`${fileLabel(from)} ${clause}: ${r.text} not in the text`)
    const resolved = resolve(target.identity, target.version, r.ambiguous)
    return [
      {
        文件编号: fileLabel(from),
        条款编号: clause,
        原文片段: snippet(hit.text, hit.at!),
        引用类型: '显式',
        对应文件编号: resolved.target,
        候选文件编号: resolved.candidates.join(';'),
        来源: SOURCES.rule,
        已核对: '否',
        备注: resolved.notes.join('；'),
      },
    ]
  })
}

/** The file a number points to: the cited version, else the current one; an ambiguous number lists its files instead. */
function resolve(identity: string, version: string | null, ambiguous: boolean): { target: string; candidates: string[]; notes: string[] } {
  const pool = (catalog.byIdentity.get(identity) ?? []).filter((v) => v.origin !== 'draft')
  const library = pool.filter((v) => v.origin === 'library')
  if (ambiguous) {
    const current = library.filter((v) => v.status === 'current')
    const candidates = (current.length > 0 ? current : library).map(fileLabel)
    return { target: '', candidates, notes: [`编号对应 ${candidates.length} 份不同文件`] }
  }
  const exact = version === null ? undefined : pool.find((v) => v.version === version)
  const v = exact ?? currentVersion(library) ?? currentVersion(pool) ?? pool.at(-1)!
  const notes: string[] = []
  if (version !== null && !exact) notes.push(`原文写 ${version} 版，库里没有，按现行 ${v.version} 版`)
  if (v.ledger?.match === 'byName' && v.printedCode && identityOf(v.printedCode) !== v.identity) notes.push(`该文件文头印 ${v.printedCode}，台账登记 ${v.ledger.code}`)
  if (v.status === 'obsolete') {
    const remark = v.ledger?.rows.map((r) => r.remark).find((r) => r.includes(TERMS.statusObsolete))
    notes.push(`${v.origin === 'ledgerOnly' ? '只在台账、' : ''}已作废${remark ? `（台账备注：${remark}）` : ''}`)
  }
  return { target: fileLabel(v), candidates: [], notes }
}

/** File order of the library, then where the 片段 sits in the file; 规则 before 人工 at the same place. */
function sortRows(list: Row[]): Row[] {
  const fileOrder = new Map(files.map((v, i) => [fileLabel(v), i]))
  const position = (r: Row) => [
    fileOrder.get(r.文件编号) ?? Number.MAX_SAFE_INTEGER,
    ...snippetPosition(piecesOf.get(r.文件编号) ?? [], r.条款编号, r.原文片段),
    r.来源 === SOURCES.rule ? 0 : 1,
  ]
  const keyed = list.map((r) => ({ r, k: position(r) }))
  keyed.sort((a, b) => a.k.reduce((d, x, i) => d || x - b.k[i], 0))
  return keyed.map(({ r }) => r)
}

function verify(list: Row[]): string[] {
  const problems: string[] = []
  const compact = (s: string) => s.replace(/\s+/g, '')
  list.forEach((r, i) => {
    const say = (what: string) => problems.push(`line ${i + 2} · ${r.文件编号} ${r.条款编号} · ${what}`)
    const all = piecesOf.get(r.文件编号)
    if (!all) return say('文件编号不是样本库里的文件')
    const clause = all.filter((p) => p.clause === r.条款编号)
    if (clause.length === 0) return say('文件里没有这一条')
    const core = r.原文片段.replace(/^…|…$/g, '')
    if (!core || !clause.some((p) => p.text.includes(core))) return say('这一条里找不到原文片段')
    if (Array.from(r.原文片段).length > 50) say('原文片段超过 50 字')
    if (!TYPES.includes(r.引用类型)) say(`引用类型「${r.引用类型}」不在 ${TYPES.join('/')} 里`)
    if (!Object.values(SOURCES).includes(r.来源)) say(`来源「${r.来源}」不对`)
    if (!['是', '否'].includes(r.已核对)) say(`已核对「${r.已核对}」不对`)

    const named = [r.对应文件编号, ...r.候选文件编号.split(';')].filter(Boolean)
    if (r.引用类型 !== '外部标准') for (const label of named) if (!byLabel.has(label)) say(`${label} 不是库里或台账里的文件`)
    if (r.引用类型 === '显式') {
      const identities = new Set(named.flatMap((l) => (byLabel.has(l) ? [byLabel.get(l)!.identity, identityOf(byLabel.get(l)!.printedCode ?? '')] : [])))
      if (named.length === 0) say('显式引用没写对应或候选文件')
      else if (!findCodes(core).some((c) => identities.has(identityOf(c.code)))) say('片段里没有对应文件的编号')
    }
    if (r.引用类型 === '找不到') {
      if (!findCodes(core).some((c) => !catalog.byIdentity.has(identityOf(c.code)))) say('片段里没有库里和台账里都找不到的编号')
    }
    if (r.引用类型 === '外部标准') {
      const chapter = /通则\s*(\d{4})/.exec(r.对应文件编号)?.[1]
      const edition = /\d{4}\s*年版|现行版/.exec(r.对应文件编号)?.[0]
      const mark = chapter ?? (r.对应文件编号.includes('指导原则') ? '指导原则' : edition)
      if (!mark) say('对应文件编号里没有版次或通则号')
      else if (!compact(core).includes(compact(mark))) say(`片段里没有「${mark}」`)
      if (edition && !all.some((p) => compact(p.text).includes(compact(edition)))) say(`文件里没有「${edition}」`)
    }
  })
  return problems
}
