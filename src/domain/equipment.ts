// Equipment comes from the equipment SOPs themselves: a current SOP-SB-…
// whose name carries a model in brackets (乳化均质机（RH-300）…) is that
// model's main SOP; its text gives the 设备编号.
import type { Catalog } from './catalog.ts'
import { parseCode } from './codes.ts'
import type { Equipment } from './model.ts'
import { TERMS } from './source-terms.ts'
import { documentTexts } from './texts.ts'

export function findEquipment(catalog: Catalog): Equipment[] {
  const equipment: Equipment[] = []
  for (const v of catalog.versions) {
    const code = parseCode(v.identity)
    if (v.origin !== 'library' || v.status !== 'current' || !v.document || code?.category !== 'SOP' || code.area !== 'SB') continue
    const named = TERMS.modelInName.exec(v.name)
    if (!named) continue
    const deviceNo = documentTexts(v.document)
      .map((t) => TERMS.deviceNo.exec(t.text)?.[1])
      .find((n) => n !== undefined)
    equipment.push({ model: named[2], name: named[1], deviceNo: deviceNo ?? null, mainSop: v.identity })
  }
  return equipment
}
