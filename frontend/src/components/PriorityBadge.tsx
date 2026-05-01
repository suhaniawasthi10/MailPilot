const styles = {
  high:   'text-danger bg-danger-soft border-danger/30',
  medium: 'text-warning bg-warning-soft border-warning/30',
  low:    'text-ink-muted bg-cream-deep border-rule',
}

const labels = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  return (
    <span
      className={`
        inline-flex items-center
        px-1.5 py-0.5 rounded
        text-[11px] font-medium
        border
        ${styles[priority]}
      `}
    >
      {labels[priority]}
    </span>
  )
}
