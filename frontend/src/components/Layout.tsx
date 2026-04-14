import { NavLink } from 'react-router-dom'
import { disconnectSocket } from '../context/SocketContext'
import { LayoutDashboard, Mail, ListChecks, Sparkles, Settings, LogOut, Menu, X, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useConnections } from '../context/ConnectionContext'
import ComposeEmail from './ComposeEmail'

const navItems = [
  { to: '/dashboard',    label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/emails',       label: 'Inbox',       icon: Mail },
  { to: '/commitments',  label: 'Commitments', icon: ListChecks },
  { to: '/ask',          label: 'Ask',         icon: Sparkles },
  { to: '/settings',     label: 'Settings',    icon: Settings },
]

function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { connections, activeConnection, setActiveConnection } = useConnections()

  const handleLogout = () => {
    localStorage.removeItem('token')
    disconnectSocket()
    window.location.href = '/login'
  }

  const activeEmail = connections.find((c) => c._id === activeConnection)?.emailAddress

  return (
    <div className="h-screen bg-cream text-ink flex overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-ink/30 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-60 bg-cream-soft border-r border-rule
          flex flex-col transition-transform duration-200
          lg:translate-x-0 lg:static
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Wordmark — editorial serif italic, no logo box */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-rule">
          <div className="display italic text-xl text-ink leading-none">
            Mailpilot<span className="text-accent">.</span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-ink-muted hover:text-ink cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account selector — only when multiple */}
        {connections.length > 1 && (
          <div className="px-3 pt-4 pb-2">
            <p className="eyebrow px-2 mb-1.5">Account</p>
            <div className="relative">
              <select
                value={activeConnection}
                onChange={(e) => setActiveConnection(e.target.value)}
                className="
                  w-full appearance-none bg-paper border border-rule rounded-md
                  px-3 py-2 pr-8 text-xs text-ink-soft
                  focus:outline-none focus:border-ink/40 cursor-pointer truncate
                "
              >
                {connections.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.emailAddress}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
            </div>
          </div>
        )}

        {/* Nav links — active state uses a left vertical terracotta rule
             (Linear/Things style). Strong, unmistakable, but quiet. */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'text-ink bg-cream-deep font-semibold'
                    : 'text-ink-soft hover:text-ink hover:bg-cream-deep/60 font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent"
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-ink' : 'text-ink-muted'}`}
                    strokeWidth={isActive ? 2 : 1.75}
                  />
                  <span className="tracking-tight">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-rule">
          <button
            onClick={handleLogout}
            className="
              flex items-center gap-3 px-3 py-2 rounded-md text-sm
              text-ink-muted hover:text-danger hover:bg-danger-soft/60
              transition-colors w-full cursor-pointer
            "
          >
            <LogOut className="w-4 h-4" strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Mobile header */}
        <header className="lg:hidden h-16 flex items-center justify-between px-4 border-b border-rule bg-cream-soft">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="text-ink-muted hover:text-ink cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="display italic text-lg text-ink">
              Mailpilot<span className="text-accent">.</span>
            </div>
          </div>
          {activeEmail && (
            <span className="text-xs text-ink-muted truncate max-w-[140px]">{activeEmail}</span>
          )}
        </header>

        <main className="flex-1 overflow-y-auto bg-cream">
          {children}
        </main>
      </div>

      <ComposeEmail />
    </div>
  )
}

export default Layout
