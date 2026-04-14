import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className = '', id, ...rest },
  ref,
) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block eyebrow mb-1.5 text-ink-soft"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`
          w-full h-10 px-3
          bg-paper border border-rule rounded-md
          text-sm text-ink placeholder:text-ink-faint
          transition-colors duration-150
          focus:outline-none focus:border-ink/40
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-danger' : ''}
          ${className}
        `}
        {...rest}
      />
      {(hint || error) && (
        <p className={`mt-1.5 text-xs ${error ? 'text-danger' : 'text-ink-muted'}`}>
          {error || hint}
        </p>
      )}
    </div>
  )
})

export default Input
