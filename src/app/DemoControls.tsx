import { Presentation } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SETTINGS } from '@/domain/settings'
import { shortDate } from '@/lib/format'
import { CHECKPOINTS, useDemo } from '@/store/demo'

/**
 * Demo-only controls — demo date, jump to a step, reset — kept out of the
 * product's own chrome: a dashed pill fixed at the bottom, so a reader can tell
 * it is scaffolding for the walk-through, not part of the system. Bottom
 * centre, where no page puts an action (list footers sit bottom-left). Switching
 * demo account stays in the account menu (00 全站约定 1).
 */
export function DemoControls() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { date, setDate, reset, jumpTo } = useDemo()
  const [open, setOpen] = useState(false)

  const restart = (run: () => void) => {
    run()
    setOpen(false)
    navigate('/')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="fixed bottom-2 left-1/2 z-40 -translate-x-1/2 print:hidden flex items-center gap-1.5 rounded-full border border-dashed border-foreground/40 bg-background px-3 py-1 text-xs text-muted-foreground shadow-sm hover:text-foreground aria-expanded:text-foreground">
        <Presentation className="size-3.5" />
        {t('demo.trigger', { date: shortDate(date) })}
      </PopoverTrigger>
      <PopoverContent side="top" align="center" onOpenAutoFocus={(e) => e.preventDefault()} className="w-96 gap-3 print:hidden border border-dashed border-foreground/40 p-3 ring-0">
        <div>
          <p className="text-sm font-semibold">{t('demo.title')}</p>
          <p className="text-xs text-muted-foreground">{t('demo.note')}</p>
        </div>

        <div className="flex items-center justify-between gap-2 text-sm">
          <label htmlFor="demo-date">{t('demo.date')}</label>
          <input
            id="demo-date"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border px-1.5 py-0.5 text-sm"
          />
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">{t('demo.dateHint', { asOf: SETTINGS.asOf })}</p>

        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">{t('demo.jump')}</p>
          {CHECKPOINTS.map((c) => (
            <button key={c} type="button" onClick={() => restart(() => jumpTo(c))} className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
              {t(`demo.checkpoints.${c}`)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t pt-3">
          <button type="button" onClick={() => restart(reset)} className="shrink-0 rounded-md border px-2.5 py-1 text-sm whitespace-nowrap hover:bg-muted">
            {t('demo.reset')}
          </button>
          <span className="text-xs text-muted-foreground">{t('demo.resetHint')}</span>
        </div>
        {__SOURCE_URL__ && (
          <a href={__SOURCE_URL__} target="_blank" rel="noreferrer" className="border-t pt-3 text-xs text-muted-foreground hover:text-foreground hover:underline">
            {t('demo.source')}
          </a>
        )}
      </PopoverContent>
    </Popover>
  )
}
