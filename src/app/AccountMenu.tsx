import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { USER_DEPARTMENT } from '@/store/demo'

/**
 * An ordinary account menu: who is signed in and 退出. One account only
 * (UX-51) — the product is for QA / QC and document control. The demo
 * controls — date, jump to a step, reset — are not product and live in
 * DemoControls.
 */
export function AccountMenu() {
  const { t } = useTranslation()
  const department = USER_DEPARTMENT

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted aria-expanded:bg-muted">
        <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-xs text-background">{department.slice(0, 1)}</span>
        {t('account.label', { department })}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm text-foreground">{t('account.label', { department })}</p>
          <p className="text-xs text-muted-foreground">{t('account.role')}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled title={t('common.notThisRound')}>
          {t('account.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
