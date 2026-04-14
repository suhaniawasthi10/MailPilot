import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export const useToast = () => useContext(ToastContext)

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  // Light theme: solid paper bg, hairline border, single colored dot for state.
  // No tinted backgrounds, no glassmorphism — restrained editorial feel.
  const config = {
    success: { icon: CheckCircle2,   iconColor: 'text-success' },
    error:   { icon: XCircle,        iconColor: 'text-danger' },
    warning: { icon: AlertTriangle,  iconColor: 'text-warning' },
    info:    { icon: Info,           iconColor: 'text-ink-soft' },
  }

  const { icon: Icon, iconColor } = config[toast.type]

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-md bg-paper border border-rule shadow-[0_4px_24px_-8px_rgba(26,24,22,0.12)] animate-slide-in">
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} strokeWidth={2} />
      <p className="text-sm text-ink flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={onClose}
        className="text-ink-muted hover:text-ink shrink-0 cursor-pointer"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
