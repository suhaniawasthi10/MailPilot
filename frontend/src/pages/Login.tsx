import { Mail, Sparkles, ArrowRight, Shield, Zap, Brain } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function Login() {
  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google`
  }

  const handleMicrosoftLogin = () => {
    window.location.href = `${API_URL}/auth/microsoft`
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-zinc-950 to-purple-600/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(99,102,241,0.15),_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(168,85,247,0.1),_transparent_50%)]" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Mail className="w-5 h-5 text-indigo-400" />
            </div>
            <span className="text-xl font-semibold text-zinc-100">MailPilot</span>
          </div>

          {/* Hero text */}
          <div className="space-y-6">
            <h1 className="text-5xl font-bold leading-tight text-zinc-100">
              Your AI
              <br />
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Chief of Staff
              </span>
              <br />
              for Email
            </h1>
            <p className="text-lg text-zinc-400 max-w-md">
              Automatically extract commitments, track deadlines, and draft intelligent replies — powered by AI.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-col gap-4">
            <FeaturePill
              icon={<Brain className="w-4 h-4" />}
              title="Smart Extraction"
              description="AI identifies commitments and deadlines from your emails"
            />
            <FeaturePill
              icon={<Zap className="w-4 h-4" />}
              title="Auto Draft Replies"
              description="Generate professional responses in one click"
            />
            <FeaturePill
              icon={<Shield className="w-4 h-4" />}
              title="Multi-Account"
              description="Connect Gmail and Outlook accounts in one place"
            />
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Mail className="w-5 h-5 text-indigo-400" />
            </div>
            <span className="text-xl font-semibold text-zinc-100">MailPilot</span>
          </div>

          {/* Header */}
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-zinc-100">Get started</h2>
            <p className="mt-2 text-zinc-400">Sign in with your email provider to begin</p>
          </div>

          {/* Sign-in buttons */}
          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              className="group w-full flex items-center gap-4 px-6 py-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all duration-200 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-zinc-100">Continue with Google</p>
                <p className="text-xs text-zinc-500">Gmail & Google Calendar</p>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </button>

            <button
              onClick={handleMicrosoftLogin}
              className="group w-full flex items-center gap-4 px-6 py-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all duration-200 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-zinc-100">Continue with Microsoft</p>
                <p className="text-xs text-zinc-500">Outlook & Microsoft Calendar</p>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-zinc-950 px-4 text-xs text-zinc-600 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                Powered by AI
              </span>
            </div>
          </div>

          {/* Footer info */}
          <p className="text-center text-xs text-zinc-600 leading-relaxed">
            By signing in, you grant MailPilot read access to your emails
            <br />
            to extract commitments and generate replies.
          </p>
        </div>
      </div>
    </div>
  )
}

function FeaturePill({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
    </div>
  )
}

export default Login
