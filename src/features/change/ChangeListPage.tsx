import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { shortDate } from '@/lib/format'
import { Link, useNavigate } from 'react-router'
import { MiniProgress } from '@/components/MiniProgress'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useChangeViews } from '@/features/home/tasks'
import { cn } from '@/lib/utils'
import { changeNumber, sourceLabel, stationLine } from './view'

/** 变更列表 with 「发起变更 ▾」 (03 画面 1). Only 修订一份文件 is built this round. */
export function ChangeListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const all = useChangeViews()
  const [showing, setShowing] = useState<'open' | 'closed'>('open')
  const open = all.filter((v) => !v.record.closedOn)
  const closed = all.filter((v) => v.record.closedOn)
  const views = showing === 'open' ? open : closed

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{t('nav.changes')}</h1>
        <div role="tablist" className="flex rounded-md bg-muted/60 p-0.5 text-sm">
          {(['open', 'closed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={showing === tab}
              onClick={() => setShowing(tab)}
              className={cn('rounded px-2.5 py-0.5', showing === tab ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {t(`changes.${tab}`, { count: tab === 'open' ? open.length : closed.length })}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
            {t('changes.initiate')}
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {(['revision', 'newFile', 'external'] as const).map((k) => (
              <DropdownMenuItem key={k} disabled={k !== 'revision'} title={k !== 'revision' ? t('common.notThisRound') : undefined} onSelect={() => navigate('/changes/new')}>
                {t(`changes.kinds.${k}.name`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4 rounded-lg border bg-background">
        {views.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{t(showing === 'closed' ? 'changes.noneClosed' : 'home.changes.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                {(['change', 'type', 'station', 'now', 'source', 'initiated'] as const).map((c) => (
                  <th key={c} className="px-3 py-2 font-normal whitespace-nowrap first:pl-4">
                    {t(`changes.col.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {views.map((v) => (
                <tr key={v.record.id} onClick={() => navigate(`/changes/${v.record.id}/overview`)} className="cursor-pointer border-b last:border-0 hover:bg-muted/60">
                  <td className="py-2.5 pr-3 pl-4 whitespace-nowrap">
                    <span className="font-mono text-xs">{changeNumber(t, v.record)}</span>
                    {' '}
                    <Link to={`/changes/${v.record.id}/overview`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                      {v.record.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{t('overview.typeRevision')}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <MiniProgress current={v.current} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{v.record.closedOn ? t('changes.closedOn', { date: v.record.closedOn }) : stationLine(t, v, v.current)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs">{sourceLabel(v)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                    {v.record.requestedBy} · {shortDate(v.record.initiatedOn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
