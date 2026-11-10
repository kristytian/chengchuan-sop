// Pieces of a pack shown both in the list of packs and on the pack's page (UX-53).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tag } from '@/components/common'
import { shortDate } from '@/lib/format'
import { useDemo } from '@/store/demo'
import { saveUpload } from '@/store/uploads'
import { FilePick, ScanLink } from '../files'
import type { ChangeView } from '../view'
import { PACK_DOCS, type Pack } from './model'

export function PackStatus({ pack }: { pack: Pack }) {
  const { t } = useTranslation()
  if (pack.trained) return <Tag tone="strong">{t('training.status.trained', { date: shortDate(pack.record.records[0].on) })}</Tag>
  if (pack.confirmed) return <Tag>{t('training.status.confirmed', { date: shortDate(pack.confirmedOn!) })}</Tag>
  const done = Object.keys(pack.record.confirmed).length
  return <span className="text-muted-foreground">{done > 0 ? t('training.status.partly', { done, total: PACK_DOCS.length }) : t('training.status.toConfirm')}</span>
}

/** The scans of one pack, each with 撤销, and 上传 — greyed out until both documents are confirmed. Also in the list of packs. */
export function RecordList({ view, pack }: { view: ChangeView; pack: Pack }) {
  const { t } = useTranslation()
  const addTrainingRecord = useDemo((s) => s.addTrainingRecord)
  const dropTrainingRecord = useDemo((s) => s.dropTrainingRecord)
  const [busy, setBusy] = useState(false)
  const role = pack.audience.role
  return (
    <>
      {pack.record.records.map((r, i) => (
        <span key={`${r.file.name}-${i}`} className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0">{shortDate(r.on)}</span>
          <ScanLink file={r.file} />
          <button type="button" onClick={() => dropTrainingRecord(view.record.id, role, i)} className="shrink-0 text-muted-foreground hover:text-foreground hover:underline">
            {t('training.records.undo')}
          </button>
        </span>
      ))}
      <span title={pack.confirmed ? undefined : t('training.records.needsConfirm')}>
        <FilePick
          label={busy ? t('training.records.uploading') : t('training.records.upload')}
          disabled={busy || !pack.confirmed}
          onPick={async (file) => {
            setBusy(true)
            addTrainingRecord(view.record.id, role, await saveUpload(file))
            setBusy(false)
          }}
        />
      </span>
    </>
  )
}
