import React, { useEffect, useState } from 'react'
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
  Wand2,
  Reply,
  ReplyAll,
  Forward,
  ChevronDown,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useConnections } from '../context/ConnectionContext'
import { EmailsPageSkeleton } from '../components/Skeleton'
import { useSocket } from '../context/SocketContext'
import type { Email, EmailCategory } from '../types'
import { getAvatarColor } from '../lib/avatarColor'
import { timeAgo } from '../lib/formatDate'
import Button from '../components/ui/Button'

interface ThreadMessage {
  id: string
  threadId: string
  sender: string
  to: string
  cc: string
  subject: string
  body: string
  receivedAt: string
  snippet: string
}

const isHtml = (str: string): boolean => /<[a-z][\s\S]*>/i.test(str)

// Renders email HTML safely in a sandboxed iframe that auto-resizes.
// Style theme matches our cream/ink tokens so emails feel native to the app.
function EmailBodyRenderer({ html }: { html: string }) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  React.useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return

    doc.open()
    doc.write(`<!DOCTYPE html>
      <html><head><style>
        body { margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; line-height: 1.65; color: #1a1816; background: transparent; word-wrap: break-word; overflow-wrap: break-word; }
        img { max-width: 100%; height: auto; border-radius: 4px; }
        a { color: #c44d3d; text-decoration: underline; text-underline-offset: 2px; }
        blockquote { border-left: 2px solid #e8e3d8; margin: 8px 0; padding-left: 12px; color: #5c5853; }
        pre { background: #f7f4ee; padding: 8px 12px; border-radius: 4px; overflow-x: auto; border: 1px solid #e8e3d8; }
        table { border-collapse: collapse; max-width: 100%; }
        td, th { padding: 4px 8px; }
      </style></head><body>${html}</body></html>`)
    doc.close()

    const resize = () => {
      if (iframe.contentDocument?.body) {
        iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px'
      }
    }
    const images = doc.querySelectorAll('img')
    images.forEach((img) => img.addEventListener('load', resize))
    resize()
    setTimeout(resize, 300)
  }, [html])

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      className="w-full border-0 min-h-[60px]"
      title="Email content"
    />
  )
}

// Category config: cream-friendly tones — no neon accents.
// Each category gets a tasteful muted color paired with hairline border.
const CATEGORY_CONFIG: Record<
  EmailCategory,
  { icon: React.ElementType; label: string; text: string; bg: string; border: string }
> = {
  personal:      { icon: Users,        label: 'Personal',     text: 'text-ink',         bg: 'bg-cream-deep',   border: 'border-rule-strong' },
  work:          { icon: Briefcase,    label: 'Work',         text: 'text-accent-ink',  bg: 'bg-accent-soft',  border: 'border-accent/30' },
  newsletter:    { icon: Newspaper,    label: 'Newsletter',   text: 'text-success',     bg: 'bg-success-soft', border: 'border-success/20' },
  marketing:     { icon: Megaphone,    label: 'Marketing',    text: 'text-warning',     bg: 'bg-warning-soft', border: 'border-warning/20' },
  receipt:       { icon: Receipt,      label: 'Receipt',      text: 'text-success',     bg: 'bg-success-soft', border: 'border-success/20' },
  calendar:      { icon: CalendarDays, label: 'Calendar',     text: 'text-ink',         bg: 'bg-cream-deep',   border: 'border-rule-strong' },
  notification:  { icon: Bell,         label: 'Notification', text: 'text-warning',     bg: 'bg-warning-soft', border: 'border-warning/20' },
  'cold-email':  { icon: MailX,        label: 'Cold',         text: 'text-ink-muted',   bg: 'bg-cream',        border: 'border-rule' },
  uncategorized: { icon: Tag,          label: 'Other',        text: 'text-ink-muted',   bg: 'bg-cream',        border: 'border-rule' },
}

const PRIORITY_ORDER: EmailCategory[] = [
  'personal', 'work', 'calendar', 'receipt',
  'newsletter', 'notification', 'marketing', 'cold-email', 'uncategorized',
]

