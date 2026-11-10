import { ChevronDown, ChevronRight } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Tag } from '@/components/common'
import { displayCode, libraryModel } from '@/data/model'
import { type CitationPlace, incomingCitations, outgoingCitations, secondRing } from '@/domain/library'
import type { DocumentVersion } from '@/domain/model'
import { documentPath, placeLink } from './paths'
import { usePlaceLabel } from './place-label'
import { cn } from '@/lib/utils'

/**
 * 引用关系 of one file page (02 画面 4、5): who cites me, whom I cite. Plain
 * citations by number carry no label; only exceptions are marked (UX-45).
 */
export function ReferencesPanel({ version, onShowPlace }: { version: DocumentVersion; onShowPlace: (p: CitationPlace) => void }) {
  const { t } = useTranslation()
  const placeLabel = usePlaceLabel()
  const incoming = incomingCitations(libraryModel, version.identity)
  const outgoing = outgoingCitations(libraryModel, version.key)
  const ring = secondRing(libraryModel, version.identity)
  const places = (list: { places: CitationPlace[] }[]) => list.reduce((n, g) => n + g.places.length, 0)
  const outgoingCount = outgoing.byNumber.length + outgoing.external.length

  return (
    <div className="p-4 text-sm">
      <h2 className="mb-3 font-semibold">{t('doc.refs.title')}</h2>
      <div className="space-y-5">
      <div className="min-w-0 space-y-4">
      <section>
        <h3 className="mb-1.5 font-semibold">
          {t('doc.refs.incoming')}
          <span className="ml-2 font-normal text-muted-foreground">{t('doc.refs.counts', { docs: incoming.byNumber.length, places: places(incoming.byNumber) })}</span>
        </h3>
        {incoming.byNumber.length === 0 && <p className="text-muted-foreground">{t('doc.refs.noIncoming')}</p>}
        {incoming.byNumber.map((g) => (
          <Expandable
            key={g.version.key}
            head={
              <>
                <Link to={placeLink(g.version, g.places[0])} onClick={(e) => e.stopPropagation()} className="font-mono text-xs whitespace-nowrap hover:underline">
                  {displayCode(g.version)}
                </Link>
                <span className="truncate">{g.version.name}</span>
                {g.sameSet && <Tag>{t('doc.refs.sameSet')}</Tag>}
                {g.citedVersion && <Tag>{t('doc.refs.citedVersion', { version: g.citedVersion })}</Tag>}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{g.places.map(placeLabel).join(t('common.listSep'))}</span>
              </>
            }
          >
            {g.places.map((p) => (
              <Quote key={p.referenceId} label={placeLabel(p)} text={p.text} mark={p.written} to={placeLink(g.version, p)} />
            ))}
          </Expandable>
        ))}

        {incoming.byEquipment.length > 0 && incoming.equipment && (
          <div className="mt-3 rounded-md bg-muted/60 p-2.5">
            <p className="font-medium">
              {t('doc.refs.equipmentOnly', { model: incoming.equipment.model })}
              <span className="ml-2 font-normal text-muted-foreground">
                {t('doc.refs.counts', { docs: incoming.byEquipment.length, places: places(incoming.byEquipment) })} · {t('doc.refs.lookTwice')}
              </span>
            </p>
            <p className="mt-1 text-xs leading-6">
              {incoming.byEquipment.map((g, i) => (
                <span key={g.version.key}>
                  {i > 0 && ' · '}
                  <Link to={placeLink(g.version, g.places[0])} className="font-mono hover:underline">
                    {displayCode(g.version)}
                  </Link>{' '}
                  {g.places.map(placeLabel).join(t('common.listSep'))}
                </span>
              ))}
            </p>
          </div>
        )}
        {incoming.hiddenObsolete.places > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('doc.refs.hiddenObsolete', { places: incoming.hiddenObsolete.places, codes: incoming.hiddenObsolete.versions.map(displayCode).join(t('common.listSep')) })}
          </p>
        )}
      </section>
      {ring.length > 0 && (
        <Expandable
          head={
            <span className="text-muted-foreground">
              {t('doc.refs.secondRing')}
              {t('doc.refs.secondRingSummary', { list: ring.map((r) => t('doc.refs.secondRingItem', { code: displayCode(r.version), count: r.citers.length })).join(t('common.listSep')) })}
            </span>
          }
        >
          {ring.map((r) => (
            <div key={r.version.key} className="py-1 text-xs">
              <p className="text-muted-foreground">{t('doc.refs.whoCites', { code: displayCode(r.version) })}</p>
              <p className="leading-6">
                {r.citers.map((c, i) => (
                  <span key={c.key}>
                    {i > 0 && ' · '}
                    <Link to={documentPath(c)} className="font-mono hover:underline">
                      {displayCode(c)}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          ))}
        </Expandable>
      )}
      </div>

      <section className="min-w-0">
        <h3 className="mb-1.5 font-semibold">
          {t('doc.refs.outgoing')}
          <span className="ml-2 font-normal text-muted-foreground">
            {t('doc.refs.counts', { docs: outgoingCount, places: places(outgoing.byNumber) + places(outgoing.external) })}
          </span>
        </h3>
        {outgoingCount === 0 && <p className="text-muted-foreground">{t('doc.refs.noOutgoing')}</p>}
        {outgoing.byNumber.map((g) => (
          <Expandable
            key={g.code}
            tone={g.target.kind === 'current' ? 'plain' : 'flag'}
            head={
              <>
                {g.version ? (
                  <Link to={documentPath(g.version)} onClick={(e) => e.stopPropagation()} className="font-mono text-xs whitespace-nowrap hover:underline">
                    {g.code}
                  </Link>
                ) : (
                  <span className="font-mono text-xs">{g.code}</span>
                )}
                <span className="truncate">{g.version?.name}</span>
                {g.sameSet && <Tag>{t('doc.refs.sameSet')}</Tag>}
                {g.target.kind === 'obsolete' && (
                  <Tag tone="strong">{g.target.replacedBy ? t('doc.refs.obsoleteReplaced', { code: g.target.replacedBy }) : t('doc.refs.obsolete')}</Tag>
                )}
                {g.target.kind === 'notFound' && <Tag tone="strong">{t('doc.refs.notFound')}</Tag>}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{g.places.map(placeLabel).join(t('common.listSep'))}</span>
              </>
            }
          >
            {g.places.map((p) => (
              <Quote key={p.referenceId} label={placeLabel(p)} text={p.text} mark={p.written} onClick={() => onShowPlace(p)} />
            ))}
          </Expandable>
        ))}
        {outgoing.external.map((e) => (
          <Expandable
            key={`${e.edition}-${e.chapter}`}
            head={
              <>
                <span className="text-xs">{t('doc.refs.chapter', { chapter: e.chapter })}</span>
                <span className="text-muted-foreground">{e.edition && /^\d{4}$/.test(e.edition) ? t('doc.refs.edition', { edition: e.edition }) : t('doc.refs.editionCurrent')}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{e.places.map(placeLabel).join(t('common.listSep'))}</span>
              </>
            }
          >
            {e.places.map((p) => (
              <Quote key={p.referenceId} label={placeLabel(p)} text={p.text} mark={p.written} onClick={() => onShowPlace(p)} />
            ))}
          </Expandable>
        ))}
        {outgoing.implicit.length > 0 && (
          <div className="mt-3 rounded-md bg-muted/60 p-2.5">
            <p className="font-medium">
              {t('doc.refs.implicit')}
              <span className="ml-2 font-normal text-muted-foreground">
                {t('doc.refs.places', { places: outgoing.implicit.length })} · {t('doc.refs.lookTwice')}
              </span>
            </p>
            <p className="mt-1 text-xs leading-6">
              {outgoing.implicit.map((p, i) => (
                <span key={p.referenceId}>
                  {i > 0 && ' · '}
                  <button type="button" onClick={() => onShowPlace(p)} className="hover:underline">
                    {t('doc.refs.implicitItem', { place: placeLabel(p), text: p.written })}
                  </button>
                </span>
              ))}
            </p>
          </div>
        )}
      </section>
      </div>
    </div>
  )
}

function Expandable({ head, children, tone = 'plain' }: { head: ReactNode; children: ReactNode; tone?: 'plain' | 'flag' }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn('border-b last:border-0', tone === 'flag' && 'bg-mark/60')}>
      <div role="button" tabIndex={0} onClick={() => setOpen(!open)} onKeyDown={(e) => e.key === 'Enter' && setOpen(!open)} className="flex cursor-pointer items-center gap-2 py-1.5 hover:bg-muted/60">
        {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        {head}
      </div>
      {open && <div className="pb-2 pl-5">{children}</div>}
    </div>
  )
}

/** The sentence that holds a reference, with the number as written marked (02 画面 4). */
function Quote({ label, text, mark, to, onClick }: { label: string; text: string; mark?: string; to?: string; onClick?: () => void }) {
  const at = mark ? text.indexOf(mark) : -1
  const body = (
    <>
      <span className="mr-2 text-xs text-muted-foreground">{label}</span>
      <span className="font-song">
        {at < 0 || !mark ? (
          text
        ) : (
          <>
            {text.slice(0, at)}
            <mark className="rounded-sm bg-mark px-0.5 text-foreground">{mark}</mark>
            {text.slice(at + mark.length)}
          </>
        )}
      </span>
    </>
  )
  if (to)
    return (
      <Link to={to} className="block rounded px-1.5 py-1 hover:bg-muted">
        {body}
      </Link>
    )
  return (
    <button type="button" onClick={onClick} className="block w-full rounded px-1.5 py-1 text-left hover:bg-muted">
      {body}
    </button>
  )
}
