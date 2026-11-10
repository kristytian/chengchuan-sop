import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { useMyTasks } from '@/features/home/tasks'
import { cn } from '@/lib/utils'
import { AccountMenu } from './AccountMenu'
import { DemoControls } from './DemoControls'
import { FindFile } from './FindFile'

const NAV = [
  { key: 'home', to: '/', end: true },
  { key: 'library', to: '/library', end: false },
  { key: 'changes', to: '/changes', end: false },
] as const

/** Top bar with three spaces — 首页、文件库、变更 — plus 找文件 and the account menu (UX-43); demo controls float outside the chrome. */
export function AppLayout() {
  const { t } = useTranslation()
  const tasks = useMyTasks()

  return (
    <div className="flex h-svh min-w-[1280px] flex-col bg-background text-foreground print:block print:h-auto print:min-w-0">
      <header className="flex h-12 shrink-0 items-center gap-6 border-b px-5 print:hidden">
        <span className="text-sm font-semibold">{t('app.company')}</span>
        <nav className="flex items-center gap-1">
          {NAV.map(({ key, to, end }) => (
            <NavLink
              key={key}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm hover:bg-muted', isActive && 'bg-muted font-medium')
              }
            >
              {t(`nav.${key}`)}
              {key === 'home' && tasks.length > 0 && (
                <span className="min-w-4 rounded-full bg-foreground px-1 text-center text-[11px] leading-4 text-background">{tasks.length}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <FindFile />
        <div className="ml-auto">
          <AccountMenu />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto bg-canvas print:overflow-visible print:bg-transparent">
        <Outlet />
      </main>
      <DemoControls />
    </div>
  )
}
