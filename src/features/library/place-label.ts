import { useTranslation } from 'react-i18next'
import type { CitationPlace } from '@/domain/library'

/** 「§4.2」「文头「对应文件」」「正文」 */
export function usePlaceLabel() {
  const { t } = useTranslation()
  return (p: Pick<CitationPlace, 'location' | 'clause' | 'field'>) =>
    p.location === 'header' ? (p.field ? t(`doc.place.field.${p.field}`) : t('doc.place.header')) : p.clause ? t('doc.place.clause', { number: p.clause }) : t('doc.place.body')
}
