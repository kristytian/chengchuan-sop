// Adds shadcn/ui components. The radix-nova registry imports `cn` from the
// `cn` package; this project uses the approved clsx + tailwind-merge helper in
// @/lib/utils instead, so rewrite those imports and drop `cn` again.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const components = process.argv.slice(2)
if (components.length === 0) {
  console.error('usage: npm run ui:add -- <component...>')
  process.exit(1)
}

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })
run('npx', ['shadcn', 'add', '-y', ...components])

const srcDir = join(root, 'src')
for (const rel of readdirSync(srcDir, { recursive: true, encoding: 'utf8' })) {
  if (!/\.tsx?$/.test(rel)) continue
  const file = join(srcDir, rel)
  const text = readFileSync(file, 'utf8')
  const fixed = text.replaceAll(/from (["'])cn\1/g, 'from "@/lib/utils"')
  if (fixed !== text) {
    writeFileSync(file, fixed)
    console.log(`ui:add  rewrote cn import in src/${rel}`)
  }
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (pkg.dependencies?.cn || pkg.devDependencies?.cn) run('npm', ['uninstall', 'cn'])
