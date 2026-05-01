import { type ReactNode } from 'react'

interface StatProps {
  value: ReactNode
  label: string
  hint?: string
  /** Subtle dot to draw attention (e.g. for overdue counts > 0) */
  accent?: boolean
  className?: string
}

/**
 * A small, dense stat card. Label on top, number below — the Linear pattern.
 * No serif, no tracked-out caption, no oversized typography.
 */
function Stat({ value, label, hint, accent, className = '' }: StatProps) {
  return (
    <div
      className={`rounded-md border border-rule bg-paper px-4 py-3 ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-medium text-ink-muted">{label}</p>
        {accent && <span className="w-1 h-1 rounded-full bg-danger" />}
      </div>
      <p className="mt-1 text-[22px] font-semibold tabular text-ink leading-tight">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>}
    </div>
  )
}

export default Stat
