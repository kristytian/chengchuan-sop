import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { displayCode, versionByKey } from '@/data/model'
import type { ImpactTier } from '@/domain/model'
import { searchLibrary } from '@/features/library/paths'
import { cn } from '@/lib/utils'
import { useDemo } from '@/store/demo'
import type { ChangeView } from '../view'
import { Choice } from './parts'

const TIERS: readonly ImpactTier[] = ['mustChange', 'evaluate', 'inform']

/**
 * 「＋ 加一份文件」: a document AI did not list; it goes on the report marked
 * 「人工加入」 with the person's reason. What to change is written next, as
 * 修改要点 on its clauses (UX-57): the dialog opens its 看原件和依据 page.
 */
export function AddEntryDialog({ view, onClose }: { view: ChangeView; onClose: () => void }) {
  const { t } = useTranslation()
  const addEntry = useDemo((s) => s.addEntry)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [tier, setTier] = useState<ImpactTier | null>(null)
  const [reason, setReason] = useState('')
  const sourceIdentity = view.change.source.kind === 'revision' ? view.change.source.identity : ''
  const onReport = new Set([...view.report.entries.map((e) => e.version), ...view.report.removed.map((r) => r.entry.version)])
  const results = useMemo(
    () => searchLibrary(query).filter((v) => v.origin === 'library' && v.status === 'current' && v.identity !== sourceIdentity),
    [query, sourceIdentity],
  )
  const ready = picked && tier && reason.trim()

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('assess.add.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-muted-foreground">{t('assess.add.file')}</span>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('assess.add.search')} className="mt-1" />
          </label>
          {query.trim() && (
            <ul className="max-h-40 overflow-auto rounded-md border">
              {results.map((v) => {
                const taken = onReport.has(v.key)
                return (
                  <li key={v.key}>
                    <button
                      type="button"
                      disabled={taken}
                      onClick={() => setPicked(v.key)}
                      className={cn('flex w-full gap-3 px-3 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground', picked === v.key && 'bg-muted font-medium')}
                    >
                      <span className="w-32 shrink-0 font-mono text-xs leading-5">{displayCode(v)}</span>
                      <span className="truncate">{v.name}</span>
                      {taken && <span className="ml-auto shrink-0 text-xs">{t('assess.add.inReport')}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{t('assess.add.tier')}</span>
            <Choice label={t('assess.add.tier')} options={TIERS.map((value) => ({ value, label: t(`tier.${value}`) }))} value={tier} onChange={setTier} />
          </div>
          <label className="block">
            <span className="text-muted-foreground">{t('assess.add.reason')}</span>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('assess.add.cancel')}
          </Button>
          <Button
            disabled={!ready}
            onClick={() => {
              addEntry(view.record.id, { version: picked!, tier: tier!, reason: reason.trim() })
              onClose()
              const identity = versionByKey(picked!)?.identity
              if (identity && tier !== 'inform') navigate(`/changes/${view.record.id}/assess/doc/${identity}`)
            }}
          >
            {t('assess.add.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
