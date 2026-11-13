import { useTranslation } from 'react-i18next'
import { Link, useOutletContext, useSearchParams } from 'react-router'
import { cn } from '@/lib/utils'
import { citation } from '../citations'
import type { ChangeView } from '../view'
import { deadlineText, packLink, questionOrigin } from './labels'
import { packsOf, TRAINING_RULE, trainingOpen, trainingSkipped, type Pack } from './model'
import { AiItemState } from '../AiWorking'
import { PackPage } from './PackPage'
import { PackStatus, RecordList } from './parts'

/** 培训: the packs (03 画面 19); one pack (`?pack=`): its two documents to edit, confirm and export (UX-53). */
export function TrainingPage() {
  const { t } = useTranslation()
  const view = useOutletContext<ChangeView>()
  const [params] = useSearchParams()
  // QA decided at 影响评估 that this change needs no training (UX-59).
  const decision = view.assessment.training
  if (trainingSkipped(view) && decision)
    return (
      <div className="mx-auto max-w-3xl p-10 text-center text-sm">
        <p className="font-medium">{t('training.skipped')}</p>
        <p className="mt-1 text-muted-foreground">{t('training.skippedBy', { by: decision.by, date: decision.on })}</p>
      </div>
    )
  if (!trainingOpen(view))
    return (
      <div className="mx-auto max-w-3xl p-10 text-center text-sm text-muted-foreground">
        <p>{t('training.notYet')}</p>
        {view.stage === 'exported' && (
          <Link to="../revise" relative="path" className="mt-2 inline-block font-medium text-foreground hover:underline">
            {t('training.toReview')}
          </Link>
        )}
      </div>
    )
  const packs = packsOf(view)
  const at = packs.findIndex((p) => p.audience.role === params.get('pack'))
  // A pack AI has not finished yet (R1-02) cannot be opened: the list shows where AI is.
  if (at >= 0 && (!view.ai.training || at < view.ai.training.done)) return <PackPage view={view} pack={packs[at]} />
  return <TrainingList view={view} packs={packs} />
}

/** 03 画面 19: who is trained, the questions, where each pack stands, by when, and its training records. */
function TrainingList({ view, packs }: { view: ChangeView; packs: Pack[] }) {
  const { t } = useTranslation()
  const progress = view.ai.training
  const ready = (i: number) => !progress || i < progress.done
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold">{t('training.title')}</h1>
          {progress && <span className="text-sm text-ai">{t('station.training.ai', { ...progress })}</span>}
          <span className="text-sm" title={TRAINING_RULE ? t('training.rule', { rule: citation(TRAINING_RULE), text: TRAINING_RULE.text }) : undefined}>
            {t('training.listDeadline', { deadline: deadlineText(t, view) })}
          </span>
        </div>
        <div className="mt-4 rounded-lg border bg-background">
          <table className="w-full table-fixed text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="w-[26%] py-2 pr-3 pl-4 font-normal">{t('training.col.audience')}</th>
                <th className="w-40 px-3 py-2 font-normal">{t('training.col.questions')}</th>
                <th className="w-36 px-3 py-2 font-normal">{t('training.col.status')}</th>
                <th className="w-32 px-3 py-2 font-normal">{t('training.col.deadline')}</th>
                <th className="px-3 py-2 font-normal">{t('training.col.records')}</th>
                <th className="w-20 py-2 pr-4 pl-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {packs.map((p, i) => (
                <tr key={p.audience.role} className={cn('border-t align-top', !ready(i) && 'text-muted-foreground')}>
                  <td className="py-2.5 pr-3 pl-4">
                    <span className="block font-medium" title={t('training.duty', { clause: p.audience.clause, duty: p.audience.duty })}>
                      {p.audience.role}
                    </span>
                    <span className="block text-xs text-muted-foreground">{p.audience.departments.join(t('common.listSep'))}</span>
                  </td>
                  <td className="px-3 py-2.5">{ready(i) ? questionOrigin(t, p) : <AiItemState index={i} progress={progress!} />}</td>
                  <td className="px-3 py-2.5">{ready(i) && <PackStatus pack={p} />}</td>
                  <td className="px-3 py-2.5">{deadlineText(t, view)}</td>
                  <td className="px-3 py-2.5 text-xs">
                    <div className="flex flex-col items-start gap-1">
                      <RecordList view={view} pack={p} />
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 pl-3 text-right">
                    {ready(i) && (
                      <Link to={packLink(p.audience.role)} className={cn('whitespace-nowrap hover:underline', !p.confirmed && 'font-medium')}>
                        {t('training.open')}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
