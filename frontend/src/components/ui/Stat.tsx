import { type ReactNode } from 'react'

interface StatProps {
  /** Big editorial number (or short string) */
  value: ReactNode
  /** Tracked-out small-caps caption below */
  label: string
  /** Optional subtle hint line under the label */
  hint?: string
  /** Optional accent dot — used to flag attention items */
  accent?: boolean
  className?: string
}

// The signature visual element. Giant Newsreader serif number above a tiny
// uppercase tracked-out label. Reads like a magazine pull-quote, not a
// dashboard widget. NO card, NO icon — just typography.
function Stat({ value, label, hint, accent, className = '' }: StatProps) {
  return (
    <div className={className}>
      <div className="flex items-baseline gap-2">
        <span className="display tabular text-5xl text-ink leading-none">
          {value}
        </span>
        {accent && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent self-center" />
        )}
      </div>
      <p className="eyebrow mt-3">{label}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

export default Stat
