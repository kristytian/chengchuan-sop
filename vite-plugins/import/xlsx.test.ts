import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { readXlsx } from './xlsx.ts'

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

function xlsx(sheets: Record<string, string>, sharedStrings?: string[]): Uint8Array {
  const names = Object.keys(sheets)
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      `<workbook ${NS} ${R_NS}><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    ),
  }
  names.forEach((n, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<worksheet ${NS}><sheetData>${sheets[n]}</sheetData></worksheet>`)))
  if (sharedStrings) files['xl/sharedStrings.xml'] = strToU8(`<sst ${NS}>${sharedStrings.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`)
  return zipSync(files)
}

const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`

describe('readXlsx', () => {
  it('reads sheets in workbook order with inline, shared, numeric and empty cells', () => {
    const sheets = readXlsx(
      xlsx(
        {
          操作规程: `<row r="1">${inline('A1', '&#25991;&#20214;编号')}<c r="B1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="n"><v>45931</v></c><c r="C2" t="n"/></row>`,
          记录模板: `<row r="1">${inline('B1', '名称')}</row>`,
        },
        ['版本'],
      ),
    )

    expect(sheets).toEqual([
      {
        name: '操作规程',
        rows: [
          { row: 1, cells: ['文件编号', '版本'] },
          { row: 2, cells: [45931, null, null] },
        ],
      },
      { name: '记录模板', rows: [{ row: 1, cells: [null, '名称'] }] },
    ])
  })

  it('keeps leading zeros of text cells', () => {
    expect(readXlsx(xlsx({ s: `<row r="1">${inline('A1', '03')}</row>` }))[0].rows[0].cells).toEqual(['03'])
  })

  it('joins rich-text runs', () => {
    const rich = '<c r="A1" t="inlineStr"><is><r><t>乳膏</t></r><r><t>车间</t></r></is></c>'

    expect(readXlsx(xlsx({ s: `<row r="1">${rich}</row>` }))[0].rows[0].cells).toEqual(['乳膏车间'])
  })
})
