import { type HTMLAttributes, type ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** "flat" = no border, just bg shift. "outlined" = 1px hairline rule. */
  variant?: 'flat' | 'outlined' | 'elevated'
  children: ReactNode
}

// Cards are restrained — no shadow, no gradient, sharp 6px radius.
// "elevated" gets the slight white paper feel (cards lift off cream bg).
function Card({ variant = 'outlined', className = '', children, ...rest }: CardProps) {
  const variantClasses = {
    flat:     'bg-cream-soft',
    outlined: 'bg-cream-soft border border-rule',
    elevated: 'bg-paper border border-rule',
  }[variant]

  return (
    <div
      className={`rounded-md ${variantClasses} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export default Card
