// AI at work in front of the user (R1-02): after 发起 it writes the 影响评估
// report, after the report goes out the revision drafts, once every draft is
// confirmed the training packs — one document after another. The results are
// pre-run; this paces them so the user sees the work happen and knows when it
// is finished. Start times live in memory only (store/demo.ts).
import { useEffect, useMemo, useState } from 'react'
import { DEMO } from '@/domain/settings'
import { type AiStage, useDemo } from '@/store/demo'

export interface AiProgress {
  done: number
  total: number
}

export interface AiClock {
  generating: Readonly<Record<string, number>>
  now: number
}

/** How far AI is on one stage of a change; null when it is not working there (never started, finished, or nothing to do). */
export function aiProgress(clock: AiClock | undefined, changeId: string, stage: AiStage, total: number): AiProgress | null {
  const at = clock?.generating[`${changeId}:${stage}`]
  if (!clock || at === undefined || total === 0) return null
  const done = Math.max(0, Math.min(total, Math.floor((clock.now - at) / DEMO.aiItemMs[stage])))
  return done < total ? { done, total } : null
}

/** The start times, and a clock that ticks while AI may still be working (up to a minute after it started). */
export function useAiClock(): AiClock {
  const generating = useDemo((s) => s.generating)
  const [now, setNow] = useState(() => Date.now())
  const live = Object.values(generating).some((at) => now - at < 60_000)
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [live])
  return useMemo(() => ({ generating, now }), [generating, now])
}
