// Shapes of the sample library as imported at build time (vite-plugins/import)
// and bundled into the app. Everything here is what the source files say —
// seeded errors are kept as-is; status, review dates and document groups are
// derived later by src/domain from the ledger and numbering rules.

/** Numbering prefix: SMP-WJ-001-04 → SMP. */
export type DocCategory = 'SMP' | 'SOP' | 'STP' | 'SOR' | 'VP' | 'PX'

/** One body element of a .docx, in document order. */
export type Block = { kind: 'paragraph'; text: string } | { kind: 'table'; rows: string[][] }

/** Header-table fields exactly as printed on the document. */
export interface DocumentHeader {
  /** 文件编号 or 记录编号, e.g. `SOP-SB-021-02` / `SOR-SB-021-R01`. */
  code: string
  /** 文件名称; for record templates, the title line above the header table. */
  name: string
  /** From the code prefix; null when the prefix is not one of the six. */
  category: DocCategory | null
  /** 文件类别 as printed (controlled documents only). */
  categoryLabel: string | null
  /** 版本号 / 版本, kept as text: `"02"`. */
  version: string
  /** 生效日期 as printed: `2024-04-01`, or text such as `待定` on drafts. */
  effectiveDate: string
  /** 起草部门. */
  department: string
  /** 分发部门, split on 、 (controlled documents only; [] for records). */
  distribution: string[]
  /** 对应文件 (record templates only). */
  correspondingDoc: string | null
  /** 依据 (record templates only). */
  basis: string | null
}

/**
 * A numbered clause (`4.3.3`) with the blocks that follow it up to the next
 * numbered line. Text that cannot be cut by number becomes one clause with
 * `number: null`.
 */
export interface Clause {
  number: string | null
  /** Rest of the numbered line, e.g. `操作前检查` or `停机：均质降速至零后停止…`. */
  heading: string
  body: Block[]
}

export interface SourceDocument {
  /** Path relative to the repo root, e.g. `samples/02 操作规程/….docx`. */
  source: string
  header: DocumentHeader
  /** Non-empty page-header lines (页眉), e.g. the company line. */
  pageHeader: string[]
  /** The header table (文头表) exactly as printed, signatures included: label, value, label, value… per row. */
  headerTable: string[][]
  /** Non-empty footer lines (record templates print 对应 SOP-… here). */
  footer: string[]
  clauses: Clause[]
}

/** One row of the controlled-document ledger: one controlled copy. */
export interface LedgerRow {
  sheet: string
  /** Spreadsheet row number, for tracing back to the ledger. */
  row: number
  /** 文件编号 without version, e.g. `SOP-QC-011`. */
  code: string
  name: string
  version: string
  effectiveDate: string | null
  department: string
  drafter: string
  /** 下次回顾日期: a date, or text such as `随母文件` / `不适用`. */
  nextReview: string | null
  copyNo: string
  holder: string
  issuedDate: string | null
  returnedDate: string | null
  /** 状态 as written: `现行` / `作废`. */
  status: string
  remark: string
}

export interface SampleLibrary {
  /** samples/**\/*.docx — the factory's shared drive. */
  documents: SourceDocument[]
  /** samples/*.xlsx — the controlled-document ledger. */
  ledger: LedgerRow[]
  /** scenario-inputs/*.docx — revision drafts, not part of the library. */
  scenarioInputs: SourceDocument[]
}
