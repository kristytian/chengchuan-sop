import { describe, expect, it } from 'vitest'
import type { Block } from '../../src/data/schema.ts'
import { toSourceDocument } from './document.ts'

const p = (text: string): Block => ({ kind: 'paragraph', text })
const table = (...rows: string[][]): Block => ({ kind: 'table', rows })

const controlledRows = [
  ['文件名称', '测试操作规程'],
  ['文件编号', 'SOP-TEST-001-02', '版 本 号', '02'],
  ['文件类别', '操作规程', '起草部门', '测试部'],
  ['起 草 人', '某人　2026-01-01', '审 核 人', '某人　2026-01-02'],
  ['批 准 人', '某人　2026-01-03', '生效日期', '2026-02-01'],
  ['分发部门', '测试部、乳膏车间甲班、 乳膏车间乙班'],
]
const controlledHeader = table(...controlledRows)

describe('toSourceDocument', () => {
  it('maps a controlled document header and cuts its body into clauses', () => {
    const doc = toSourceDocument('samples/x.docx', { body: [controlledHeader, p('1　目的'), p('正文。')], footer: ['页脚'], pageHeader: ['页眉'] })

    expect(doc).toEqual({
      source: 'samples/x.docx',
      header: {
        code: 'SOP-TEST-001-02',
        name: '测试操作规程',
        category: 'SOP',
        categoryLabel: '操作规程',
        version: '02',
        effectiveDate: '2026-02-01',
        department: '测试部',
        distribution: ['测试部', '乳膏车间甲班', '乳膏车间乙班'],
        correspondingDoc: null,
        basis: null,
      },
      pageHeader: ['页眉'],
      headerTable: controlledRows,
      footer: ['页脚'],
      clauses: [{ number: '1', heading: '目的', body: [p('正文。')] }],
    })
  })

  it('maps a record template: title line above the table, 对应文件 and 依据', () => {
    const header = table(
      ['记录编号', 'SOR-TEST-001-R01', '版本', '03', '生效日期', '2026-02-01'],
      ['对应文件', 'SOP-TEST-001-02', '起草部门', '测试部', '依据', '—'],
    )
    const doc = toSourceDocument('samples/r.docx', { body: [p('测试记录'), header, p('一、结果')], footer: [], pageHeader: [] })

    expect(doc.header).toMatchObject({
      code: 'SOR-TEST-001-R01',
      name: '测试记录',
      category: 'SOR',
      categoryLabel: null,
      version: '03',
      distribution: [],
      correspondingDoc: 'SOP-TEST-001-02',
      basis: '—',
    })
    expect(doc.clauses).toEqual([{ number: null, heading: '', body: [p('一、结果')] }])
    expect(doc.headerTable).toEqual([
      ['记录编号', 'SOR-TEST-001-R01', '版本', '03', '生效日期', '2026-02-01'],
      ['对应文件', 'SOP-TEST-001-02', '起草部门', '测试部', '依据', '—'],
    ])
  })

  it('keeps printed values as-is, including non-date effective dates', () => {
    const draft = table(['文件名称', '草稿'], ['文件编号', 'SOP-TEST-001-03', '版本号', '03'], ['起草部门', '测试部', '生效日期', '待定'])

    expect(toSourceDocument('d.docx', { body: [draft], footer: [], pageHeader: [] }).header.effectiveDate).toBe('待定')
  })

  it('leaves the category null for an unknown prefix', () => {
    const odd = table(['文件名称', '其他'], ['文件编号', 'ABC-001-00', '版本号', '00'], ['起草部门', '测试部', '生效日期', '2026-01-01'])

    expect(toSourceDocument('o.docx', { body: [odd], footer: [], pageHeader: [] }).header.category).toBeNull()
  })

  it('fails loudly on a missing header field or table', () => {
    expect(() => toSourceDocument('m.docx', { body: [table(['文件编号', 'SOP-TEST-001-02'])], footer: [], pageHeader: [] })).toThrow('文件名称')
    expect(() => toSourceDocument('n.docx', { body: [p('只有正文')], footer: [], pageHeader: [] })).toThrow('no header table')
  })
})
