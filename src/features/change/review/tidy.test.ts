import { describe, expect, it } from 'vitest'
import { type Segment, undoneEdits } from './tidy'

const text = (t: string): Segment => ({ kind: 'text', text: t })
const del = (id: string, t: string): Segment => ({ kind: 'del', id, text: t })
const ins = (id: string, t: string): Segment => ({ kind: 'ins', id, text: t })
const mine = (id: string) => id.startsWith('p')

describe('edits that end where they began', () => {
  it('finds text struck and typed back the same, side by side', () => {
    expect(undoneEdits([text('清洁效果'), del('p1', '检查'), ins('p2', '检查'), text('。')], mine)).toEqual(['p1', 'p2'])
    // Typed over a selection: one change with both sides.
    expect(undoneEdits([del('p3', '监控员'), ins('p3', '监控员')], mine)).toEqual(['p3'])
    // Retyped in pieces still adds up.
    expect(undoneEdits([del('p1', '检查'), ins('p2', '检'), ins('p4', '查')], mine)).toEqual(['p1', 'p2', 'p4'])
  })

  it('keeps real edits, moves and AI’s changes', () => {
    expect(undoneEdits([del('p1', '检查'), ins('p2', '核对')], mine)).toEqual([])
    // The same word put somewhere else in the paragraph is a move, not nothing.
    expect(undoneEdits([del('p1', '检查'), text('效果'), ins('p2', '检查')], mine)).toEqual([])
    expect(undoneEdits([del('ai1', 'RH-300'), ins('ai1', 'RH-300')], mine)).toEqual([])
    expect(undoneEdits([ins('p1', '新加的一句')], mine)).toEqual([])
  })
})
