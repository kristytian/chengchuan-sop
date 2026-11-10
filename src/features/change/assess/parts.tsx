import { cn } from '@/lib/utils'

/** A segmented choice (档位, 批注结论): what a person picks; nothing picked = not decided yet. */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: readonly { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-md border text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'border-l px-2.5 py-0.5 first:border-l-0 disabled:cursor-not-allowed',
            value === o.value ? 'bg-foreground text-background' : 'hover:bg-muted disabled:hover:bg-transparent',
            disabled && value !== o.value && 'text-muted-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Circled number of a 批注; dashed when AI found the place and the rules did not. */
export function NoteNumber({ n, dashed, active, onClick }: { n: number; dashed?: boolean; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-foreground font-sans text-[11px] leading-none',
        dashed && 'border-dashed',
        active ? 'bg-foreground text-background' : 'bg-background',
      )}
    >
      {n}
    </button>
  )
}
