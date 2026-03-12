import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Mail, ListChecks, Settings, LogOut, Menu, X, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useConnections } from '../context/ConnectionContext'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/emails', icon: Mail, label: 'Emails' },
  { to: '/commitments', icon: ListChecks, label: 'Commitments' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { connections, activeConnection, setActiveConnection } = useConnections()

  const handleLogout = () => {
    localStorage.removeItem('token')
    navigate('/login')
  }

  const activeEmail = connections.find((c) => c._id === activeConnection)?.emailAddress

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-zinc-900/80 border-r border-zinc-800 backdrop-blur-sm
          flex flex-col transition-transform duration-200
          lg:translate-x-0 lg:static
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Mail className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="text-lg font-semibold text-zinc-100">MailPilot</span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account selector */}
        {connections.length > 1 && (
          <div className="px-3 pt-4 pb-2">
            <div className="relative">
              <select
                value={activeConnection}
                onChange={(e) => setActiveConnection(e.target.value)}
                className="w-full appearance-none bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2 pr-8 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer truncate"
              >
                {connections.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.emailAddress}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                }`
              }
            >
              <Icon className="w-4.5 h-4.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-zinc-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-500 hover:text-red-400 hover:bg-red-500/5 transition-colors w-full cursor-pointer"
          >
            <LogOut className="w-4.5 h-4.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden h-16 flex items-center justify-between px-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <Mail className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <span className="font-semibold text-zinc-100">MailPilot</span>
            </div>
          </div>
          {activeEmail && (
            <span className="text-xs text-zinc-500 truncate max-w-[140px]">{activeEmail}</span>
          )}
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
