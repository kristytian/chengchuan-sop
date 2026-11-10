import { describe, expect, it } from 'vitest'
import { toLedgerRows } from './ledger.ts'
import type { CellValue, XlsxSheet } from './xlsx.ts'

const HEADER = ['文件编号', '名称', '版本', '生效日期', '起草部门', '起草人', '下次回顾日期', '受控副本编号', '持有部门', '发放日期', '回收日期', '状态', '备注']

const sheet = (...rows: CellValue[][]): XlsxSheet => ({
  name: '操作规程',
  rows: [HEADER, ...rows].map((cells, i) => ({ row: i + 1, cells })),
})

describe('toLedgerRows', () => {
  it('maps the 13 columns and converts Excel date serials', () => {
    const rows = toLedgerRows([
      sheet(['SOP-TEST-001', '测试规程', '03', 45931, '测试部', '某人', 47027, 'SOP-TEST-001-03-01', '测试部', 45929, null, '现行', null]),
    ])

    expect(rows).toEqual([
      {
        sheet: '操作规程',
        row: 2,
        code: 'SOP-TEST-001',
        name: '测试规程',
        version: '03',
        effectiveDate: '2025-10-01',
        department: '测试部',
        drafter: '某人',
        nextReview: '2028-10-01',
        copyNo: 'SOP-TEST-001-03-01',
        holder: '测试部',
        issuedDate: '2025-09-29',
        returnedDate: null,
        status: '现行',
        remark: '',
      },
    ])
  })

  it('keeps text in date columns and skips empty rows', () => {
    const rows = toLedgerRows([sheet([null, null], ['SOR-TEST-001', '记录', '01', 45000, '测试部', '', '随母文件', '', '', null, null, '现行', ''])])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ row: 3, nextReview: '随母文件', drafter: '' })
  })

  it('fails loudly on a missing column', () => {
    expect(() => toLedgerRows([{ name: '坏表', rows: [{ row: 1, cells: ['文件编号'] }] }])).toThrow('坏表')
  })
})
