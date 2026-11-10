// A person's edits that end where they began leave no mark (UX-50): text
// deleted and typed back the same, underline put on and taken off. The
// editor would keep them as tracked changes that change nothing; these
// helpers tell which, and the editor rejects them, which restores exactly
// what is there already.

/** A paragraph as its redline reads: plain text, and each tracked piece with its change id. */
export type Segment = { kind: 'text'; text: string } | { kind: 'ins' | 'del'; id: string; text: string }

/**
 * Changes that undo each other: a stretch of a person's deletions and
 * insertions side by side, with nothing else between, whose deleted text is
 * its inserted text — 「检查」 struck and 「检查」 typed after it.
 */
export function undoneEdits(segments: readonly Segment[], mine: (id: string) => boolean): string[] {
  const ids = new Set<string>()
  let run: Extract<Segment, { id: string }>[] = []
  const close = () => {
    const text = (kind: 'ins' | 'del') => run.flatMap((s) => (s.kind === kind ? [s.text] : [])).join('')
    if (run.length > 0 && text('del') !== '' && text('del') === text('ins')) for (const s of run) ids.add(s.id)
    run = []
  }
  for (const s of segments) {
    if (s.kind === 'text') {
      if (s.text !== '') close()
    } else if (mine(s.id)) run.push(s)
    else close()
  }
  close()
  return [...ids]
}

/** Values that all mean "not set": no underline is 「none」 once toggled off, and absent before. */
const UNSET = new Set<unknown>([undefined, null, false, '', 'none', 'false', 'off', '0'])
const norm = (v: unknown) => (UNSET.has(v) ? null : String(v))

/** A formatting change that ends as it began. */
export function sameFormatting(before: Readonly<Record<string, unknown>> | undefined, after: Readonly<Record<string, unknown>> | undefined): boolean {
  if (!before || !after) return false
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].every((k) => norm(before[k]) === norm(after[k]))
}
