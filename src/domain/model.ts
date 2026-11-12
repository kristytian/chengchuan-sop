// Shapes derived from the sample library by src/domain (names follow
// docs/data-model.md). Derived once at startup; user decisions (confirming a
// reference, handling an issue) will live in the interaction store on top.
import type { DocCategory, LedgerRow, SourceDocument } from '../data/schema.ts'

export type VersionStatus = 'current' | 'obsolete' | 'draft' | 'unregistered'

export type ReviewDate =
  | { kind: 'date'; date: string }
  | { kind: 'followsParent' }
  | { kind: 'notApplicable' }
  | { kind: 'none' }

/** DocumentVersion: one version of a document, from a file, the ledger, or both. */
export interface DocumentVersion {
  /** Stable key: the source path, or `ledger:<identity>@<version>` for ledger-only versions. */
  key: string
  /** Identity as printed — or the ledger's, when the ledger registers this file under another number. */
  identity: string
  /** Number on the file header; null for ledger-only versions. */
  printedCode: string | null
  category: DocCategory | null
  version: string
  name: string
  effectiveDate: string | null
  /** library = samples/, draft = scenario-inputs/, ledgerOnly = in the ledger without a file. */
  origin: 'library' | 'draft' | 'ledgerOnly'
  document: SourceDocument | null
  /** From the ledger 状态; drafts are draft; files the ledger lacks are unregistered. */
  status: VersionStatus
  ledger: LedgerLink | null
  nextReview: ReviewDate
}

export interface LedgerLink {
  /** exact = same number and version; byName = only the name matched (the ledger disagrees with the file). */
  match: 'exact' | 'byName'
  code: string
  version: string
  rows: LedgerRow[]
}

/** DocumentSet: the unit of reissue; any member changing puts the rest up for checking. */
export interface DocumentSet {
  /** Main member's identity. */
  id: string
  /** product = quality standard + inspection SOP (+ records); withRecords = a document + its record templates. */
  kind: 'product' | 'withRecords' | 'single'
  main: string
  /** Identities, main first. */
  members: string[]
}

export interface Equipment {
  model: string
  name: string
  deviceNo: string | null
  /** Identity of the equipment SOP that names this model. */
  mainSop: string
}

export type ReferenceTarget =
  | { kind: 'document'; identity: string; version: string | null }
  | { kind: 'external'; edition: string | null; chapter: string }
  | { kind: 'equipment'; model: string }
  | { kind: 'implicit' }
  | { kind: 'unresolved'; code: string }

/** Reference: an edge of the dependency graph, from a clause (or header field) to what it cites. */
export interface Reference {
  id: string
  from: { version: string; location: 'header' | 'body'; clause: string | null }
  kind: 'code' | 'equipment' | 'pharmacopoeia' | 'implicit'
  target: ReferenceTarget
  /** 原文写法: the text as written. */
  text: string
  origin: 'rule' | 'ledger' | 'ai' | 'manual'
  confidence: 'high' | 'low'
  /** A version-less number whose identity names more than one document. */
  ambiguous: boolean
  status: 'pending' | 'confirmed' | 'rejected'
}

export type IssueKind =
  | 'numberConflict'
  | 'multipleVersions'
  | 'oldPharmacopoeia'
  | 'obsoleteReference'
  | 'overdueReview'
  | 'ledgerMismatch'
  /** 配套缺失: a product or inspection SOP without a companion document it must have (issues.ts). */
  | 'missingCompanion'

/** ImportIssue: one entry of the QA-only 待确认清单. Wording comes from i18n, keyed by kind + rule. */
export interface ImportIssue {
  id: string
  kind: IssueKind
  /** The narrower rule that fired, e.g. duplicateCode. */
  rule: string
  /** Keys of the document versions involved. */
  versions: string[]
  params: Record<string, string | string[]>
  status: 'pending' | 'resolved' | 'deferred'
}

export interface Reminder {
  kind: 'dueSoon'
  version: string
  date: string
}

/** Change: one revision of a source file, or of an external standard; the thread through the last three modules. */
export interface Change {
  id: string
  /** 变更控制单号: the number in OA, stored as text only; filled in by the user. */
  controlNo: string | null
  source:
    | { kind: 'revision'; identity: string; oldVersion: string; newVersion: string }
    | { kind: 'externalStandard'; chapter: string; edition: string | null }
  /** Equipment replaced by a revision, read from the model in the old and new names. */
  equipment: { from: string; to: string } | null
}

export interface HeaderChange {
  field: 'name' | 'version' | 'effectiveDate' | 'department' | 'distribution'
  old: string
  new: string
}

export interface TextSegment {
  text: string
  op: 'same' | 'added' | 'removed'
}

/** ClauseDiff: one changed clause between two versions; also the input for training summaries. */
export interface ClauseDiff {
  number: string | null
  type: 'added' | 'removed' | 'modified'
  oldText: string | null
  newText: string | null
  segments: TextSegment[]
}

export interface DocumentDiff {
  header: HeaderChange[]
  clauses: ClauseDiff[]
}

export type ImpactTier = 'mustChange' | 'evaluate' | 'inform'

