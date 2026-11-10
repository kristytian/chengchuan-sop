// Scans kept under 换版追踪 (UX-52): one per returned old copy, and the signed
// sign-off sheet when issuing. They live in the browser's IndexedDB (no
// dependency, nothing leaves the machine); the demo state keeps only a
// reference. 「重置演示」 and 「跳到某一步」 clear them.

export interface UploadRef {
  /** Key in IndexedDB; null for demo data that came with no file. */
  id: string | null
  name: string
  size: number
  type: string
}

const DB = 'chengchuan-uploads'
const STORE = 'files'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = act(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

export async function saveUpload(file: File): Promise<UploadRef> {
  const id = crypto.randomUUID()
  await run('readwrite', (store) => store.put(file, id))
  return { id, name: file.name, size: file.size, type: file.type }
}

export const loadUpload = (id: string) => run<Blob | undefined>('readonly', (store) => store.get(id))

/** Opens a kept scan in a new tab. */
export async function openUpload(ref: UploadRef): Promise<void> {
  if (!ref.id) return
  const blob = await loadUpload(ref.id)
  if (blob) window.open(URL.createObjectURL(blob), '_blank', 'noopener')
}

export function clearUploads(): Promise<void> {
  return run('readwrite', (store) => store.clear()).then(() => undefined)
}
