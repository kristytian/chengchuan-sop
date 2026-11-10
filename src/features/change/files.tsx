// Scans kept in the browser (UX-52, UX-53): pick one, open one.
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { openUpload, type UploadRef } from '@/store/uploads'

/** The kept scan: opens it; demo data carries a name and no file. */
export function ScanLink({ file }: { file: UploadRef | null }) {
  const { t } = useTranslation()
  if (!file) return null
  if (!file.id)
    return (
      <span className="block truncate text-muted-foreground" title={t('files.demoFile')}>
        {file.name}
      </span>
    )
  return (
    <button type="button" onClick={() => void openUpload(file)} className="block max-w-full truncate text-left underline-offset-2 hover:underline" title={file.name}>
      {file.name}
    </button>
  )
}

/** A button that opens the file picker (scans: images or PDF). */
export function FilePick({ onPick, label, disabled }: { onPick: (file: File) => void; label?: string; disabled?: boolean }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button size="xs" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
        {label ?? t('files.choose')}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPick(file)
        }}
      />
    </>
  )
}

