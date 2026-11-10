// Changes the prototype walks through: every draft in scenario-inputs/ revises
// the library's current version of the same document (场景一); configured
// external-standard revisions add the rest (场景二).
import { type Catalog, currentVersion } from './catalog.ts'
import type { Change } from './model.ts'
import { EXTERNAL_CHANGES } from './scenarios.ts'
import { TERMS } from './source-terms.ts'

export function buildChanges(catalog: Catalog, externals = EXTERNAL_CHANGES): Change[] {
  const revisions = catalog.versions
    .filter((v) => v.origin === 'draft')
    .flatMap((draft): Change[] => {
      const old = currentVersion(catalog.byIdentity.get(draft.identity)?.filter((v) => v.origin === 'library'))
      if (!old) return []
      const from = TERMS.modelInName.exec(old.name)?.[2]
      const to = TERMS.modelInName.exec(draft.name)?.[2]
      return [
        {
          id: `revision:${draft.identity}:${old.version}->${draft.version}`,
          controlNo: null,
          source: { kind: 'revision', identity: draft.identity, oldVersion: old.key, newVersion: draft.key },
          equipment: from && to && from !== to ? { from, to } : null,
        },
      ]
    })
  const standards = externals.map(
    (e): Change => ({
      id: `external:${e.edition ?? 'any'}:${e.chapter}`,
      controlNo: null,
      source: { kind: 'externalStandard', chapter: e.chapter, edition: e.edition },
      equipment: null,
    }),
  )
  return [...revisions, ...standards]
}
