import { describe, expect, it } from 'vitest'
import { lineTwips, levelOf, referenceOf, twips } from './formats'

const texts = ['文件名称', '1　目的', '规定 RH-500 型乳化均质机的清洁方法。', '3　职责', '3.1 乳化岗位操作人员负责清洁。', '4.3.1 用纯化水冲洗主锅 2 次。', '3.3 班长负责复核。']

describe('本文件格式', () => {
  it('tells a paragraph’s level by how its number is written', () => {
    expect(texts.map(levelOf)).toEqual(['body', 'chapter', 'body', 'chapter', 'clause', 'subclause', 'clause'])
    expect(levelOf('2026-11-04 生效')).toBe('body')
  })

  it('copies the first paragraph of the level, never the one being formatted', () => {
    expect(referenceOf(texts, 'clause', new Set())).toBe(4)
    expect(referenceOf(texts, 'clause', new Set([4]))).toBe(6)
    expect(referenceOf(texts, 'chapter', new Set())).toBe(1)
    // 正文: an unnumbered sentence right under a chapter heading, not the header table.
    expect(referenceOf(texts, 'body', new Set())).toBe(2)
  })

  it('writes sizes in the editor’s units', () => {
    expect(twips(21.25)).toBe(425)
    expect(twips(8)).toBe(160)
    expect(lineTwips(1.25)).toBe(300)
  })
})
