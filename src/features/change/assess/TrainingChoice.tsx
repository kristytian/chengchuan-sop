import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { changeAnalysis } from '@/data/model'
import { trainingSuggestion } from '@/domain/training'
import { useDemo } from '@/store/demo'
import type { ChangeView } from '../view'
import { Choice } from './parts'

/**
 * 培训：需要 / 不需要 (UX-59), decided by QA before the report goes out, with
 * the rules' suggestion beside it: not when the revision changes numbers only.
 * 不需要 takes a reason; it closes the 培训 station.
 */
export function TrainingChoice({ view }: { view: ChangeView }) {
  const { t } = useTranslation()
  const setTraining = useDemo((s) => s.setTraining)
  const decision = view.assessment.training
  const suggestion = trainingSuggestion(changeAnalysis(view.change.id).diff)
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState('')
  const id = view.record.id
  const value = decision ? (decision.needed ? 'needed' : 'notNeeded') : asking ? 'notNeeded' : null
  return (
    <div className="mb-2 space-y-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{t('assess.training.label')}</span>
        <Choice
          label={t('assess.training.label')}
          options={[
            { value: 'needed', label: t('assess.training.needed') },
            { value: 'notNeeded', label: t('assess.training.notNeeded') },
          ]}
          value={value}
          onChange={(v) => {
            if (v === 'needed') {
              setAsking(false)
              setTraining(id, { needed: true, note: '' })
            } else {
              setTraining(id, null)
              setAsking(true)
            }
          }}
        />
        <span className="text-muted-foreground">{t('assess.training.suggested', { choice: t(`assess.training.${suggestion}`) })}</span>
      </div>
      {decision?.needed === false && <p>{t('training.skippedWhy', { note: decision.note, by: decision.by, date: decision.on })}</p>}
      {asking && !decision && (
        <div className="flex items-center gap-1.5">
          <Input aria-label={t('assess.training.reason')} value={why} onChange={(e) => setWhy(e.target.value)} className="h-7 text-xs" />
          <Button
            size="sm"
            disabled={!why.trim()}
            onClick={() => {
              setTraining(id, { needed: false, note: why.trim() })
              setAsking(false)
            }}
          >
            {t('assess.training.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
