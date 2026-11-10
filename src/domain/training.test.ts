import { describe, expect, it } from 'vitest'
import type { SourceDocument } from '../data/schema.ts'
import { trainingAudiences } from './training.ts'
import { sourceDoc } from './test-fixtures.ts'

const base = sourceDoc('SOP-SB-021-03')
const doc: SourceDocument = {
  ...base,
  clauses: [
    { number: '3', heading: '职责', body: [] },
    { number: '3.1', heading: '乳化岗位操作人员按本规程操作设备并填写使用日志。', body: [] },
    { number: '3.2', heading: '设备工程部负责维护保养和维修。', body: [] },
    { number: '3.3', heading: '班组长负责监督执行。', body: [] },
    { number: '4.4', heading: '停机：确认破真空完成后出料。', body: [] },
    {
      number: '4.5',
      heading: '维护保养',
      body: [
        {
          kind: 'table',
          rows: [
            ['周期', '项目', '执行人'],
            ['每批', '检查均质头有无异响；水箱液位偏低时补加适量纯化水', '操作人员'],
            ['每周', '检查 CIP 喷淋球是否堵塞，补充少量真空泵油', '设备工程部'],
          ],
        },
      ],
    },
  ],
}

describe('培训', () => {
  it('trains every duty holder who is also an 执行人; departments come from the holders', () => {
    const audiences = trainingAudiences(doc, ['设备工程部', '乳膏车间甲班', '乳膏车间乙班'])
    expect(audiences).toEqual([
      { clause: '3.1', role: '乳化岗位操作人员', duty: '按本规程操作设备并填写使用日志', executor: '操作人员', departments: ['乳膏车间甲班', '乳膏车间乙班'] },
      { clause: '3.2', role: '设备工程部', duty: '负责维护保养和维修', executor: '设备工程部', departments: ['设备工程部'] },
    ])
    expect(trainingAudiences({ ...doc, clauses: doc.clauses.slice(4) }, [])).toEqual([])
  })
})
