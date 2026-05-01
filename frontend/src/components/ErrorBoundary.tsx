import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-cream text-ink flex items-center justify-center p-8">
          <div className="max-w-sm text-center space-y-4">
            <div className="w-10 h-10 rounded-md bg-danger-soft border border-danger/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-4 h-4 text-danger" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-ink">Something went wrong</h2>
              <p className="text-[13px] text-ink-soft leading-relaxed">
                An unexpected error occurred. Try reloading the page.
              </p>
            </div>
            <button
              onClick={this.handleReload}
              className="
                inline-flex items-center gap-1.5 px-3 py-2 rounded-md
                bg-ink text-cream hover:bg-accent-hover border border-ink
                text-[13px] font-medium transition-colors cursor-pointer
              "
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
