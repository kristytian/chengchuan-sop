// All interface copy lives in src/i18n/zh-CN.json (CLAUDE.md). Fails on any CJK
// character in src/**/*.{ts,tsx} outside comment lines and test files.
// src/domain/source-terms.ts is exempt: it holds the words the rules read
// from the source documents, not interface copy.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/
const EXEMPT = new Set(['domain/source-terms.ts'])
const srcDir = join(import.meta.dirname, '..', 'src')

const hits: string[] = []
for (const rel of readdirSync(srcDir, { recursive: true, encoding: 'utf8' })) {
  if (!/\.tsx?$/.test(rel) || /\.test\.tsx?$/.test(rel) || EXEMPT.has(rel)) continue
  readFileSync(join(srcDir, rel), 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (CJK.test(line) && !COMMENT_LINE.test(line)) hits.push(`  src/${rel}:${i + 1}  ${line.trim()}`)
    })
}

if (hits.length > 0) {
  console.error(`check:i18n  ${hits.length} line(s) with hard-coded CJK text — move it to src/i18n/zh-CN.json:`)
  console.error(hits.join('\n'))
  process.exit(1)
}
console.log('check:i18n  ok')
