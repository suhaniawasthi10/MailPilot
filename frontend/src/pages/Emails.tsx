import { useEffect, useState } from 'react'
import {
  Mail,
  RefreshCw,
  Loader2,
  Search,
  Sparkles,
  X,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Briefcase,
  Users,
  Newspaper,
  Megaphone,
  Receipt,
  CalendarDays,
  Bell,
  MailX,
  Inbox,
  Tag,
  Send,
} from 'lucide-react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useConnections } from '../context/ConnectionContext'
import { EmailListSkeleton } from '../components/Skeleton'
import { useSocket } from '../context/SocketContext'
import type { Email, EmailCategory } from '../types'
import { getAvatarColor } from '../lib/avatarColor'
import { timeAgo } from '../lib/formatDate'

// Safely extract plain text from HTML email bodies to prevent XSS attacks.
const stripHtml = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

// Category config: icon, label, color for each category
const CATEGORY_CONFIG: Record<EmailCategory, { icon: React.ElementType; label: string; color: string; bg: string; border: string }> = {
  personal:      { icon: Users,        label: 'Personal',     color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
  work:          { icon: Briefcase,    label: 'Work',         color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  newsletter:    { icon: Newspaper,    label: 'Newsletter',   color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20' },
  marketing:     { icon: Megaphone,    label: 'Marketing',    color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  receipt:       { icon: Receipt,      label: 'Receipt',      color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
  calendar:      { icon: CalendarDays, label: 'Calendar',     color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  notification:  { icon: Bell,         label: 'Notification', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  'cold-email':  { icon: MailX,        label: 'Cold Email',   color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20' },
  uncategorized: { icon: Tag,          label: 'Uncategorized',color: 'text-zinc-400',   bg: 'bg-zinc-500/10',   border: 'border-zinc-500/20' },
}

// Priority order: important categories first
const PRIORITY_ORDER: EmailCategory[] = [
  'personal', 'work', 'calendar', 'receipt',
  'newsletter', 'notification', 'marketing', 'cold-email', 'uncategorized',
]

function CategoryBadge({ category }: { category: EmailCategory }) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.uncategorized
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${config.bg} ${config.color} ${config.border}`}>
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </span>
  )
}

function Emails() {
  const { toast } = useToast()
  const { connections, activeConnection, loading } = useConnections()
  const socket = useSocket()
  const [emails, setEmails] = useState<Email[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncLimit, setSyncLimit] = useState('25')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<EmailCategory | 'all' | 'priority'>('priority')
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [draftReply, setDraftReply] = useState('')
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalEmails, setTotalEmails] = useState(0)

  // Fetch emails when connection or page changes
  useEffect(() => {
    if (!activeConnection) return
    setSelectedEmail(null)
    setDraftReply('')
    fetchEmails()
  }, [activeConnection, page])

  // Reset to page 1 when category or search changes
  const handleCategoryChange = (cat: EmailCategory | 'all' | 'priority') => {
    setActiveCategory(cat)
    setPage(1)
  }

  // Listen for real-time WebSocket events (replaces polling)
  // When a webhook delivers a new email, the backend pushes it here instantly
  useEffect(() => {
    if (!socket || !activeConnection) return

    const handleNewEmail = (email: Email) => {
      // Only add if it belongs to the active connection
      // Use toString() because MongoDB ObjectIds may not match strict equality
      if (String(email.connectionId) !== String(activeConnection)) return

      setEmails((prev) => {
        // Avoid duplicates — if the email already exists, update it
        const exists = prev.find((e) => e._id === email._id)
        if (exists) {
          return prev.map((e) => (e._id === email._id ? email : e))
        }
        // Add new email at the top (most recent first)
        return [email, ...prev]
      })
      setTotalEmails((prev) => prev + 1)

      // Show toast for new emails
      const senderName = email.sender?.match(/^(.+?)\s*</)?.[1] || email.sender
      toast(`New email from ${senderName}`, 'info')
    }

    socket.on('email:new', handleNewEmail)
    return () => { socket.off('email:new', handleNewEmail) }
  }, [socket, activeConnection])

  async function fetchEmails() {
    try {
      const { data } = await api.get(`/api/emails?connectionId=${activeConnection}&page=${page}&limit=20`)
      setEmails(data.emails)
      setTotalPages(data.pagination.pages)
      setTotalEmails(data.pagination.total)
    } catch (err) {
      // Silent fail — only toast on explicit user actions
    }
  }

  const handleSync = async () => {
    if (!activeConnection || syncing) return
    setSyncing(true)
    try {
      const { data } = await api.post('/api/emails/sync', { connectionId: activeConnection, limit: parseInt(syncLimit) || 25 })
      toast(`Synced ${data.emails?.length || 0} emails`, 'success')
      await fetchEmails()
    } catch (err) {
      toast('Failed to sync emails', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleGenerateDraft = async (emailId: string) => {
    setGeneratingDraft(true)
    setDraftReply('')
    try {
      const { data } = await api.post(`/api/emails/generate-draft/${emailId}`)
      setDraftReply(data.replyText)
      toast('AI reply generated and saved as draft', 'success')
    } catch (err) {
      toast('Failed to generate reply', 'error')
    } finally {
      setGeneratingDraft(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(draftReply)
    setCopied(true)
    toast('Copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSendReply = async () => {
    if (!selectedEmail || !draftReply.trim() || sending) return
    setSending(true)
    try {
      await api.post(`/api/emails/send-reply/${selectedEmail._id}`, { replyText: draftReply })
      toast('Reply sent!', 'success')
      setDraftReply('')
    } catch {
      toast('Failed to send reply', 'error')
    } finally {
      setSending(false)
    }
  }

  // Filter by search + category
  const filtered = emails.filter((e) => {
    // Search filter
    if (search) {
      const q = search.toLowerCase()
      if (
        !e.subject?.toLowerCase().includes(q) &&
        !e.sender?.toLowerCase().includes(q) &&
        !e.snippet?.toLowerCase().includes(q)
      ) return false
    }
    // Category filter
    if (activeCategory === 'all') return true
    if (activeCategory === 'priority') {
      // Priority inbox: show personal, work, calendar first — hide noise
      return ['personal', 'work', 'calendar', 'receipt', 'uncategorized'].includes(e.category)
    }
    return e.category === activeCategory
  })

  // Sort by priority order when in priority view
  const sorted = activeCategory === 'priority'
    ? [...filtered].sort((a, b) => PRIORITY_ORDER.indexOf(a.category) - PRIORITY_ORDER.indexOf(b.category))
    : filtered

  // Count emails per category for the filter pills
  const categoryCounts = emails.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const parseSender = (sender: string) => {
    const match = sender?.match(/^(.+?)\s*<(.+)>$/)
    return match ? { name: match[1].trim(), email: match[2] } : { name: sender, email: '' }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="animate-pulse rounded-lg bg-zinc-800/60 w-32 h-8" />
        <div className="animate-pulse rounded-lg bg-zinc-800/60 w-full h-10" />
        <EmailListSkeleton />
      </div>
    )
  }

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 px-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center">
          <Mail className="w-8 h-8 text-zinc-500" />
        </div>
        <div className="text-center">
          <p className="text-zinc-300 font-medium">No accounts connected</p>
          <p className="text-zinc-500 text-sm mt-1">Connect your Gmail or Outlook to get started.</p>
        </div>
      </div>
    )
  }

  // Detail view
  if (selectedEmail) {
    const { name: senderName, email: senderEmail } = parseSender(selectedEmail.sender)
    const detailAvatar = getAvatarColor(senderName || '')

    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6 animate-slide-in-right">
        <button
          onClick={() => { setSelectedEmail(null); setDraftReply('') }}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> Back to emails
        </button>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden animate-fade-in">
          <div className="p-6 border-b border-zinc-800 space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-zinc-100 flex-1">
                {selectedEmail.subject || '(No subject)'}
              </h2>
              <CategoryBadge category={selectedEmail.category} />
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full ${detailAvatar.bg} border ${detailAvatar.border} flex items-center justify-center`}>
                <span className={`text-sm font-medium ${detailAvatar.text}`}>{senderName?.charAt(0)?.toUpperCase() || '?'}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">{senderName}</p>
                {senderEmail && <p className="text-xs text-zinc-500">{senderEmail}</p>}
              </div>
              <span className="ml-auto text-xs text-zinc-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo(selectedEmail.receivedAt)}
              </span>
            </div>
          </div>

          <div className="p-6">
            <pre className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto font-sans">
              {stripHtml(selectedEmail.body || selectedEmail.snippet || '')}
            </pre>
          </div>

          <div className="p-6 border-t border-zinc-800 space-y-4">
            <button
              onClick={() => handleGenerateDraft(selectedEmail._id)}
              disabled={generatingDraft}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {generatingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generatingDraft ? 'Generating...' : 'Generate AI Reply'}
            </button>

            {draftReply && (
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-indigo-400 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> AI Draft Reply
                  </span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <textarea
                  value={draftReply}
                  onChange={(e) => setDraftReply(e.target.value)}
                  rows={6}
                  className="w-full bg-zinc-900/60 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed focus:outline-none focus:border-indigo-500 resize-y"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-zinc-600">Draft saved to {connections.find(c => c._id === activeConnection)?.provider === 'google' ? 'Gmail' : 'Outlook'}. Edit above and send directly.</p>
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !draftReply.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {sending ? 'Sending...' : 'Send Reply'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Emails</h1>
          <p className="text-sm text-zinc-500 mt-1">{totalEmails} email{totalEmails !== 1 ? 's' : ''}{activeCategory !== 'all' ? ` in ${activeCategory === 'priority' ? 'priority inbox' : activeCategory}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={100}
            value={syncLimit}
            onChange={(e) => setSyncLimit(e.target.value)}
            className="w-16 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2.5 text-sm text-zinc-300 text-center focus:outline-none focus:border-indigo-500"
            title="Number of emails to sync"
          />
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <FilterPill
          active={activeCategory === 'priority'}
          onClick={() => handleCategoryChange('priority')}
          icon={Inbox}
          label="Priority"
        />
        <FilterPill
          active={activeCategory === 'all'}
          onClick={() => handleCategoryChange('all')}
          icon={Mail}
          label="All"
          count={totalEmails}
        />
        {PRIORITY_ORDER.filter(cat => categoryCounts[cat]).map((cat) => (
          <FilterPill
            key={cat}
            active={activeCategory === cat}
            onClick={() => handleCategoryChange(cat)}
            icon={CATEGORY_CONFIG[cat].icon}
            label={CATEGORY_CONFIG[cat].label}
            count={categoryCounts[cat] || 0}
          />
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search emails..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Email list */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-7 h-7 text-zinc-500" />
          </div>
          <p className="text-sm text-zinc-300 font-medium">
            {emails.length === 0 ? 'No emails yet' : 'No emails match your filters'}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {emails.length === 0 ? 'Hit Sync to fetch your latest emails.' : 'Try a different category or clear your search.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/60 overflow-hidden">
          {sorted.map((email) => {
            const { name } = parseSender(email.sender)
            const avatar = getAvatarColor(name || '')
            return (
              <button
                key={email._id}
                onClick={() => setSelectedEmail(email)}
                className="w-full text-left px-5 py-4 hover:bg-zinc-900/60 transition-colors flex items-start gap-4 cursor-pointer"
              >
                <div className={`w-9 h-9 rounded-full ${avatar.bg} border ${avatar.border} flex items-center justify-center shrink-0 mt-0.5`}>
                  <span className={`text-xs font-medium ${avatar.text}`}>
                    {name?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">{name}</p>
                      <CategoryBadge category={email.category} />
                    </div>
                    <span className="text-xs text-zinc-600 shrink-0">
                      {timeAgo(email.receivedAt)}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300 truncate mt-0.5">{email.subject || '(No subject)'}</p>
                  <p className="text-xs text-zinc-500 truncate mt-0.5">{email.snippet}</p>
                </div>
                {email.isProcessed && (
                  <span className="shrink-0 mt-1 w-2 h-2 rounded-full bg-green-500/60" title="Processed" />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterPill({ active, onClick, icon: Icon, label, count }: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border ${
        active
          ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-300'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {count !== undefined && <span className={`ml-0.5 ${active ? 'text-indigo-400/70' : 'text-zinc-600'}`}>{count}</span>}
    </button>
  )
}

export default Emails
