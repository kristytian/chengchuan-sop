// The built app must not load external resources (CLAUDE.md). Run after
// `vite build`. HTML/CSS references are hard failures; absolute URLs inside JS
// are mostly library strings (docs links, SVG namespaces), so they are listed
// for review rather than failed.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const distDir = join(import.meta.dirname, '..', 'dist')
if (!existsSync(distDir)) {
  console.error('check:offline  dist/ not found — run `npm run build` first')
  process.exit(1)
}

const HTML_EXTERNAL = /\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//gi
const CSS_EXTERNAL = /(?:url\(\s*["']?|@import\s+["'])(?:https?:)?\/\//gi
const JS_URL = /https?:\/\/[\w.-]+/g

const failures: string[] = []
const jsHosts = new Map<string, Set<string>>()
for (const rel of readdirSync(distDir, { recursive: true, encoding: 'utf8' })) {
  const text = /\.(html|css|js)$/.test(rel) ? readFileSync(join(distDir, rel), 'utf8') : ''
  if (rel.endsWith('.html') && HTML_EXTERNAL.test(text)) failures.push(`  dist/${rel}: external src/href`)
  if (rel.endsWith('.css') && CSS_EXTERNAL.test(text)) failures.push(`  dist/${rel}: external url()/@import`)
  if (rel.endsWith('.js')) {
    for (const [url] of text.matchAll(JS_URL)) {
      if (!jsHosts.has(url)) jsHosts.set(url, new Set())
      jsHosts.get(url)!.add(rel)
    }
  }
}

if (jsHosts.size > 0) {
  console.log('check:offline  absolute URLs in JS (library strings; review if new):')
  for (const [url, files] of jsHosts) console.log(`  ${url}  (${[...files].join(', ')})`)
}
if (failures.length > 0) {
  console.error('check:offline  external resources referenced:')
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('check:offline  ok')
