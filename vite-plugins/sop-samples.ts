import { join } from 'node:path'
import type { Plugin } from 'vite'
import { loadSampleLibrary, SAMPLES_DIR, SCENARIO_DIR } from './import/library.ts'

const VIRTUAL_ID = 'virtual:sop-samples'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

/**
 * Exposes the sample library (samples/ and scenario-inputs/ under `root`) as
 * `virtual:sop-samples`, converted to JSON at build time so it ships inside
 * the bundle. The source files are only read, never written.
 */
export function sopSamples(root: string): Plugin {
  const watchedDirs = [SAMPLES_DIR, SCENARIO_DIR].map((dir) => join(root, dir))

  return {
    name: 'sop-samples',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID) return
      const { library, files } = loadSampleLibrary(root)
      for (const file of files) this.addWatchFile(file)
      return `export default ${JSON.stringify(library)}`
    },
    configureServer(server) {
      // Adding or removing a file changes the library's file list, not just one
      // watched file — rebuild the virtual module and reload.
      const onSampleChange = (file: string) => {
        if (!watchedDirs.some((dir) => file.startsWith(dir)) || !/\.(docx|xlsx)$/.test(file)) return
        const client = server.environments.client
        const mod = client.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) client.moduleGraph.invalidateModule(mod)
        client.hot.send({ type: 'full-reload' })
      }
      server.watcher.on('add', onSampleChange)
      server.watcher.on('unlink', onSampleChange)
      server.watcher.on('change', onSampleChange)
    },
  }
}
