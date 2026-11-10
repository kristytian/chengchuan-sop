// Demo settings for 澄川制药; sources noted per value.
export interface Settings {
  /** 样本截止日: every "overdue" / "not returned" is judged on this day (docs/sample-library-list.md · 澄川制药设定). */
  asOf: string
  /** 现行药典: 2025 年版《中国药典》, in force from 2025-10-01 (same section). */
  currentPharmacopoeia: { edition: string; effectiveDate: string }
  /** 定期回顾: 3 years after taking effect (SMP-WJ-001). Used when the ledger has no review date. */
  reviewPeriodYears: number
  /** Reviews due within this many days after asOf are reminders, not issues. */
  dueSoonDays: number
}

export const SETTINGS: Settings = {
  asOf: '2026-10-31',
  currentPharmacopoeia: { edition: '2025', effectiveDate: '2025-10-01' },
  reviewPeriodYears: 3,
  dueSoonDays: 30,
}

/**
 * The demo timeline of 场景一 (design/decisions.md UX-46): the change is
 * initiated on startDate; dates and the control number are illustrative.
 * The library side (issues, reminders) keeps judging on SETTINGS.asOf.
 */
export const DEMO = {
  startDate: '2026-11-04',
  /** The 需评估 documents get their 评估结论 (the protocol's 备注 says 「11-18 前」) and the report goes out. */
  evaluatedDate: '2026-11-18',
  /** QA has confirmed every revision draft (审阅). */
  reviewedDate: '2026-11-20',
  /** OA approves all groups; the new versions take effect on effectiveDate and go out a week before. */
  approvedDate: '2026-11-21',
  issuedDate: '2026-12-03',
  effectiveDate: '2026-12-10',
  /** 乙班 brings back its 克霉唑 batch record late in the window. */
  lateReturnDate: '2026-12-23',
  /** Old copies are due 12-24 (ten working days); 乙班 is a day late. */
  overdueDate: '2026-12-25',
  /** QA confirms both training packs; training happens before the new version takes effect (SMP-RY-004 §4.2). */
  trainingConfirmedDate: '2026-11-24',
  trainedDate: '2026-12-08',
  /** 乙班 brings back the rest, and the destruction record for the legacy copy. */
  lastReturnDate: '2026-12-26',
  /** Every station done: the change can be closed. */
  closableDate: '2026-12-28',
  /** 变更控制单号 prefilled on the initiate form; the user can change it. */
  controlNo: 'BG-2026-018',
} as const
