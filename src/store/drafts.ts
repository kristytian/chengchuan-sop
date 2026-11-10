// Working copies of the revision drafts under 审阅 (UX-50): the .docx as it
// stands — AI's tracked changes plus the reviewer's — one localStorage key per
// document, outside the demo state because each is tens of kilobytes.
// 「重置演示」 and 「跳到某一步」 clear them with the rest of the demo.

const PREFIX = 'chengchuan-draft:'

export const draftKey = (changeId: string, versionKey: string) => `${PREFIX}${changeId}:${versionKey}`

export function loadDraft(key: string): Blob | null {
  const data = localStorage.getItem(key)
  if (!data) return null
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

export async function saveDraft(key: string, blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  localStorage.setItem(key, btoa(text))
}

export function clearDrafts(): void {
  for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key)
}
