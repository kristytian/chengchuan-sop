// The 行内容 of an issue that states what was checked, found and not found
// (配套缺失); other kinds have none yet. Wording from i18n issueText.*.
import type { TFunction } from 'i18next'
import { displayCode, versionByKey } from '@/data/model'
import type { ProductDocument } from '@/domain/issues'
import type { ImportIssue } from '@/domain/model'

const list = (value: string | string[] | undefined): string[] => (value === undefined ? [] : Array.isArray(value) ? value : [value])

export function issueText(t: TFunction, issue: ImportIssue): string | null {
  if (issue.kind !== 'missingCompanion') return null
  const p = issue.params
  const sep = t('issueText.listSeparator')
  const cited = list(p.citedCodes)
  const kinds = list(p.foundKinds) as ProductDocument[]
  const foundCodes = list(p.foundCodes)

  // Who cites what was not found: a found companion by its role (批记录), anything else by its number.
  const who = list(p.citingFiles)
    .map((key) => {
      const v = versionByKey(key)
      if (!v) return key
      const i = foundCodes.indexOf(displayCode(v))
      return i >= 0 ? t(`issueText.companion.${kinds[i]}`) : displayCode(v)
    })
    .join(sep)
  const citedLine = cited.length > 0 ? t('issueText.cited', { who, codes: cited.join(sep) }) : ''

  if (issue.rule === 'inspectionRecord') {
    return t('issueText.inspectionRecord', { sop: p.sop, name: p.sopName, code: list(p.missingCodes).join(sep) }) + citedLine
  }
  const product = p.productName ? t('issueText.product', { name: p.productName, product: p.product }) : t('issueText.productNoName', { product: p.product })
  const found = kinds.map((kind, i) => t('issueText.found', { kind: t(`issueText.companion.${kind}`), code: foundCodes[i] })).join(sep)
  // A missing document that is cited is named in the cited line; otherwise its expected number goes here.
  const missingCodes = list(p.missingCodes)
  const missing = (list(p.missingKinds) as ProductDocument[])
    .map((kind, i) => (cited.includes(missingCodes[i]) ? t(`issueText.companion.${kind}`) : t('issueText.missing', { kind: t(`issueText.companion.${kind}`), code: missingCodes[i] })))
    .join(sep)
  return t(kinds.length > 0 ? 'issueText.productDocuments' : 'issueText.productDocumentsNoneFound', { product, found, missing }) + citedLine
}
