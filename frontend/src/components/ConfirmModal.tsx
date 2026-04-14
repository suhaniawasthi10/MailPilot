import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'default'
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
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null

  const confirmClasses =
    variant === 'danger'
      ? 'bg-red-500/90 hover:bg-red-500 text-white border-red-500/50'
      : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/50'

  const iconColor = variant === 'danger' ? 'text-red-400' : 'text-indigo-400'
  const iconBg = variant === 'danger' ? 'bg-red-500/10 border-red-500/20' : 'bg-indigo-500/10 border-indigo-500/20'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md mx-4 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl border ${iconBg} flex items-center justify-center shrink-0`}>
              <AlertTriangle className={`w-5 h-5 ${iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
              <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-zinc-950/40 border-t border-zinc-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${confirmClasses}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
