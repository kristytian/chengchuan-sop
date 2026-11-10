// What AI at work looks like (R1-02): a progress bar with its count, and per
// document whether AI is done with it, on it, or yet to get to it.
import { Check, LoaderCircle, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { AiProgress } from './ai-progress'

/** The big panel where the result will be: what AI is doing, and how far it is. */
export function AiWorkingPanel({ title, count, progress }: { title: string; count: string; progress: AiProgress }) {
  return (
    <div className="mx-auto mt-16 w-[420px] rounded-lg border bg-background p-6 text-sm shadow-sm" role="status" aria-live="polite">
      <p className="flex items-center gap-2 font-semibold text-ai">
        <Sparkles className="size-4" />
        {title}
      </p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-ai transition-[width] duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">{count}</p>
    </div>
  )
}

/** One document's place in AI's queue: done (✓), being worked on, or waiting. */
export function AiItemState({ index, progress }: { index: number; progress: AiProgress }) {
  const { t } = useTranslation()
  const state = index < progress.done ? 'done' : index === progress.done ? 'working' : 'waiting'
  return (
    <span className={cn('flex shrink-0 items-center gap-1 text-xs', state === 'working' ? 'text-ai' : 'text-muted-foreground')}>
      {state === 'done' && <Check className="size-3.5" />}
      {state === 'working' && <LoaderCircle className="size-3.5 animate-spin" />}
      {t(`ai.item.${state}`)}
    </span>
  )
}
