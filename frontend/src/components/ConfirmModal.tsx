import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Button from './ui/Button'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'default'
  /**
   * If set, the confirm button is disabled until the user types this exact
   * string into the input field. Use for destructive, irreversible actions.
   */
  requireText?: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmModal({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  requireText,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState('')

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  // Reset the typed input each time the modal opens
  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  if (!open) return null

  const confirmDisabled = requireText ? typed !== requireText : false

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/30 animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md mx-4 bg-paper border border-rule rounded-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-md border border-rule bg-cream flex items-center justify-center shrink-0">
              <AlertTriangle className={`w-4.5 h-4.5 ${variant === 'danger' ? 'text-danger' : 'text-ink-soft'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="display text-lg text-ink leading-tight">{title}</h3>
              <p className="text-sm text-ink-soft mt-2 leading-relaxed">{message}</p>
              {requireText && (
                <div className="mt-4">
                  <p className="text-xs text-ink-muted">
                    Type <span className="font-mono text-ink">{requireText}</span> to confirm.
                  </p>
                  <input
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoFocus
                    className="
                      mt-2 w-full h-10 px-3 bg-cream border border-rule-strong rounded-md
                      text-sm text-ink font-mono
                      focus:outline-none focus:border-ink/40 transition-colors
                    "
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-cream border-t border-rule">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
