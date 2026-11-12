// A person's edits that end where they began leave no mark (UX-50): text
// deleted and typed back the same. The editor would keep them as tracked
// changes that change nothing; this tells which, and the editor rejects them,
// which restores exactly what is there already. Formatting changes are not
// judged this way: the editor reports one formatting change over a whole
// paragraph with the before and after of its first run only, so a change
// that fixes later runs could look like nothing and be thrown away.

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
