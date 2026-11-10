import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import type { AIRun } from '../src/domain/model.ts'

const VIRTUAL_ID = 'virtual:ai-cache'
const RESOLVED_ID = `\0${VIRTUAL_ID}`
const REQUIRED: (keyof AIRun)[] = ['task', 'subject', 'inputHash', 'promptVersion', 'model', 'servedBy', 'runAt', 'output']

/** Where records live, and the mode each folder's records must declare. */
const FOLDERS = [
  { name: 'ai-cache', mode: 'cache' },
  // Hand-written examples in the same format, shown as 「AI 示例」 until the pre-run (UX-48).
  { name: 'ai-examples', mode: 'example' },
] as const

/**
 * Exposes every ai-cache/<task>/*.json record — and every hand-written
 * ai-examples/<task>/*.json example — as `virtual:ai-cache`, bundled at build
 * time; the app never calls a model. Malformed records fail the build.
 */
export function aiCache(root: string): Plugin {
  const dirs = FOLDERS.map((f) => ({ ...f, dir: join(root, f.name) }))
  return {
    name: 'ai-cache',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID) return
      const runs = dirs.flatMap(({ name, mode, dir }) => {
        const files = existsSync(dir)
          ? readdirSync(dir, { recursive: true, encoding: 'utf8' })
              .filter((f) => f.endsWith('.json'))
              .sort()
          : []
        return files.map((rel) => {
          const path = join(dir, rel)
          this.addWatchFile(path)
          const run = JSON.parse(readFileSync(path, 'utf8')) as Partial<AIRun>
          const missing = REQUIRED.filter((k) => run[k] === undefined)
          if (missing.length > 0) throw new Error(`[ai-cache] ${name}/${rel}: missing ${missing.join(', ')}`)
          if (run.mode !== mode) throw new Error(`[ai-cache] ${name}/${rel}: mode must be '${mode}'`)
          return run
        })
      })
      return `export default ${JSON.stringify(runs)}`
    },
    configureServer(server) {
      const onChange = (file: string) => {
        if (!dirs.some(({ dir }) => file.startsWith(dir)) || !file.endsWith('.json')) return
        const client = server.environments.client
        const mod = client.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) client.moduleGraph.invalidateModule(mod)
        client.hot.send({ type: 'full-reload' })
      }
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)
      server.watcher.on('change', onChange)
    },
  }
}
