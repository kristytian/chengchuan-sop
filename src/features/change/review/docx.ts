// The sample .docx files, bundled at build time and inlined, so the editor
// opens the very file a document version was read from — no request at run
// time beyond loading the bundle's own chunks (CLAUDE.md 数据约定).

const files = import.meta.glob('/samples/**/*.docx', { query: '?inline', import: 'default' }) as Record<string, () => Promise<string>>

/** The original .docx of a library version (its key is the path under the repo root). */
export async function originalDocx(versionKey: string): Promise<Blob> {
  const load = files[`/${versionKey}`]
  if (!load) throw new Error(`no .docx for ${versionKey}`)
  const dataUrl = await load()
  return (await fetch(dataUrl)).blob()
}
