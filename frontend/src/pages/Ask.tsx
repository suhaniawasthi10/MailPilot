import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Send, Loader2, ChevronDown, ChevronRight, Mail, Database, AlertCircle, Trash2 } from 'lucide-react'
import api from '../lib/api'
import { useConnections } from '../context/ConnectionContext'
import { formatDate } from '../lib/formatDate'
import ConfirmModal from '../components/ConfirmModal'

// Persist chat history per connection in localStorage so it survives page reloads
const CHAT_STORAGE_KEY = (connectionId: string) => `mailpilot_chat_${connectionId}`

// ============================================================================
// Types
// ============================================================================

interface Source {
  emailId: string
  sender: string
  subject: string
  receivedAt: string
  score?: number
}

interface RagResponse {
  answer: string
  sources: Source[]
  mode: string
  plan?: {
    sender?: string
    keywords?: string[]
    dateFrom?: string
    dateTo?: string
    category?: string
    intent?: string
  }
}

interface Message {
  id: string
  type: 'question' | 'answer'
  text: string
  sources?: Source[]
  mode?: string
  plan?: RagResponse['plan']
  error?: boolean
}

interface IndexStatus {
  total: number
  embedded: number
  pending: number
}

type Mode = 'hybrid' | 'vector' | 'vectorless'

// ============================================================================
// Component
// ============================================================================

