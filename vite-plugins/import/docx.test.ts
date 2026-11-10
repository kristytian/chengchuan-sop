import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { readDocx } from './docx.ts'

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const r = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`
const p = (...runs: string[]) => `<w:p>${runs.join('')}</w:p>`
const cell = (text: string) => `<w:tc>${p(r(text))}</w:tc>`

function docx(body: string, parts: Record<string, string> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  }
  for (const [name, xml] of Object.entries(parts)) {
    const root = name.startsWith('header') ? 'w:hdr' : 'w:ftr'
    files[`word/${name}`] = strToU8(`<${root} ${NS}>${xml}</${root}>`)
  }
  return zipSync(files)
}

describe('readDocx', () => {
  it('reads paragraphs and tables in document order, skipping empty paragraphs', () => {
    const bytes = docx(p(r('1　目的')) + p() + `<w:tbl><w:tr>${cell('项目')}${cell('参数')}</w:tr></w:tbl>` + p(r('正文')))

    expect(readDocx(bytes).body).toEqual([
      { kind: 'paragraph', text: '1　目的' },
      { kind: 'table', rows: [['项目', '参数']] },
      { kind: 'paragraph', text: '正文' },
    ])
  })

  it('joins runs, keeps tabs and breaks, and drops deleted text', () => {
    const bytes = docx(p(r('甲'), '<w:r><w:tab/></w:r>', r('乙'), '<w:r><w:br/></w:r>', '<w:del><w:r><w:delText>删</w:delText></w:r></w:del>', r('丙')))

    expect(readDocx(bytes).body).toEqual([{ kind: 'paragraph', text: '甲\t乙\n丙' }])
  })

  it('decodes character references', () => {
    expect(readDocx(docx(p(r('&#25991;&#20214; A&amp;B')))).body).toEqual([{ kind: 'paragraph', text: '文件 A&B' }])
  })

  it('unwraps content controls', () => {
    const bytes = docx(`<w:sdt><w:sdtContent>${p(r('包在控件里'))}</w:sdtContent></w:sdt>`)

    expect(readDocx(bytes).body).toEqual([{ kind: 'paragraph', text: '包在控件里' }])
  })

  it('collects non-empty footer lines once, across footer parts', () => {
    const line = p(r('SOR-TEST-001-R01  对应 SOP-TEST-001-02'))
    const { footer } = readDocx(docx(p(r('正文')), { 'footer1.xml': line + p(), 'footer2.xml': line + p(r('虚构样本')) }))

    expect(footer).toEqual(['SOR-TEST-001-R01  对应 SOP-TEST-001-02', '虚构样本'])
  })

  it('collects non-empty page-header lines the same way', () => {
    const line = p(r('测试有限公司 · 受控文件'))
    const { pageHeader } = readDocx(docx(p(r('正文')), { 'header1.xml': line + p(), 'header2.xml': line }))

    expect(pageHeader).toEqual(['测试有限公司 · 受控文件'])
  })

  it('fails loudly when the package has no document part', () => {
    expect(() => readDocx(zipSync({ 'other.xml': strToU8('<x/>') }))).toThrow('word/document.xml')
  })
})
