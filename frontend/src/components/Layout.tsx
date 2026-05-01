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
        {/* Wordmark — clean sans, no italic, no decoration */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-rule">
          <span className="text-[15px] font-semibold tracking-tight text-ink">Mailpilot</span>
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
          <div className="px-3 pt-3 pb-1">
            <div className="relative">
              <select
                value={activeConnection}
                onChange={(e) => setActiveConnection(e.target.value)}
                className="
                  w-full appearance-none bg-paper border border-rule rounded-md
                  px-2.5 py-1.5 pr-7 text-xs text-ink-soft
                  focus:outline-none focus:border-ink/40 cursor-pointer truncate
                "
              >
                {connections.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.emailAddress}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
            </div>
          </div>
        )}

        {/* Nav links — Plain-style, no left rule, just bg shift on active */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
                  isActive
                    ? 'text-ink bg-cream-deep font-medium'
                    : 'text-ink-soft hover:text-ink hover:bg-cream-deep/60'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-ink' : 'text-ink-muted'}`}
                    strokeWidth={1.75}
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-2 border-t border-rule">
          <button
            onClick={handleLogout}
            className="
              flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px]
              text-ink-muted hover:text-ink hover:bg-cream-deep
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
        <header className="lg:hidden h-14 flex items-center justify-between px-4 border-b border-rule bg-cream-soft">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="text-ink-muted hover:text-ink cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-[15px] font-semibold tracking-tight text-ink">Mailpilot</span>
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
