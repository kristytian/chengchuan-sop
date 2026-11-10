import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { displayCode } from '@/data/model'
import type { DocumentVersion } from '@/domain/model'
import { documentPath, searchLibrary } from '@/features/library/paths'
import { cn } from '@/lib/utils'

/** 「找文件」 in the top bar: type a number or a name, pick one, open its file page. */
export function FindFile() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const results = useMemo(() => searchLibrary(query), [query])

  const go = (v: DocumentVersion) => {
    navigate(documentPath(v))
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative w-80">
      <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) go(results[0])
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={t('nav.find')}
        className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus:ring-2 focus:ring-ring/40"
      />
      {open && query.trim() && (
        <ul className="absolute top-9 z-50 w-[28rem] overflow-hidden rounded-md border bg-popover py-1 text-sm shadow-md">
          {results.length === 0 && <li className="px-3 py-2 text-muted-foreground">{t('nav.findEmpty')}</li>}
          {results.map((v) => (
            <li key={v.key}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(v)}
                className={cn('flex w-full gap-3 px-3 py-1.5 text-left hover:bg-muted', v.status === 'obsolete' && 'text-muted-foreground')}
              >
                <span className="w-36 shrink-0 font-mono text-xs leading-5">{displayCode(v)}</span>
                <span className="truncate">{v.name}</span>
                {v.status === 'obsolete' && <span className="ml-auto shrink-0 text-xs">{t('status.obsolete')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
