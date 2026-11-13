import { useTranslation } from 'react-i18next'
import { changeAnalysis } from '@/data/model'
import { trainingSuggestion } from '@/domain/training'
import { useDemo } from '@/store/demo'
import type { ChangeView } from '../view'
import { Choice } from './parts'

/**
 * 培训：需要 / 不需要 (UX-59), decided by QA before the report goes out, with
 * the rules' suggestion beside it: not when the revision changes numbers only.
 * Either is recorded as it is picked, with nothing to write (UX-63); 不需要
 * takes 培训 off the change's steps (UX-62).
 */
export function TrainingChoice({ view }: { view: ChangeView }) {
  const { t } = useTranslation()
  const setTraining = useDemo((s) => s.setTraining)
  const decision = view.assessment.training
  const suggestion = trainingSuggestion(changeAnalysis(view.change.id).diff)
  const id = view.record.id
  return (
    <div className="mb-2 flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{t('assess.training.label')}</span>
      <Choice
        label={t('assess.training.label')}
        options={[
          { value: 'needed', label: t('assess.training.needed') },
          { value: 'notNeeded', label: t('assess.training.notNeeded') },
        ]}
        value={decision ? (decision.needed ? 'needed' : 'notNeeded') : null}
        onChange={(v) => setTraining(id, { needed: v === 'needed', note: '' })}
      />
      <span className="text-muted-foreground">{t('assess.training.suggested', { choice: t(`assess.training.${suggestion}`) })}</span>
    </div>
  )
}
