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
  User,
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
} from 'lucide-react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useConnections } from '../context/ConnectionContext'
import { EmailListSkeleton } from '../components/Skeleton'
import { useSocket } from '../hooks/useSocket'
import type { Email, EmailCategory } from '../types'

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
  const [syncLimit, setSyncLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<EmailCategory | 'all' | 'priority'>('priority')
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [draftReply, setDraftReply] = useState('')
  const [copied, setCopied] = useState(false)

  // Fetch emails when connection changes
  useEffect(() => {
    if (!activeConnection) return
    setSelectedEmail(null)
    setDraftReply('')
    fetchEmails()
  }, [activeConnection])

  // Listen for real-time WebSocket events (replaces polling)
  // When a webhook delivers a new email, the backend pushes it here instantly
  useEffect(() => {
    if (!socket || !activeConnection) return

    const handleNewEmail = (email: Email) => {
      // Only add if it belongs to the active connection
      if (email.connectionId !== activeConnection) return

      setEmails((prev) => {
        // Avoid duplicates — if the email already exists, update it
        const exists = prev.find((e) => e._id === email._id)
        if (exists) {
          return prev.map((e) => (e._id === email._id ? email : e))
        }
        // Add new email at the top (most recent first)
        return [email, ...prev]
      })
    }

    socket.on('email:new', handleNewEmail)
    return () => { socket.off('email:new', handleNewEmail) }
  }, [socket, activeConnection])

  async function fetchEmails() {
    try {
      const { data } = await api.get(`/api/emails?connectionId=${activeConnection}`)
      setEmails(data)
    } catch (err) {
      // Silent fail on polling — only toast on explicit user actions
    }
  }

  const handleSync = async () => {
    if (!activeConnection || syncing) return
    setSyncing(true)
    try {
      const { data } = await api.post('/api/emails/sync', { connectionId: activeConnection, limit: syncLimit })
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
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 px-4">
        <Mail className="w-10 h-10 text-zinc-600" />
        <p className="text-zinc-500">No email accounts connected yet.</p>
      </div>
    )
  }

  // Detail view
  if (selectedEmail) {
    const { name: senderName, email: senderEmail } = parseSender(selectedEmail.sender)

    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
        <button
          onClick={() => { setSelectedEmail(null); setDraftReply('') }}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> Back to emails
        </button>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="p-6 border-b border-zinc-800 space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-zinc-100 flex-1">
                {selectedEmail.subject || '(No subject)'}
              </h2>
              <CategoryBadge category={selectedEmail.category} />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
                <User className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">{senderName}</p>
                {senderEmail && <p className="text-xs text-zinc-500">{senderEmail}</p>}
              </div>
              <span className="ml-auto text-xs text-zinc-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(selectedEmail.receivedAt).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
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
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{draftReply}</p>
                <p className="text-[11px] text-zinc-600">Draft has been saved to your {connections.find(c => c._id === activeConnection)?.provider === 'google' ? 'Gmail' : 'Outlook'} drafts.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Emails</h1>
          <p className="text-sm text-zinc-500 mt-1">{sorted.length} email{sorted.length !== 1 ? 's' : ''}{activeCategory !== 'all' ? ` in ${activeCategory === 'priority' ? 'priority inbox' : activeCategory}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={syncLimit}
            onChange={(e) => setSyncLimit(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value={10}>10 emails</option>
            <option value={20}>20 emails</option>
            <option value={30}>30 emails</option>
            <option value={50}>50 emails</option>
          </select>
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
          onClick={() => setActiveCategory('priority')}
          icon={Inbox}
          label="Priority"
          count={emails.filter(e => ['personal', 'work', 'calendar', 'receipt', 'uncategorized'].includes(e.category)).length}
        />
        <FilterPill
          active={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
          icon={Mail}
          label="All"
          count={emails.length}
        />
        {PRIORITY_ORDER.filter(cat => categoryCounts[cat]).map((cat) => (
          <FilterPill
            key={cat}
            active={activeCategory === cat}
            onClick={() => setActiveCategory(cat)}
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
          <Mail className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            {emails.length === 0 ? 'No emails yet. Hit Sync to fetch your latest emails.' : 'No emails match your filters.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/60 overflow-hidden">
          {sorted.map((email) => {
            const { name } = parseSender(email.sender)
            return (
              <button
                key={email._id}
                onClick={() => setSelectedEmail(email)}
                className="w-full text-left px-5 py-4 hover:bg-zinc-900/60 transition-colors flex items-start gap-4 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-zinc-400">
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
                      {new Date(email.receivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
    </div>
  )
}

function FilterPill({ active, onClick, icon: Icon, label, count }: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
  count: number
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
      <span className={`ml-0.5 ${active ? 'text-indigo-400/70' : 'text-zinc-600'}`}>{count}</span>
    </button>
  )
}

export default Emails
