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
  const config = {
    success: {
      icon: CheckCircle2,
      border: 'border-green-500/30',
      bg: 'bg-green-500/10',
      iconColor: 'text-green-400',
    },
    error: {
      icon: XCircle,
      border: 'border-red-500/30',
      bg: 'bg-red-500/10',
      iconColor: 'text-red-400',
    },
    warning: {
      icon: AlertTriangle,
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
    },
    info: {
      icon: Info,
      border: 'border-indigo-500/30',
      bg: 'bg-indigo-500/10',
      iconColor: 'text-indigo-400',
    },
  }

  const { icon: Icon, border, bg, iconColor } = config[toast.type]

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${border} ${bg} bg-zinc-900 backdrop-blur-sm shadow-lg animate-slide-in`}
    >
      <Icon className={`w-4.5 h-4.5 shrink-0 mt-0.5 ${iconColor}`} />
      <p className="text-sm text-zinc-200 flex-1">{toast.message}</p>
      <button
        onClick={onClose}
        className="text-zinc-600 hover:text-zinc-300 shrink-0 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
