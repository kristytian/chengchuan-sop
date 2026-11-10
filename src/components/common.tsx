import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

/** Something drawn in the wireframes but left out of this round: visible, greyed, with the reason on hover. */
export function NotThisRound({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation()
  return (
    <span aria-disabled="true" title={t('common.notThisRound')} className={cn('cursor-not-allowed text-muted-foreground/60', className)}>
      {children}
    </span>
  )
}

/** Breadcrumb for task and file pages (「文件库 / 操作规程 / SOP-SB-021-02」); no separate back button. */
export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span>/</span>}
          {item.to ? (
            <Link to={item.to} className="hover:text-foreground hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

/** A plain bordered label for statuses and exceptions (现行, 同组, 已作废…). */
export function Tag({ children, tone = 'plain', className }: { children: ReactNode; tone?: 'plain' | 'strong' | 'muted'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 text-xs leading-5 whitespace-nowrap',
        tone === 'strong' && 'border-foreground bg-foreground text-background',
        tone === 'muted' && 'border-transparent bg-muted text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Section block with a title, a count and a one-line hint (首页三块，文件页的引用关系). */
export function Section({ title, count, children, className }: { title: string; count?: number; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border bg-background', className)}>
      <header className="flex items-baseline gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && <span className="text-sm text-muted-foreground">{count}</span>}
      </header>
      {children}
    </section>
  )
}
