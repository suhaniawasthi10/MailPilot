import { ArrowRight, Brain, Zap, Shield } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function Login() {
  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google`
  }

  const handleMicrosoftLogin = () => {
    window.location.href = `${API_URL}/auth/microsoft`
  }

  return (
    <div className="min-h-screen bg-cream text-ink flex">
      {/* ==========================================================
            Left panel — editorial brand
         ========================================================== */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-cream-soft border-r border-rule">
        <div className="relative z-10 flex flex-col justify-between p-14 w-full">
          {/* Wordmark */}
          <div className="display italic text-2xl text-ink leading-none">
            Mailpilot<span className="text-accent">.</span>
          </div>

          {/* Hero — editorial typography, no gradients */}
          <div className="space-y-7 max-w-md">
            <p className="eyebrow">An AI Chief of Staff</p>
            <h1 className="display text-[64px] leading-[0.95] tracking-[-0.02em] text-ink">
              The inbox, <em className="text-accent not-italic">read</em> for you.
            </h1>
            <p className="text-base text-ink-soft leading-relaxed">
              Mailpilot extracts commitments, drafts replies, and answers questions
              about your email — grounded in what's actually in your inbox.
            </p>
          </div>

          {/* Feature list — minimal, no pills/cards */}
          <div className="space-y-5 max-w-md">
            <FeatureRow
              icon={<Brain className="w-4 h-4" strokeWidth={1.75} />}
              title="Smart extraction"
              description="Identifies commitments and deadlines automatically."
            />
            <FeatureRow
              icon={<Zap className="w-4 h-4" strokeWidth={1.75} />}
              title="Drafted replies"
              description="One-click responses written in your voice."
            />
            <FeatureRow
              icon={<Shield className="w-4 h-4" strokeWidth={1.75} />}
              title="Multi-account"
              description="Gmail and Outlook in a single inbox."
            />
          </div>
        </div>
      </div>

      {/* ==========================================================
            Right panel — sign-in form
         ========================================================== */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-10">
          {/* Mobile wordmark */}
          <div className="lg:hidden text-center">
            <div className="display italic text-2xl text-ink">
              Mailpilot<span className="text-accent">.</span>
            </div>
          </div>

          {/* Header */}
          <div className="space-y-2">
            <p className="eyebrow">Welcome</p>
            <h2 className="display text-4xl text-ink leading-tight">Sign in.</h2>
            <p className="text-sm text-ink-soft mt-2">
              Continue with the email provider you already use.
            </p>
          </div>

          {/* Sign-in buttons — paper surfaces, hairline borders */}
          <div className="space-y-3">
            <button
              onClick={handleGoogleLogin}
              className="
                group w-full flex items-center gap-4 px-5 py-4
                bg-paper border border-rule hover:border-ink/40 rounded-md
                transition-colors duration-150 cursor-pointer
              "
            >
              <div className="w-9 h-9 rounded-md bg-cream flex items-center justify-center shrink-0 border border-rule">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-ink">Continue with Google</p>
                <p className="text-xs text-ink-muted mt-0.5">Gmail & Calendar</p>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-muted group-hover:text-ink group-hover:translate-x-0.5 transition-all" />
            </button>

            <button
              onClick={handleMicrosoftLogin}
              className="
                group w-full flex items-center gap-4 px-5 py-4
                bg-paper border border-rule hover:border-ink/40 rounded-md
                transition-colors duration-150 cursor-pointer
              "
            >
              <div className="w-9 h-9 rounded-md bg-cream flex items-center justify-center shrink-0 border border-rule">
                <svg className="w-4 h-4" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-ink">Continue with Microsoft</p>
                <p className="text-xs text-ink-muted mt-0.5">Outlook & Calendar</p>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-muted group-hover:text-ink group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>

          {/* Footer */}
          <p className="text-xs text-ink-muted leading-relaxed">
            By signing in, you grant Mailpilot read access to your emails
            so it can extract commitments and draft replies on your behalf.
          </p>
        </div>
      </div>
    </div>
  )
}

function FeatureRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-8 h-8 flex items-center justify-center text-ink-soft shrink-0 mt-0.5 border border-rule rounded-md bg-cream">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

export default Login
