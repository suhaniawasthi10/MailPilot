import { useState } from 'react'
import {
  Mail,
  Plus,
  Loader2,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useConnections } from '../context/ConnectionContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function Settings() {
  const { toast } = useToast()
  const { connections, loading, refresh } = useConnections()
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  const handleDisconnect = async (id: string, emailAddress: string) => {
    if (!confirm(`Disconnect ${emailAddress}? This will also delete all synced emails and commitments for this account.`)) {
      return
    }
    setDisconnecting(id)
    try {
      await api.delete(`/api/connections/${id}`)
      toast(`Disconnected ${emailAddress}`, 'success')
      await refresh()
    } catch (err) {
      toast('Failed to disconnect account', 'error')
    } finally {
      setDisconnecting(null)
    }
  }

  const handleConnectGoogle = () => {
    const token = localStorage.getItem('token')
    window.location.href = `${API_URL}/auth/google/connect?token=${token}`
  }

  const handleConnectMicrosoft = () => {
    const token = localStorage.getItem('token')
    window.location.href = `${API_URL}/auth/microsoft/connect?token=${token}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Manage your connected email accounts</p>
      </div>

      {/* Connected accounts */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Connected Accounts</h2>

        {connections.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
            <Mail className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No accounts connected yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((c) => (
              <div
                key={c._id}
                className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4"
              >
                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shrink-0">
                  {c.provider === 'google' ? (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 21 21">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200">{c.emailAddress}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {c.provider === 'google' ? 'Google' : 'Microsoft'} &middot; Connected {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-500/10 border border-green-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-[11px] font-medium text-green-400">Active</span>
                  </div>
                  <button
                    onClick={() => handleDisconnect(c._id, c.emailAddress)}
                    disabled={disconnecting === c._id}
                    className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                    title="Disconnect account"
                  >
                    {disconnecting === c._id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add account */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Add Account</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            onClick={handleConnectGoogle}
            className="flex items-center gap-3 px-5 py-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/60 hover:border-zinc-700 transition-colors cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium text-zinc-200">Connect Google</p>
              <p className="text-xs text-zinc-500">Gmail & Calendar</p>
            </div>
            <Plus className="w-4 h-4 text-zinc-600" />
          </button>

          <button
            onClick={handleConnectMicrosoft}
            className="flex items-center gap-3 px-5 py-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/60 hover:border-zinc-700 transition-colors cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
              <svg className="w-4.5 h-4.5" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium text-zinc-200">Connect Microsoft</p>
              <p className="text-xs text-zinc-500">Outlook & Calendar</p>
            </div>
            <Plus className="w-4 h-4 text-zinc-600" />
          </button>
        </div>
      </div>

      {/* About */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-2">
        <h3 className="text-sm font-medium text-zinc-300">About MailPilot</h3>
        <p className="text-xs text-zinc-500 leading-relaxed">
          MailPilot is your AI Chief of Staff for email. It syncs your inbox, extracts commitments and deadlines,
          generates smart replies, and tracks overdue items — so nothing falls through the cracks.
        </p>
        <div className="flex items-center gap-1 text-xs text-zinc-600">
          <ExternalLink className="w-3 h-3" />
          Powered by Groq AI
        </div>
      </div>
    </div>
  )
}

export default Settings
