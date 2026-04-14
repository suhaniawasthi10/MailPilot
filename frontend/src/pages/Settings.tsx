import { useState, useEffect, useRef } from 'react'
import {
  Mail,
  Plus,
  Loader2,
  Trash2,
  Save,
  Type,
  Bold,
  Italic,
  Link,
} from 'lucide-react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useConnections } from '../context/ConnectionContext'
import { SettingsSkeleton } from '../components/Skeleton'
import Button from '../components/ui/Button'
import ConfirmModal from '../components/ConfirmModal'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function Settings() {
  const { toast } = useToast()
  const { connections, loading, refresh } = useConnections()
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [savingSignature, setSavingSignature] = useState(false)
  const [pendingDisconnect, setPendingDisconnect] = useState<{ id: string; email: string } | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get('/api/user/signature').then(({ data }) => {
      if (editorRef.current) editorRef.current.innerHTML = data.signature || ''
    }).catch(() => {})
  }, [])

  const handleSaveSignature = async () => {
    setSavingSignature(true)
    try {
      const html = editorRef.current?.innerHTML || ''
      await api.put('/api/user/signature', { signature: html })
      toast('Signature saved', 'success')
    } catch {
      toast('Failed to save signature', 'error')
    } finally {
      setSavingSignature(false)
    }
  }

  const execCmd = (command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }

  // Confirm in styled modal instead of native confirm()
  const handleDisconnectClick = (id: string, email: string) => {
    setPendingDisconnect({ id, email })
  }

  const confirmDisconnect = async () => {
    if (!pendingDisconnect) return
    const { id, email } = pendingDisconnect
    setPendingDisconnect(null)
    setDisconnecting(id)
    try {
      await api.delete(`/api/connections/${id}`)
      toast(`Disconnected ${email}`, 'success')
      await refresh()
    } catch {
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
    return <SettingsSkeleton />
  }

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto space-y-12 animate-fade-in">
      {/* Header */}
      <div>
        <p className="eyebrow">Preferences</p>
        <h1 className="display text-4xl text-ink mt-1 leading-tight">Settings.</h1>
        <p className="text-sm text-ink-soft mt-2">Manage your accounts, signature, and identity.</p>
      </div>

      {/* ===========================================================
            Connected accounts
         =========================================================== */}
      <section className="space-y-4">
        <h2 className="eyebrow">Connected accounts</h2>

        {connections.length === 0 ? (
          <div className="border border-rule rounded-md bg-cream-soft p-10 text-center">
            <Mail className="w-7 h-7 text-ink-muted mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-ink-soft">No accounts connected yet.</p>
          </div>
        ) : (
          <div className="border-t border-rule">
            {connections.map((c) => (
              <div
                key={c._id}
                className="flex items-center gap-4 border-b border-rule px-2 py-4"
              >
                <div className="w-10 h-10 rounded-md bg-paper border border-rule flex items-center justify-center shrink-0">
                  {c.provider === 'google' ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 21 21">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{c.emailAddress}</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {c.provider === 'google' ? 'Google' : 'Microsoft'} · Connected{' '}
                    {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="flex items-center gap-1.5 text-[11px] text-success">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    Active
                  </span>
                  <button
                    onClick={() => handleDisconnectClick(c._id, c.emailAddress)}
                    disabled={disconnecting === c._id}
                    className="p-2 rounded-md text-ink-muted hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer disabled:opacity-50"
                    title="Disconnect account"
                  >
                    {disconnecting === c._id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===========================================================
            Add account
         =========================================================== */}
      <section className="space-y-4">
        <h2 className="eyebrow">Add account</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            onClick={handleConnectGoogle}
            className="
              flex items-center gap-3 px-4 py-3.5 rounded-md
              bg-paper border border-rule hover:border-ink/40
              transition-colors cursor-pointer
            "
          >
            <div className="w-9 h-9 rounded-md bg-cream border border-rule flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Connect Google</p>
              <p className="text-xs text-ink-muted">Gmail & Calendar</p>
            </div>
            <Plus className="w-4 h-4 text-ink-muted shrink-0" />
          </button>

          <button
            onClick={handleConnectMicrosoft}
            className="
              flex items-center gap-3 px-4 py-3.5 rounded-md
              bg-paper border border-rule hover:border-ink/40
              transition-colors cursor-pointer
            "
          >
            <div className="w-9 h-9 rounded-md bg-cream border border-rule flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Connect Microsoft</p>
              <p className="text-xs text-ink-muted">Outlook & Calendar</p>
            </div>
            <Plus className="w-4 h-4 text-ink-muted shrink-0" />
          </button>
        </div>
      </section>

      {/* ===========================================================
            Email signature
         =========================================================== */}
      <section className="space-y-4">
        <h2 className="eyebrow">Email signature</h2>
        <div className="border border-rule rounded-md bg-paper overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-rule bg-cream">
            <ToolbarButton onClick={() => execCmd('bold')} title="Bold">
              <Bold className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => execCmd('italic')} title="Italic">
              <Italic className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                const url = prompt('Enter URL:')
                if (url) execCmd('createLink', url)
              }}
              title="Add link"
            >
              <Link className="w-3.5 h-3.5" />
            </ToolbarButton>
            <div className="w-px h-4 bg-rule mx-1" />
            <ToolbarButton onClick={() => execCmd('fontSize', '2')} title="Small text">
              <Type className="w-3 h-3" />
            </ToolbarButton>
            <ToolbarButton onClick={() => execCmd('fontSize', '4')} title="Large text">
              <Type className="w-4 h-4" />
            </ToolbarButton>
          </div>
          {/* Editor */}
          <div
            ref={editorRef}
            contentEditable
            className="min-h-[140px] max-h-[220px] overflow-y-auto px-4 py-3 text-sm text-ink focus:outline-none [&_a]:text-accent [&_a]:underline"
          />
          {/* Save */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-rule bg-cream">
            <p className="text-xs text-ink-muted">Appended to all AI-generated drafts.</p>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveSignature}
              disabled={savingSignature}
              leftIcon={savingSignature ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            >
              Save
            </Button>
          </div>
        </div>
      </section>

      {/* ===========================================================
            About
         =========================================================== */}
      <section className="border-t border-rule pt-8">
        <p className="display italic text-base text-ink-soft leading-relaxed max-w-prose">
          Mailpilot reads your email so you don't have to. It extracts commitments,
          drafts replies, and answers questions — grounded in your actual inbox.
        </p>
        <p className="eyebrow mt-4">Powered by Groq · Chroma · MongoDB</p>
      </section>

      {/* Disconnect confirm modal */}
      <ConfirmModal
        open={pendingDisconnect !== null}
        title="Disconnect account?"
        message={
          pendingDisconnect
            ? `${pendingDisconnect.email} will be disconnected, and all synced emails and commitments for this account will be permanently deleted.`
            : ''
        }
        confirmText="Disconnect"
        cancelText="Keep"
        variant="danger"
        onConfirm={confirmDisconnect}
        onCancel={() => setPendingDisconnect(null)}
      />
    </div>
  )
}

function ToolbarButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded text-ink-soft hover:text-ink hover:bg-cream-deep transition-colors cursor-pointer"
    >
      {children}
    </button>
  )
}

export default Settings
