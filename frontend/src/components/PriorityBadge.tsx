// Priority badge — small-caps tracked-out, no rounded pill.
// High = terracotta accent (warning), Medium = aged amber, Low = neutral muted.
const styles = {
  high:   'text-accent-ink bg-accent-soft border-accent/30',
  medium: 'text-warning bg-warning-soft border-warning/20',
  low:    'text-ink-muted bg-cream border-rule',
}

export function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  return (
    <span
      className={`
        inline-flex items-center
        px-1.5 py-0.5 rounded
        text-[10px] font-medium tracking-[0.1em] uppercase
        border
        ${styles[priority]}
      `}
    >
      {priority}
    </span>
  )
}
