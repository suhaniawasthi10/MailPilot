import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  loading?: boolean
}

// Solid, no gradients, no glassmorphism. Sharp 6px radius.
// Primary uses ink fill + tabular weight for clear dominance over secondary.
const variantClasses: Record<Variant, string> = {
  primary:   'bg-ink text-cream hover:bg-ink-soft border border-ink font-semibold',
  secondary: 'bg-paper text-ink hover:bg-cream-deep border border-rule-strong',
  ghost:     'bg-transparent text-ink-soft hover:text-ink hover:bg-cream-deep border border-transparent',
  danger:    'bg-danger text-cream hover:bg-accent-hover border border-danger',
  accent:    'bg-accent text-cream hover:bg-accent-hover border border-accent',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    leftIcon,
    rightIcon,
    loading,
    className = '',
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2
        rounded-md font-medium tracking-tight
        transition-colors duration-150
        cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20
        ${variantClasses[variant]} ${sizeClasses[size]} ${className}
      `}
      {...rest}
    >
      {leftIcon && <span className="shrink-0 -ml-0.5">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="shrink-0 -mr-0.5">{rightIcon}</span>}
    </button>
  )
})

export default Button
