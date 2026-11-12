// Words and patterns as printed in the source documents. They read the
// samples and are not interface copy, so check:i18n skips this one file.
// Patterns with the g flag are only used through matchAll (no shared lastIndex).
export const TERMS = {
  /** Ledger 状态 values. */
  statusCurrent: '现行',
  statusObsolete: '作废',
  /** Ledger 下次回顾日期 values that are not dates. */
  reviewFollowsParent: '随母文件',
  reviewNotApplicable: '不适用',
  /** Separator of listed values in header fields (分发部门). */
  listSeparator: '、',
  /** Chapter that records history, not dependencies. */
  historyChapter: '文件变更历史',
  /** Text right before a number that states supersession: 替代原 SOP-SC-028. */
  supersedesBefore: /替代原?\s*$/,
  /** Ledger remark naming the replacement: 由 SOP-SC-035 替代. */
  replacedBy: /由\s*((?:SMP|SOP|STP|SOR|VP|PX)-[A-Z0-9-]+?)\s*替代/,
  /** 中国药典 edition: 2025 年版 / 现行版. */
  edition: /(\d{4})\s*年版|现行版/g,
  /** 通则 numbers, possibly listed: 通则 1105、1106、1107. */
  generalChapters: /通则\s*(\d{4}(?:\s*[、，,和及与]\s*\d{4})*)/g,
  /** References without a number: 相关清洁规程, 各品种质量标准. */
  implicitReference: /(?:相关|各)[^\s，。；、：（）()]{0,8}?(?:规程|标准)/g,
  /** 起草检查 (UX-58): words that leave a quantity (E1) or a time and frequency (E2) for the operator to guess. */
  vagueAmount: ['适量', '适当', '少量', '若干', '左右'],
  vagueTiming: ['定期', '及时', '必要时', '一般'],
  /** Equipment model in an equipment SOP's name: 乳化均质机（RH-300）使用…. */
  modelInName: /^(.*?)（([A-Z]{1,4}-\d{2,4}[A-Z]?)）/,
  /** Departments as printed (起草部门, 分发部门, ledger 持有部门); the four demo accounts are these. */
  departments: { qa: '质量管理部', equipment: '设备工程部', production: '生产技术部', shiftA: '乳膏车间甲班', shiftB: '乳膏车间乙班' },
  /** 检验方法 SOP among SOP-QC (微生物限度检查…); instrument SOPs (高效液相色谱仪…) say neither. */
  inspectionSop: /检验|检查/,
  /** Product name before the document kind: 克霉唑乳膏质量标准 → 克霉唑乳膏. */
  productName: /^(.+?)(?:质量标准|工艺规程|批生产记录|检验标准操作规程|检验记录)$/,
  /** 设备编号 SB-RH-01 / 设备编号：SB-RH-01. */
  deviceNo: /设备编号[:：]?\s*([A-Z]{2}-[A-Z]{2}-\d{2})/,
  /** Header-table labels a revision draft rewrites (版 本 号 / 版本, 生效日期, the three signatures). */
  versionLabel: /^版\s*本\s*号?$/,
  effectiveLabel: /^生效日期$/,
  drafterLabel: /^起\s*草\s*人$/,
  reviewerLabel: /^审\s*核\s*人$/,
  approverLabel: /^批\s*准\s*人$/,
  /** What a draft prints instead, as the scenario draft SOP-SB-021-03 does. */
  pendingDate: '待定',
  unsigned: '（未签）',
  unreviewed: '（未审核）',
  unapproved: '（未批准）',
  /** Typefaces the samples are set in (宋体 body, 黑体 headings) and the usual other two, with system fallbacks. */
  fontStacks: {
    宋体: '宋体, SimSun, "Songti SC", serif',
    黑体: '黑体, SimHei, "Heiti SC", sans-serif',
    仿宋: '仿宋, FangSong, STFangsong, serif',
    楷体: '楷体, KaiTi, STKaiti, serif',
  },
  /** SMP-WJ-001 §4.4.2: 「新版生效后 10 个工作日内，各持有部门交回旧版受控副本…」. */
  returnDeadline: /新版生效后\s*(\d+)\s*个工作日内/,
  /** SMP-WJ-003: blank old record forms come back with the procedure. */
  blankRecordReturn: /旧版空白记录同时收回/,
  /** The 职责 chapter, and a duty in it: 「乳化岗位操作人员按本规程操作设备…」 → who, and what they do. */
  dutiesHeading: '职责',
  duty: /^(.+?)((?:按|负责).+?)。?$/,
  /** Column of a maintenance table naming who does each row. */
  executorHeader: '执行人',
  /** SMP-RY-004 §4.2: 换版培训 before the new version takes effect, with a 培训签到表. */
  trainingRule: /新版生效前.*培训/,
  /** 「SOR-SB-021-R01（第 02 版）」 in a record's footer. */
  versionInFooter: /（第\s*(\d+)\s*版）/,
} as const
