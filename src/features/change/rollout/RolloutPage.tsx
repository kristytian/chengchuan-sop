import { useTranslation } from 'react-i18next'
import { useOutletContext, useSearchParams } from 'react-router'
import type { ChangeView } from '../view'
import { Board } from './Board'
import { planOf } from './model'
import { SlipPage } from './SlipPage'

/** 换版追踪: the board, or one department's sign-off sheet (`?dept=`). Opens once the report is exported. */
export function RolloutPage() {
  const { t } = useTranslation()
  const view = useOutletContext<ChangeView>()
  const [params] = useSearchParams()
  if (view.stage !== 'exported') return <p className="mx-auto max-w-3xl p-10 text-center text-sm text-muted-foreground">{t('rollout.notYet')}</p>
  const dept = params.get('dept')
  if (dept && planOf(view).departments.includes(dept)) return <SlipPage view={view} holder={dept} />
  return <Board view={view} />
}
