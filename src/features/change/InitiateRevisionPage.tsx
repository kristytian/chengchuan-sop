import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { Breadcrumb, NotThisRound, Tag } from '@/components/common'
import { DocumentPaper } from '@/components/DocumentPaper'
import { departments } from './assess/model'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { searchLibrary } from '@/features/library/paths'
import { displayCode, libraryModel, versionByKey } from '@/data/model'
import { currentVersion } from '@/domain/catalog'
import { revisionDefaults, useDemo, USER_DEPARTMENT } from '@/store/demo'

/** 发起 · 修订一份文件 (03 画面 2). The new version is a draft placed from scenario-inputs/. */
export function InitiateRevisionPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const records = useDemo((s) => s.changes)
  const initiateRevision = useDemo((s) => s.initiateRevision)

  const identity = params.get('from')
  const current = identity ? currentVersion(libraryModel.catalog.byIdentity.get(identity)?.filter((v) => v.origin === 'library')) : undefined
  const change = libraryModel.changes.find((c) => c.source.kind === 'revision' && c.source.identity === identity)
  const usedBy = change ? records.find((r) => r.changeId === change.id) : undefined
  const draft = change?.source.kind === 'revision' ? versionByKey(change.source.newVersion) : undefined

  const [placed, setPlaced] = useState(false)
  const [preview, setPreview] = useState(false)
  const [form, setForm] = useState({ title: '', reason: '', controlNo: '', requestedBy: '' })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  const place = () => {
    if (!change) return
    const defaults = revisionDefaults(change.id)
    setPlaced(true)
    setForm({
      title: form.title || defaults.title,
      reason: form.reason || defaults.reason,
      controlNo: form.controlNo || defaults.controlNo,
      requestedBy: form.requestedBy || defaults.requestedBy,
    })
  }
  const ready = placed && change && !usedBy && form.title.trim() && form.reason.trim()

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Breadcrumb items={[{ label: t('nav.changes'), to: '/changes' }, { label: t('initiate.crumb') }]} />
      <div className="mt-4 space-y-5 rounded-lg border bg-background p-6">
        <Field label={t('initiate.file')}>
          {current ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs whitespace-nowrap">{displayCode(current)}</span>
              <span className="min-w-0 truncate">{current.name}</span>
              <Tag>{t('status.current')}</Tag>
              <span className="whitespace-nowrap text-muted-foreground">{current.document?.header.department}</span>
              <button
                type="button"
                className="ml-auto text-sm whitespace-nowrap hover:underline"
                onClick={() => {
                  setPlaced(false)
                  setParams({}, { replace: true })
                }}
              >
                {t('initiate.change')}
              </button>
            </div>
          ) : (
            <FilePicker onPick={(id) => setParams({ from: id }, { replace: true })} />
          )}
        </Field>

        <Field label={t('initiate.title')}>
          <Input value={form.title} onChange={set('title')} placeholder={t('initiate.titlePlaceholder')} />
        </Field>

        <Field label={t('initiate.how')}>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="mt-1 size-3.5 shrink-0 rounded-full border-4 border-foreground" />
              <div className="min-w-0 flex-1">
                <p>{t('initiate.upload')}</p>
                {!current ? null : usedBy ? (
                  <p className="mt-2 text-sm">{t('initiate.draftUsed', { no: usedBy.controlNo })}</p>
                ) : !draft ? (
                  <p className="mt-2 text-sm text-muted-foreground">{t('initiate.noDraft')}</p>
                ) : placed ? (
                  <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
                    <span>{t('initiate.placed', { file: draft.key.split('/').at(-1) })}</span>
                    <button type="button" className="ml-auto shrink-0 hover:underline" onClick={() => setPreview(true)}>
                      {t('initiate.preview')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={place}>
                      {t('initiate.place')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 size-3.5 shrink-0 rounded-full border border-muted-foreground/50" />
              <NotThisRound>{t('initiate.inSystem')}</NotThisRound>
            </div>
          </div>
        </Field>

        <Field label={t('initiate.reason')}>
          <Textarea value={form.reason} onChange={set('reason')} rows={3} placeholder={t('initiate.reasonPlaceholder')} />
        </Field>

        <Field label={t('initiate.requestedBy')}>
          <select value={form.requestedBy || USER_DEPARTMENT} onChange={set('requestedBy')} className="w-60 rounded-md border bg-background px-2 py-1.5 text-sm">
            {departments().map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('initiate.controlNo')}>
          <Input value={form.controlNo} onChange={set('controlNo')} className="w-60 font-mono" />
        </Field>

        <div className="flex items-center gap-2 border-t pt-4">
          <Button
            disabled={!ready}
            onClick={() => {
              if (!change) return
              const id = initiateRevision({ changeId: change.id, ...form, requestedBy: form.requestedBy || USER_DEPARTMENT })
              navigate(`/changes/${id}/overview`)
            }}
          >
            {t('initiate.submit')}
          </Button>
          <NotThisRound className="rounded-md border px-2.5 py-1 text-sm">{t('initiate.saveDraft')}</NotThisRound>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>

      {draft?.document && (
        <Dialog open={preview} onOpenChange={setPreview}>
          <DialogContent aria-describedby={undefined} className="max-h-[90svh] max-w-[640px] overflow-auto bg-canvas sm:max-w-[640px]">
            <DialogHeader>
              <DialogTitle>{displayCode(draft)}</DialogTitle>
            </DialogHeader>
            <DocumentPaper doc={draft.document} idPrefix="draft" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4">
      <div className="pt-1.5 text-sm font-medium">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function FilePicker({ onPick }: { onPick: (identity: string) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const results = searchLibrary(query).filter((v) => v.status === 'current')
  return (
    <div>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('nav.find')} />
      <ul className="mt-1 text-sm">
        {results.map((v) => (
          <li key={v.key}>
            <button type="button" onClick={() => onPick(v.identity)} className="flex w-full gap-3 rounded px-2 py-1 text-left hover:bg-muted">
              <span className="w-36 shrink-0 font-mono text-xs leading-5">{displayCode(v)}</span>
              <span className="truncate">{v.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