/** ImpactItem: one row of the impact list. Tiers are suggested by AI and decided by people. */
export interface ImpactItem {
  id: string
  change: string
  /** Key of the affected document version. */
  version: string
  identity: string
  /** direct = cites the source (or shares its set); indirect = cites a direct item by number, for reference only. */
  level: 'direct' | 'indirect'
  /** Shares the source's document set, so it is up for checking regardless of citations. */
  inSameSet: boolean
  /** Ids of the references that put it on the list. */
  hits: string[]
  /** Indirect items: identities of the listed documents they cite. */
  via: string[]
  /** low when every direct hit is a low-confidence reference (e.g. equipment model only). */
  confidence: 'high' | 'low'
  /** AI suggestion from ai-cache: missing, current, or stale (inputs or prompt changed since the run). */
  aiStatus: AIStatus
  /** The suggestion is a hand-written example (ai-examples/), not a model run; the UI marks it so. */
  aiExample: boolean
  suggestedTier: ImpactTier | null
  suggestionConfidence: number | null
  /** Clauses of the affected document the suggestion names (clause number, or "body"). */
  suggestedClauses: string[]
  reason: string | null
  finalTier: ImpactTier | null
  status: 'pending' | 'confirmed' | 'rejected'
}

export type AIStatus = 'missing' | 'current' | 'stale'

export type AITask = 'impactAnalysis' | 'referenceSuggestion' | 'referenceExtraction' | 'changePoints' | 'revisionDraft' | 'trainingPack' | 'draftCheck'

/**
 * AIRun: one cached AI result (ai-cache/<task>/…json), or a hand-written
 * example in the same format (ai-examples/<task>/…json, mode 'example') for
 * screens that must show AI text before the pre-run. The prototype only reads
 * these; it never calls a model.
 */
export interface AIRun<Output = unknown> {
  task: AITask
  /** What the result is about: an impact item or a reference (see ai-inputs.ts). */
  subject: string
  /** Document version keys the input was built from. */
  inputVersions: string[]
  /** Hash of the exact input; a mismatch means the samples changed since the run. */
  inputHash: string
  promptVersion: string
  /** Model requested, and the model that actually answered (a refusal fallback may differ). */
  model: string
  servedBy: string
  mode: 'cache' | 'example'
  runAt: string
  output: Output
  /** Both calls when the first answer failed the checks. */
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
  stopReason: string | null
  /** The first answer failed the checks with these errors and was sent back once to be corrected; output is the corrected answer. */
  correction?: { errors: string[] }
}

export interface ImpactSuggestion {
  tier: ImpactTier | null
  cannotDetermine: boolean
  confidence: number
  reason: string
  clauses: string[]
}

export interface ReferenceSuggestion {
  /** Identities from the candidate list; empty when nothing fits. */
  targets: string[]
  notFound: boolean
  confidence: number
  reason: string
}

/**
 * AI's list of everything one document cites (整篇抽引用), for comparing with
 * the rule-based references. Entries name directory ids (`identity@version`,
 * see referenceDirectory); clause is a clause number, "header" or "body".
 */
export interface ReferenceExtraction {
  references: {
    clause: string
    /** Text as written, at most 50 characters. */
    excerpt: string
    type: 'explicit' | 'implicit' | 'external' | 'notFound'
    /** The one file it points to; null for external, notFound, and implicit references to a class or to one of several files. */
    target: string | null
    candidates: string[]
    /** External standards only, e.g. 中国药典 <版次> 通则 <编号>. */
    standard: string | null
    confidence: 'high' | 'medium' | 'low'
    reason: string
    note: string
  }[]
}

/** A person's (or AI's) conclusion on one 批注: 要改 / 不用改 / 待评估. */
export type NoteConclusion = 'change' | 'noChange' | 'evaluate'

/** One 修改要点. With both from and to, 修订 can apply it (套用) by replacing the text in that clause. */
export interface PointSuggestion {
  text: string
  from: string | null
  to: string | null
  /** Clauses of the new source version the point follows (源 §4.3.3). */
  source: string[]
}

/** AI 修改要点 for one impact item, per 批注: clause ref as in AI inputs ("4.4", "header", "body"). */
export interface ChangePointsSuggestion {
  annotations: { clause: string; conclusion: NoteConclusion | null; points: PointSuggestion[]; note: string }[]
}

/**
 * AI's revision draft for one document to revise (审阅, UX-50), beyond the
 * report's from → to points, which code applies: places it rewrote whole
 * (clause ref; no block = the clause heading, no row = a paragraph), the
 * 修改前后总结 — each item saying where it is (clause ref or "header", and a
 * word near it) so the page can jump there — and the 变更描述 for the new
 * 变更历史 row.
 */
/**
 * AI's training pack for one audience of a revision (培训, UX-53): a 改动摘要
 * written for them, and single-choice / true-false questions, each on one
 * clause of the new version. `answer` is the right option's index, or
 * true / false.
 */
export interface TrainingPackSuggestion {
  summary: string
  questions: { clause: string; type: 'single' | 'judge'; stem: string; options: string[]; answer: number | boolean }[]
}

export interface RevisionDraftSuggestion {
  summary: { text: string; at: string; near?: string }[]
  /** points: the 修改要点 (by label) each rewrite carries out, so a rewrite drops when its point is changed or taken out (UX-57). */
  rewrites: { clause: string; block?: number; row?: number; cell?: number; text: string; points?: string[] }[]
  history: string | null
}

/**
 * AI's part of the 起草检查 of one SOP (UX-58): a suggested wording for what
 * the rules found (E1 量, E2 频次, E4 引用), and what only a reading finds
 * (E3 判断没有标准, E5 一步几个动作, E6 记录没写记在哪). `word` is the
 * text as written, to find it in the clause.
 */
export interface DraftCheckSuggestion {
  findings: { rule: string; clause: string; word: string; suggestion: string }[]
}

