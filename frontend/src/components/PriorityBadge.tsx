const styles = {
  high: 'bg-red-500/10 text-red-400 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-green-500/10 text-green-400 border-green-500/20',
}

export function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${styles[priority]}`}>
      {priority}
    </span>
  )
}
