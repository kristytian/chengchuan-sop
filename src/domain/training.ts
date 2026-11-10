// 培训 (UX-53): who is trained on a revised document. Rule work on the new
// version's own text: the 职责 chapter names who does what (「乳化岗位操作人员按本规程操作设备…」, 「设备工程部负责维护保养…」);
// a maintenance table's 执行人 column says which rows are whose. A pack goes
// to every duty holder who is also an 执行人 — the people who carry the
// procedure out; a supervisor (班组长) is not one.
import type { Clause, SourceDocument } from '../data/schema.ts'
import type { DocumentVersion } from './model.ts'
import { TERMS } from './source-terms.ts'

export interface Audience {
  /** As 职责 words it: 乳化岗位操作人员, 设备工程部. */
  role: string
  /** The duty clause (3.1) and what it says (按本规程操作设备并填写使用日志). */
  clause: string
  duty: string
  /** The 执行人 a maintenance table names for this role (操作人员), if any. */
  executor: string | null
  /** Holders of the document who are trained: the role itself when it is a department, else the holders no other role is. */
  departments: string[]
}

/** Who holds controlled copies of a version now (台账 现行, not taken back). */
export function currentHolders(v: DocumentVersion): string[] {
  return [...new Set((v.ledger?.rows ?? []).filter((r) => r.status === TERMS.statusCurrent && !r.returnedDate).map((r) => r.holder))]
}

const tableRows = (c: Clause) => c.body.flatMap((b) => (b.kind === 'table' ? [b.rows] : []))

/** Every value of an 执行人 column in the document's tables. */
function executors(doc: SourceDocument): string[] {
  const found = new Set<string>()
  for (const c of doc.clauses)
    for (const rows of tableRows(c)) {
      const col = rows[0]?.indexOf(TERMS.executorHeader) ?? -1
      if (col >= 0) for (const row of rows.slice(1)) if (row[col]) found.add(row[col].trim())
    }
  return [...found]
}

const matches = (role: string, executor: string) => role === executor || role.endsWith(executor)

export function trainingAudiences(doc: SourceDocument, holders: readonly string[]): Audience[] {
  const chapter = doc.clauses.find((c) => c.heading.trim() === TERMS.dutiesHeading && c.number)
  if (!chapter) return []
  const duties = doc.clauses.flatMap((c) => {
    if (!c.number?.startsWith(`${chapter.number}.`)) return []
    const m = TERMS.duty.exec(c.heading.trim())
    return m ? [{ clause: c.number, role: m[1].trim(), duty: m[2].trim() }] : []
  })
  const doers = executors(doc)
  const roles = duties.map((d) => d.role)
  return duties.flatMap((d) => {
    const executor = doers.find((e) => matches(d.role, e)) ?? null
    if (!executor) return []
    const departments = holders.includes(d.role) ? [d.role] : holders.filter((h) => !roles.includes(h))
    return [{ ...d, executor, departments }]
  })
}