function CategoryBadge({ category }: { category: EmailCategory }) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.uncategorized
  const Icon = config.icon
  return (
    <span
      className={`
        inline-flex items-center gap-1
        px-1.5 py-0.5 rounded
        text-[10px] font-medium tracking-[0.08em] uppercase
        border ${config.bg} ${config.text} ${config.border}
      `}
    >
      <Icon className="w-2.5 h-2.5" strokeWidth={2} />
      {config.label}
    </span>
  )
}

function Emails() {
  const { toast } = useToast()
  const { connections, activeConnection, loading } = useConnections()
  const socket = useSocket()
  const [searchParams, setSearchParams] = useSearchParams()
  const [emails, setEmails] = useState<Email[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncLimit, setSyncLimit] = useState('25')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<EmailCategory | 'all' | 'priority'>('priority')
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [draftReply, setDraftReply] = useState('')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [showPromptInput, setShowPromptInput] = useState(false)
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [replyingTo, setReplyingTo] = useState<{ messageId: string; mode: 'reply' | 'reply-all' | 'forward' } | null>(null)
  const [replyText, setReplyText] = useState('')
  const [forwardTo, setForwardTo] = useState('')
  const [sendingThreadReply, setSendingThreadReply] = useState(false)
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalEmails, setTotalEmails] = useState(0)
  const [loadingEmails, setLoadingEmails] = useState(true)

  useEffect(() => {
    if (!activeConnection) return
    setSelectedEmail(null)
    setDraftReply('')
    fetchEmails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnection, page])

  // Auto-open an email when navigated here with ?emailId=... (from Ask AI).
  useEffect(() => {
    const targetId = searchParams.get('emailId')
    if (!targetId || !activeConnection) return
    ;(async () => {
      try {
        const found = emails.find((e) => e._id === targetId)
        if (found) {
          handleSelectEmail(found)
        } else {
          const { data } = await api.get(`/api/emails/${targetId}`)
          if (data) handleSelectEmail(data)
        }
      } catch {
        toast('Could not open that email', 'error')
      } finally {
        searchParams.delete('emailId')
        setSearchParams(searchParams, { replace: true })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, activeConnection, emails.length])

  const handleCategoryChange = (cat: EmailCategory | 'all' | 'priority') => {
    setActiveCategory(cat)
    setPage(1)
  }

  // Real-time new email push via Socket.io
  useEffect(() => {
    if (!socket || !activeConnection) return

    const handleNewEmail = (email: Email) => {
      if (String(email.connectionId) !== String(activeConnection)) return

      setEmails((prev) => {
        const exists = prev.find((e) => e._id === email._id)
        if (exists) return prev.map((e) => (e._id === email._id ? email : e))
        return [email, ...prev]
      })
      setTotalEmails((prev) => prev + 1)

      const senderName = email.sender?.match(/^(.+?)\s*</)?.[1] || email.sender
      toast(`New email from ${senderName}`, 'info')
    }

    socket.on('email:new', handleNewEmail)
    return () => { socket.off('email:new', handleNewEmail) }
  }, [socket, activeConnection, toast])

  async function fetchEmails() {
    setLoadingEmails(true)
    try {
      const { data } = await api.get(`/api/emails?connectionId=${activeConnection}&page=${page}&limit=20`)
      setEmails(data.emails)
      setTotalPages(data.pagination.pages)
      setTotalEmails(data.pagination.total)
    } catch {
      // Silent
    } finally {
      setLoadingEmails(false)
    }
  }

  const handleSync = async () => {
    if (!activeConnection || syncing) return
    setSyncing(true)
    try {
      const { data } = await api.post('/api/emails/sync', {
        connectionId: activeConnection,
        limit: parseInt(syncLimit) || 25,
      })
      toast(`Synced ${data.emails?.length || 0} emails`, 'success')
      await fetchEmails()
    } catch {
      toast('Failed to sync emails', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleGenerateDraft = async (emailId: string, prompt?: string) => {
    setGeneratingDraft(true)
    setDraftReply('')
    setDraftId(null)
    try {
      const { data } = await api.post(`/api/emails/generate-draft/${emailId}`, {
        customPrompt: prompt || undefined,
      })
      setDraftReply(data.replyText)
      setDraftId(data.draftId || null)
      toast('AI reply generated and saved as draft', 'success')
      setShowPromptInput(false)
      setCustomPrompt('')
    } catch {
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
      await api.post(`/api/emails/send-reply/${selectedEmail._id}`, {
        replyText: draftReply,
        draftId: draftId || undefined,
      })
      toast('Reply sent', 'success')
      setDraftReply('')
      setDraftId(null)
      if (selectedEmail) fetchThread(selectedEmail._id)
    } catch {
      toast('Failed to send reply', 'error')
    } finally {
      setSending(false)
    }
  }

  const fetchThread = async (emailId: string) => {
    setLoadingThread(true)
    try {
      const { data } = await api.get(`/api/emails/thread/${emailId}`)
      setThreadMessages(data.messages)
      if (data.messages.length > 0) {
        setExpandedMessages(new Set([data.messages[data.messages.length - 1].id]))
      }
    } catch {
      toast('Failed to load thread', 'error')
    } finally {
      setLoadingThread(false)
    }
  }

  const handleSelectEmail = (email: Email) => {
    setSelectedEmail(email)
    setDraftReply('')
    setReplyingTo(null)
    setReplyText('')
    setForwardTo('')
    fetchThread(email._id)
  }

  const handleThreadReply = async () => {
    if (!replyingTo || !activeConnection || sendingThreadReply) return
    if (replyingTo.mode === 'forward' && !forwardTo.trim()) return
    if (replyingTo.mode !== 'forward' && !replyText.trim()) return

    const msg = threadMessages.find((m) => m.id === replyingTo.messageId)
    if (!msg) return

    setSendingThreadReply(true)
    try {
      if (replyingTo.mode === 'forward') {
        await api.post(`/api/emails/forward/${selectedEmail!._id}`, {
          to: forwardTo.trim(),
          message: replyText.trim(),
        })
        toast('Email forwarded', 'success')
      } else {
        const senderEmail = extractEmail(msg.sender)
        let toAddr = senderEmail
        let ccAddr = ''

        if (replyingTo.mode === 'reply-all') {
          const myEmail = connections.find((c) => c._id === activeConnection)?.emailAddress || ''
          const allRecipients = [msg.to, msg.cc].filter(Boolean).join(', ')
          const addresses = allRecipients
            .split(',')
            .map((a) => extractEmail(a.trim()))
            .filter((a) => a && a !== myEmail)
          if (!addresses.includes(senderEmail)) addresses.unshift(senderEmail)
          toAddr = addresses[0] || senderEmail
          ccAddr = addresses.slice(1).join(', ')
        }

        await api.post('/api/emails/thread-reply', {
          connectionId: activeConnection,
          threadId: msg.threadId,
          messageId: msg.id,
          to: toAddr,
          cc: ccAddr,
          subject: msg.subject,
          replyText: replyText.trim(),
        })
        toast('Reply sent', 'success')
      }

      setReplyingTo(null)
      setReplyText('')
      setForwardTo('')
      if (selectedEmail) fetchThread(selectedEmail._id)
    } catch {
      toast('Failed to send', 'error')
    } finally {
      setSendingThreadReply(false)
    }
  }

  const extractEmail = (sender: string): string => {
    const match = sender?.match(/<(.+?)>/)
    return match ? match[1] : sender || ''
  }

  const toggleExpand = (id: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = emails.filter((e) => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !e.subject?.toLowerCase().includes(q) &&
        !e.sender?.toLowerCase().includes(q) &&
        !e.snippet?.toLowerCase().includes(q)
      ) return false
    }
    if (activeCategory === 'all') return true
    if (activeCategory === 'priority') {
      return ['personal', 'work', 'calendar', 'receipt', 'uncategorized'].includes(e.category)
    }
    return e.category === activeCategory
  })

  const sorted = activeCategory === 'priority'
    ? [...filtered].sort((a, b) => PRIORITY_ORDER.indexOf(a.category) - PRIORITY_ORDER.indexOf(b.category))
    : filtered

  const categoryCounts = emails.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const parseSender = (sender: string) => {
    const match = sender?.match(/^(.+?)\s*<(.+)>$/)
    return match ? { name: match[1].trim(), email: match[2] } : { name: sender, email: '' }
  }

  if (loading || (loadingEmails && emails.length === 0)) {
    return <EmailsPageSkeleton />
  }

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-5 px-4 max-w-md mx-auto text-center animate-fade-in">
        <div className="w-12 h-12 rounded-md bg-cream-soft border border-rule flex items-center justify-center">
          <Mail className="w-5 h-5 text-ink-soft" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="display text-xl text-ink">No accounts connected</h2>
          <p className="text-sm text-ink-soft mt-1">Connect Gmail or Outlook to get started.</p>
        </div>
      </div>
    )
  }

  // ============================================================
  // Thread / Detail view
  // ============================================================
  if (selectedEmail) {
    const handleBack = () => {
      setSelectedEmail(null)
      setDraftReply('')
      setThreadMessages([])
      setReplyingTo(null)
      setReplyText('')
      setForwardTo('')
      setShowPromptInput(false)
      setCustomPrompt('')
    }

    return (
      <div className="p-6 lg:p-10 max-w-3xl mx-auto space-y-6 animate-fade-in">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer eyebrow"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to inbox
        </button>

        {/* Subject — editorial display headline */}
        <div className="space-y-3 border-b border-rule pb-5">
          <h2 className="display text-3xl text-ink leading-tight">
            {selectedEmail.subject || '(No subject)'}
          </h2>
          <div className="flex items-center gap-3">
            <CategoryBadge category={selectedEmail.category} />
            <span className="text-xs text-ink-muted tabular">
              {threadMessages.length} message{threadMessages.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* AI Reply controls */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="primary"
              onClick={() => handleGenerateDraft(selectedEmail._id)}
              disabled={generatingDraft}
              leftIcon={generatingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            >
              {generatingDraft ? 'Generating' : 'AI reply'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowPromptInput(!showPromptInput)}
              leftIcon={<Wand2 className="w-3.5 h-3.5" />}
            >
              Custom
            </Button>
          </div>

          {showPromptInput && (
            <div className="flex gap-2">
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customPrompt.trim())
                    handleGenerateDraft(selectedEmail._id, customPrompt.trim())
                }}
                placeholder='e.g. "Decline politely" or "Ask for a meeting"'
                className="
                  flex-1 h-10 px-3 bg-paper border border-rule rounded-md
                  text-sm text-ink placeholder:text-ink-faint
                  focus:outline-none focus:border-ink/40
                "
              />
              <Button
                variant="primary"
                onClick={() => { if (customPrompt.trim()) handleGenerateDraft(selectedEmail._id, customPrompt.trim()) }}
                disabled={!customPrompt.trim() || generatingDraft}
                leftIcon={generatingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              >
                Generate
              </Button>
            </div>
          )}

          {draftReply && (
            <div className="border-l-2 border-accent pl-5 py-1 space-y-3 -ml-5">
              <div className="flex items-center justify-between">
                <span className="eyebrow text-accent-ink flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> AI draft
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                value={draftReply}
                onChange={(e) => setDraftReply(e.target.value)}
                rows={5}
                className="
                  w-full bg-paper border border-rule rounded-md px-3 py-2.5
                  text-sm text-ink leading-relaxed
                  focus:outline-none focus:border-ink/40 resize-y
                "
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-ink-muted">Edit above and send directly.</p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSendReply}
                  disabled={sending || !draftReply.trim()}
                  leftIcon={sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                >
                  {sending ? 'Sending' : 'Send reply'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Thread messages */}
        {loadingThread ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-rule rounded-md p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-cream-deep animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="w-32 h-4 bg-cream-deep animate-pulse rounded" />
                    <div className="w-48 h-3 bg-cream-deep animate-pulse rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {threadMessages.map((msg) => {
              const { name: msgName, email: msgEmail } = parseSender(msg.sender)
              const msgAvatar = getAvatarColor(msgName || '')
              const isExpanded = expandedMessages.has(msg.id)
              const isReplyingThis = replyingTo?.messageId === msg.id

              return (
                <div key={msg.id} className="border border-rule rounded-md bg-paper overflow-hidden">
                  {/* Header — click to expand */}
                  <button
                    onClick={() => toggleExpand(msg.id)}
                    className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-cream-soft transition-colors cursor-pointer"
                  >
                    <div className={`w-9 h-9 rounded-full ${msgAvatar.bg} border ${msgAvatar.border} flex items-center justify-center shrink-0`}>
                      <span className={`text-xs font-medium ${msgAvatar.text}`}>{msgName?.charAt(0)?.toUpperCase() || '?'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-ink">{msgName}</p>
                        {msgEmail && <p className="text-xs text-ink-muted truncate">&lt;{msgEmail}&gt;</p>}
                      </div>
                      {!isExpanded && (
                        <p className="text-xs text-ink-muted truncate mt-0.5">{msg.snippet}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-ink-muted tabular">{timeAgo(msg.receivedAt)}</span>
                      <ChevronDown className={`w-4 h-4 text-ink-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isExpanded && (
                    <>
                      {(msg.to || msg.cc) && (
                        <div className="px-5 pb-2 text-xs text-ink-muted space-y-0.5 border-t border-rule pt-3">
                          {msg.to && <p>To: {msg.to}</p>}
                          {msg.cc && <p>Cc: {msg.cc}</p>}
                        </div>
                      )}

                      <div className="px-5 pb-4">
                        {isHtml(msg.body || '') ? (
                          <EmailBodyRenderer html={msg.body} />
                        ) : (
                          <pre className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words font-sans">
                            {msg.body || msg.snippet || ''}
                          </pre>
                        )}
                      </div>

                      {/* Reply / Reply All / Forward */}
                      <div className="px-5 pb-4 flex items-center gap-2">
                        <ReplyButton
                          active={isReplyingThis && replyingTo?.mode === 'reply'}
                          onClick={(e) => { e.stopPropagation(); setReplyingTo({ messageId: msg.id, mode: 'reply' }); setReplyText(''); setForwardTo('') }}
                          icon={<Reply className="w-3.5 h-3.5" />}
                          label="Reply"
                        />
                        <ReplyButton
                          active={isReplyingThis && replyingTo?.mode === 'reply-all'}
                          onClick={(e) => { e.stopPropagation(); setReplyingTo({ messageId: msg.id, mode: 'reply-all' }); setReplyText(''); setForwardTo('') }}
                          icon={<ReplyAll className="w-3.5 h-3.5" />}
                          label="Reply all"
                        />
                        <ReplyButton
                          active={isReplyingThis && replyingTo?.mode === 'forward'}
                          onClick={(e) => { e.stopPropagation(); setReplyingTo({ messageId: msg.id, mode: 'forward' }); setReplyText(''); setForwardTo('') }}
                          icon={<Forward className="w-3.5 h-3.5" />}
                          label="Forward"
                        />
                      </div>

                      {isReplyingThis && (
                        <div className="px-5 pb-5 space-y-3 border-t border-rule pt-4 bg-cream-soft">
                          {replyingTo.mode === 'forward' && (
                            <input
                              type="email"
                              value={forwardTo}
                              onChange={(e) => setForwardTo(e.target.value)}
                              placeholder="Forward to email address"
                              className="
                                w-full h-10 px-3 bg-paper border border-rule rounded-md
                                text-sm text-ink placeholder:text-ink-faint
                                focus:outline-none focus:border-ink/40
                              "
                            />
                          )}
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            rows={4}
                            placeholder={replyingTo.mode === 'forward' ? 'Add a message (optional)…' : 'Write your reply…'}
                            className="
                              w-full bg-paper border border-rule rounded-md px-3 py-2.5
                              text-sm text-ink placeholder:text-ink-faint
                              focus:outline-none focus:border-ink/40 resize-y
                            "
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={handleThreadReply}
                              disabled={
                                sendingThreadReply ||
                                (replyingTo.mode === 'forward' ? !forwardTo.trim() : !replyText.trim())
                              }
                              leftIcon={sendingThreadReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            >
                              {sendingThreadReply ? 'Sending' : replyingTo.mode === 'forward' ? 'Forward' : 'Send'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setReplyingTo(null); setReplyText(''); setForwardTo('') }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ============================================================
  // List view
  // ============================================================
  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 border-b border-rule pb-6">
        <div>
          <p className="eyebrow">Your inbox</p>
          <h1 className="display text-4xl text-ink mt-1 leading-tight">Mail.</h1>
          <p className="text-sm text-ink-soft mt-2 tabular">
            <span className="text-ink font-medium">{totalEmails}</span>{' '}
            {totalEmails === 1 ? 'message' : 'messages'}
            {activeCategory !== 'all' && activeCategory !== 'priority' && ` in ${activeCategory}`}
            {activeCategory === 'priority' && ' in priority'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={100}
            value={syncLimit}
            onChange={(e) => setSyncLimit(e.target.value)}
            className="
              w-16 h-9 px-2 bg-paper border border-rule rounded-md
              text-sm text-ink-soft text-center tabular
              focus:outline-none focus:border-ink/40
            "
            title="Number of emails to sync"
          />
          <Button
            variant="primary"
            onClick={handleSync}
            disabled={syncing}
            leftIcon={syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          >
            {syncing ? 'Syncing' : 'Sync'}
          </Button>
        </div>
      </div>

      {/* Category filters — text-only with accent underline */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mb-1">
        <CategoryFilter
          active={activeCategory === 'priority'}
          onClick={() => handleCategoryChange('priority')}
          icon={Inbox}
          label="Priority"
        />
        <CategoryFilter
          active={activeCategory === 'all'}
          onClick={() => handleCategoryChange('all')}
          icon={Mail}
          label="All"
          count={totalEmails}
        />
        {PRIORITY_ORDER.filter((cat) => categoryCounts[cat]).map((cat) => (
          <CategoryFilter
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" strokeWidth={1.75} />
        <input
          type="text"
          placeholder="Search messages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="
            w-full h-10 pl-9 pr-9 bg-paper border border-rule rounded-md
            text-sm text-ink placeholder:text-ink-faint
            focus:outline-none focus:border-ink/40
          "
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* List — flat rows, hairline divider */}
      {sorted.length === 0 ? (
        <div className="border border-rule rounded-md bg-cream-soft p-12 text-center">
          <Mail className="w-7 h-7 text-ink-muted mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-ink">
            {emails.length === 0 ? 'No emails yet' : 'No emails match your filters'}
          </p>
          <p className="text-xs text-ink-muted mt-1">
            {emails.length === 0
              ? 'Hit Sync to fetch your latest emails.'
              : 'Try a different category or clear your search.'}
          </p>
        </div>
      ) : (
        <div className="border-t border-rule">
          {sorted.map((email) => {
            const { name } = parseSender(email.sender)
            const avatar = getAvatarColor(name || '')
            return (
              <button
                key={email._id}
                onClick={() => handleSelectEmail(email)}
                className="
                  w-full text-left px-2 py-4 border-b border-rule
                  hover:bg-cream-soft transition-colors flex items-start gap-4 cursor-pointer
                "
              >
                <div className={`w-9 h-9 rounded-full ${avatar.bg} border ${avatar.border} flex items-center justify-center shrink-0 mt-0.5`}>
                  <span className={`text-xs font-medium ${avatar.text}`}>
                    {name?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{name}</p>
                      <CategoryBadge category={email.category} />
                    </div>
                    <span className="text-xs text-ink-muted shrink-0 tabular">
                      {timeAgo(email.receivedAt)}
                    </span>
                  </div>
                  <p className="text-sm text-ink-soft truncate mt-1">{email.subject || '(No subject)'}</p>
                  <p className="text-xs text-ink-muted truncate mt-0.5">{email.snippet}</p>
                </div>
                {email.isProcessed && (
                  <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-success" title="Processed" />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-ink-muted tabular">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function CategoryFilter({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap
        transition-colors cursor-pointer
        ${active
          ? 'text-ink border-b-2 border-accent -mb-px'
          : 'text-ink-muted hover:text-ink border-b-2 border-transparent'}
      `}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
      {label}
      {typeof count === 'number' && (
        <span className="text-ink-faint tabular">· {count}</span>
      )}
    </button>
  )
}

function ReplyButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: (e: React.MouseEvent) => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium
        transition-colors cursor-pointer
        ${active
          ? 'bg-accent-soft border-accent/30 text-accent-ink'
          : 'bg-cream border-rule text-ink-soft hover:text-ink hover:border-ink/30'}
      `}
    >
      {icon} {label}
    </button>
  )
}

export default Emails
