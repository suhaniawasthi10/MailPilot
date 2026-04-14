import { type ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

interface BadgeProps {
  tone?: Tone
  children: ReactNode
  className?: string
}

// Badges are NOT pills. They're small-caps tracked-out labels with a hairline
// border. Optional tinted background for tones. Premium/editorial feel.
const toneClasses: Record<Tone, string> = {
  neutral: 'text-ink-soft border-rule bg-cream',
  accent:  'text-accent-ink border-accent/30 bg-accent-soft',
  success: 'text-success border-success/20 bg-success-soft',
  warning: 'text-warning border-warning/20 bg-warning-soft',
  danger:  'text-danger border-danger/20 bg-danger-soft',
}

function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1
        px-1.5 py-0.5 rounded
        text-[10px] font-medium tracking-[0.1em] uppercase
        border
        ${toneClasses[tone]} ${className}
      `}
    >
      {children}
    </span>
  )
}

export default Badge
