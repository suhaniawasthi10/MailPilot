interface DividerProps {
  /** "horizontal" (default) creates an hr-like rule. "vertical" for inline use. */
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

// Hairline divider — barely visible, premium feel.
function Divider({ orientation = 'horizontal', className = '' }: DividerProps) {
  if (orientation === 'vertical') {
    return <div className={`w-px self-stretch bg-rule ${className}`} role="separator" />
  }
  return <div className={`h-px w-full bg-rule ${className}`} role="separator" />
}

export default Divider
