// SuperDoc, loaded only where a Word document is shown (审阅, 培训): the shared
// settings, and an instance off screen for writing or reading a document.
import type { DocApi, Instance } from './DocxEditor'

/** Papers fit their column, never above 100%, so two sit at the same size side by side. */
const ZOOM = { mode: 'fit-width', fitWidth: { max: 100, padding: 24 } }
/** Telemetry off (CLAUDE.md: nothing leaves the machine). */
export const BASE = { telemetry: { enabled: false }, zoom: ZOOM }
export const loadSuperDoc = () => Promise.all([import('superdoc'), import('superdoc/style.css')]).then(([m]) => m.SuperDoc)

/**
 * A SuperDoc instance off screen — a blank document, or the one given — to
 * write or read a document without showing it; gone when the work is done.
 */
export async function offscreen<T>(source: Blob | null, work: (doc: DocApi, exportDocx: () => Promise<Blob>) => Promise<T>): Promise<T> {
  const SuperDoc = await loadSuperDoc()
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:820px'
  document.body.append(host)
  return new Promise<T>((resolve, reject) => {
    const sd = new SuperDoc({
      ...BASE,
      selector: host,
      ...(source && { document: new File([source], 'document.docx', { type: source.type }) }),
      documentMode: 'editing',
      ui: { comments: false, contextMenu: false, loading: false },
      onReady: async () => {
        const doc = sd.activeEditor?.doc
        try {
          if (!doc) throw new Error('no editor')
          resolve(await work(doc, () => sd.export({ exportType: ['docx'], triggerDownload: false })))
        } catch (error) {
          reject(error)
        } finally {
          setTimeout(() => {
            sd.destroy()
            host.remove()
          })
        }
      },
    } as ConstructorParameters<typeof SuperDoc>[0]) as unknown as Instance
  })
}

