// Answer keys are for evaluation scripts only (CLAUDE.md):
// - answers/ must never be referenced by app code, the sample loader or AI pre-run scripts;
// - docs/sample-library-list.md lists the seeded answers too, so none of them may reference it either;
// - scripts/eval/ builds and checks the answer keys, so none of them may import it.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const RULES = [
  {
    what: 'answers/',
    dirs: ['src', 'vite-plugins', 'scripts/ai-prerun'],
    pattern: /(^|[\s'"`/.(])answers(\/|['"`)]|$)/,
  },
  {
    what: 'docs/sample-library-list.md',
    dirs: ['src', 'vite-plugins', 'scripts/ai-prerun'],
    pattern: /sample-library-list/,
  },
  {
    what: 'scripts/eval/',
    dirs: ['src', 'vite-plugins', 'scripts/ai-prerun'],
    pattern: /scripts\/eval\b|['"`]\.\.\/eval\//,
  },
]

const hits: string[] = []
for (const rule of RULES) {
  for (const dir of rule.dirs) {
    const abs = join(root, dir)
    if (!existsSync(abs)) continue
    for (const rel of readdirSync(abs, { recursive: true, encoding: 'utf8' })) {
      if (!/\.(ts|tsx|js|mjs|json)$/.test(rel)) continue
      readFileSync(join(abs, rel), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (rule.pattern.test(line)) hits.push(`  ${rule.what} ← ${dir}/${rel}:${i + 1}  ${line.trim()}`)
        })
    }
  }
}

if (hits.length > 0) {
  console.error(`check:boundaries  ${hits.length} forbidden reference(s) to answer keys:`)
  console.error(hits.join('\n'))
  process.exit(1)
}
console.log(`check:boundaries  ok (${RULES.map((r) => `${r.what} ∉ ${r.dirs.join(', ')}`).join('; ')})`)
