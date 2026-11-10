// Maps the ledger workbook (one row per controlled copy, 13 columns) onto LedgerRow.
import type { LedgerRow } from '../../src/data/schema.ts'
import type { CellValue, XlsxSheet } from './xlsx.ts'

type TextKey = Exclude<keyof LedgerRow, 'sheet' | 'row' | DateKey>
type DateKey = 'effectiveDate' | 'nextReview' | 'issuedDate' | 'returnedDate'

const TEXT_COLUMNS: Record<string, TextKey> = {
  文件编号: 'code',
  名称: 'name',
  版本: 'version',
  起草部门: 'department',
  起草人: 'drafter',
  受控副本编号: 'copyNo',
  持有部门: 'holder',
  状态: 'status',
  备注: 'remark',
}
const DATE_COLUMNS: Record<string, DateKey> = {
  生效日期: 'effectiveDate',
  下次回顾日期: 'nextReview',
  发放日期: 'issuedDate',
  回收日期: 'returnedDate',
}

export function toLedgerRows(sheets: readonly XlsxSheet[]): LedgerRow[] {
  return sheets.flatMap((sheet) => {
    const [header, ...data] = sheet.rows
    if (!header) return []
    const columnOf = (title: string) => {
      const index = header.cells.findIndex((c) => typeof c === 'string' && c.trim() === title)
      if (index === -1) throw new Error(`sheet "${sheet.name}" has no column ${title}`)
      return index
    }
    const text = Object.entries(TEXT_COLUMNS).map(([title, key]) => [key, columnOf(title)] as const)
    const dates = Object.entries(DATE_COLUMNS).map(([title, key]) => [key, columnOf(title)] as const)

    return data
      .filter(({ cells }) => cells.some((c) => c !== null && c !== ''))
      .map(({ row, cells }) => {
        const entry = { sheet: sheet.name, row } as LedgerRow
        for (const [key, i] of text) entry[key] = cells[i] == null ? '' : String(cells[i]).trim()
        for (const [key, i] of dates) entry[key] = dateText(cells[i])
        return entry
      })
  })
}

/** Excel stores dates as day serials; text such as 随母文件 / 不适用 is kept. */
function dateText(value: CellValue | undefined): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') return value.trim() || null
  return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10)
}