function Ask() {
  const { activeConnection } = useConnections()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>('hybrid')
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null)
  const [indexing, setIndexing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load persisted chat history when connection changes
  useEffect(() => {
    if (!activeConnection) return
    try {
      const stored = localStorage.getItem(CHAT_STORAGE_KEY(activeConnection))
      setMessages(stored ? JSON.parse(stored) : [])
    } catch {
      setMessages([])
    }
  }, [activeConnection])

  // Persist chat history whenever messages change
  useEffect(() => {
    if (!activeConnection) return
    try {
      localStorage.setItem(CHAT_STORAGE_KEY(activeConnection), JSON.stringify(messages))
    } catch {
      // localStorage full or unavailable — silently skip
    }
  }, [messages, activeConnection])

  // Fetch index status — initial + auto-poll every 4s while indexing
  // is in progress so the progress bar updates live without a refresh.
  useEffect(() => {
    if (!activeConnection) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>

    const fetchStatus = async () => {
      try {
        const { data } = await api.get<IndexStatus>(
          `/api/rag/status?connectionId=${activeConnection}`,
        )
        if (cancelled) return
        setIndexStatus(data)
        // Keep polling while embeddings are still being processed
        if (data.pending > 0) {
          timeoutId = setTimeout(fetchStatus, 4000)
        }
      } catch {
        // Silently fail — status is informational
      }
    }

    fetchStatus()
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [activeConnection, indexing])

  const handleClearChat = () => {
    if (!activeConnection || messages.length === 0) return
    setShowClearConfirm(true)
  }

  const confirmClearChat = () => {
    if (!activeConnection) return
    setMessages([])
    localStorage.removeItem(CHAT_STORAGE_KEY(activeConnection))
    setShowClearConfirm(false)
  }

  const handleOpenSource = (emailId: string) => {
    // Navigate to the Emails page with this email pre-selected
    navigate(`/emails?emailId=${emailId}`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    // Add the user's question to the chat
    const questionMsg: Message = {
      id: Date.now().toString(),
      type: 'question',
      text: question,
    }
    setMessages((prev) => [...prev, questionMsg])
    setInput('')
    setLoading(true)

    try {
      const { data } = await api.post<RagResponse>('/api/rag/ask', {
        question,
        mode,
        connectionId: activeConnection,
      })

      const answerMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'answer',
        text: data.answer,
        sources: data.sources,
        mode: data.mode,
        plan: data.plan,
      }
      setMessages((prev) => [...prev, answerMsg])
    } catch (err) {
      const answerMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'answer',
        text: 'Something went wrong. Make sure Chroma is running and your emails are indexed.',
        error: true,
      }
      setMessages((prev) => [...prev, answerMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleIndex = async () => {
    if (indexing) return
    setIndexing(true)
    try {
      await api.post('/api/rag/index', { connectionId: activeConnection })
      // Refresh status after a short delay (indexing is async)
      setTimeout(async () => {
        const { data } = await api.get(`/api/rag/status?connectionId=${activeConnection}`)
        setIndexStatus(data)
        setIndexing(false)
      }, 3000)
    } catch {
      setIndexing(false)
    }
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 lg:px-8">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2.5">
              <Sparkles className="w-5.5 h-5.5 text-indigo-400" />
              Ask your Emails
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Ask natural language questions about your email history
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Clear chat button — only shown when there are messages */}
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                title="Clear conversation"
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-red-400 border border-transparent hover:border-red-500/30 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}

            {/* Mode selector */}
            {(['hybrid', 'vector', 'vectorless'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  mode === m
                    ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                    : 'text-zinc-500 hover:text-zinc-300 border border-transparent hover:border-zinc-700'
                }`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Index status bar */}
      {indexStatus && (
        <div className="px-6 lg:px-8">
          <div className="max-w-4xl mx-auto py-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-3 text-zinc-500">
                <Database className="w-3.5 h-3.5" />
                <span>
                  <span className="text-zinc-300">{indexStatus.embedded}</span> / {indexStatus.total} emails indexed
                </span>
                {indexStatus.pending > 0 && (
                  <span className="text-amber-400/80">
                    ({indexStatus.pending} pending)
                  </span>
                )}
              </div>
              {indexStatus.pending > 0 && (
                <button
                  onClick={handleIndex}
                  disabled={indexing}
                  className="text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {indexing ? 'Indexing...' : 'Index now'}
                </button>
              )}
            </div>
            {/* Progress bar */}
            {indexStatus.total > 0 && (
              <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500/60 rounded-full transition-all duration-500"
                  style={{ width: `${(indexStatus.embedded / indexStatus.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && (
            <EmptyState />
          )}

          {messages.map((msg) => (
            msg.type === 'question'
              ? <QuestionBubble key={msg.id} text={msg.text} />
              : <AnswerCard key={msg.id} message={msg} onOpenSource={handleOpenSource} />
          ))}

          {loading && (
            <div className="flex items-center gap-3 text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">
                {mode === 'vector' && 'Searching embeddings...'}
                {mode === 'vectorless' && 'Planning query...'}
                {mode === 'hybrid' && 'Searching & re-ranking...'}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800 px-6 lg:px-8 py-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your emails... e.g. 'What did we agree on with Acme Corp?'"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      <ConfirmModal
        open={showClearConfirm}
        title="Clear conversation?"
        message="This will permanently delete all messages in this chat. This cannot be undone."
        confirmText="Clear chat"
        cancelText="Keep"
        variant="danger"
        onConfirm={confirmClearChat}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
        <Sparkles className="w-8 h-8 text-indigo-400" />
      </div>
      <h3 className="text-lg font-semibold text-zinc-200">Ask anything about your emails</h3>
      <p className="text-sm text-zinc-500 mt-2 max-w-md">
        Get instant answers grounded in your actual email history. Try questions like:
      </p>
      <div className="mt-5 space-y-2">
        {[
          'What did we agree on with Acme Corp last month?',
          'When is my flight to Mumbai?',
          'Summarize all emails from Shalini',
        ].map((q) => (
          <div
            key={q}
            className="text-sm text-zinc-400 bg-zinc-900/60 border border-zinc-800/50 rounded-lg px-4 py-2.5"
          >
            "{q}"
          </div>
        ))}
      </div>
    </div>
  )
}

function QuestionBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="bg-indigo-600/20 border border-indigo-500/20 rounded-2xl rounded-br-md px-4 py-3 max-w-lg">
        <p className="text-sm text-zinc-200">{text}</p>
      </div>
    </div>
  )
}

function AnswerCard({ message, onOpenSource }: { message: Message; onOpenSource: (emailId: string) => void }) {
  const [sourcesOpen, setSourcesOpen] = useState(false)

  if (message.error) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <AlertCircle className="w-4 h-4 text-red-400" />
        </div>
        <div className="bg-zinc-900/60 border border-red-500/20 rounded-2xl rounded-tl-md px-4 py-3">
          <p className="text-sm text-red-300">{message.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="w-4 h-4 text-indigo-400" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        {/* Answer text */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl rounded-tl-md px-5 py-4">
          <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{message.text}</p>

          {/* Mode + plan info */}
          <div className="mt-3 pt-3 border-t border-zinc-800/60 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
            <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-500">
              {message.mode}
            </span>
            {message.plan?.sender && (
              <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-500">
                sender: {message.plan.sender}
              </span>
            )}
            {message.plan?.dateFrom && (
              <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-500">
                from: {message.plan.dateFrom}
              </span>
            )}
            {message.plan?.dateTo && (
              <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-500">
                to: {message.plan.dateTo}
              </span>
            )}
            {message.plan?.keywords && message.plan.keywords.length > 0 && (
              <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-500">
                keywords: {message.plan.keywords.join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Collapsible sources */}
        {message.sources && message.sources.length > 0 && (
          <div>
            <button
              onClick={() => setSourcesOpen(!sourcesOpen)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              {sourcesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
            </button>

            {sourcesOpen && (
              <div className="mt-2 space-y-2">
                {message.sources.map((source, i) => (
                  <button
                    key={source.emailId + i}
                    onClick={() => onOpenSource(source.emailId)}
                    className="w-full text-left flex items-start gap-3 bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/50 hover:border-indigo-500/40 rounded-lg px-4 py-3 transition-colors cursor-pointer group"
                  >
                    <Mail className="w-4 h-4 text-zinc-600 group-hover:text-indigo-400 shrink-0 mt-0.5 transition-colors" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-300 group-hover:text-zinc-100 truncate transition-colors">{source.subject || '(no subject)'}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {source.sender} · {formatDate(source.receivedAt)}
                        {source.score != null && (
                          <span className="ml-2 text-indigo-400/60">{source.score}% match</span>
                        )}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Ask
