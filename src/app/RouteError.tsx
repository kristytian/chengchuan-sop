import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'

export function RouteError() {
  const { t } = useTranslation()
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  useEffect(() => {
    if (!notFound) console.error('[route] unhandled error', error)
  }, [error, notFound])

  return (
    <div className="flex h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">{t('error.title')}</h1>
      {notFound && <p className="text-sm text-muted-foreground">{t('error.notFound')}</p>}
      <Button asChild variant="outline">
        <Link to="/">{t('error.backHome')}</Link>
      </Button>
    </div>
  )
}
