import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Loader2, ChevronDown, ChevronRight, Mail, AlertCircle, Trash2 } from 'lucide-react'
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

  // Fetch index status — initial + auto-poll every 4s while indexing pending
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
        if (data.pending > 0) {
          timeoutId = setTimeout(fetchStatus, 4000)
        }
      } catch {
        // status is informational, fail silently
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
    navigate(`/emails?emailId=${emailId}`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

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
    } catch {
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
      setTimeout(async () => {
        const { data } = await api.get(`/api/rag/status?connectionId=${activeConnection}`)
        setIndexStatus(data)
        setIndexing(false)
      }, 3000)
    } catch {
      setIndexing(false)
    }
  }

  const loadingHint =
    mode === 'vector'     ? 'Searching embeddings…' :
    mode === 'vectorless' ? 'Planning query…' :
                            'Searching & re-ranking…'

  return (
    <div className="flex flex-col h-full animate-fade-in bg-cream">
      {/* ===== Header — editorial =================================== */}
      <div className="border-b border-rule px-6 py-5 lg:px-10">
        <div className="flex items-end justify-between max-w-4xl mx-auto gap-6">
          <div>
            <p className="eyebrow">Conversational search</p>
            <h1 className="display text-3xl text-ink mt-1 leading-tight">Ask.</h1>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                title="Clear conversation"
                className="
                  flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
                  text-xs font-medium text-ink-muted hover:text-danger hover:bg-danger-soft
                  transition-colors cursor-pointer
                "
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
            <span className="w-px h-5 bg-rule mx-2" />
            {/* Mode selector — text-only links separated by dots */}
            <ModeSelector mode={mode} onChange={setMode} />
          </div>
        </div>
      </div>

      {/* ===== Index status — minimal hairline progress ============== */}
      {indexStatus && (
        <div className="px-6 lg:px-10 border-b border-rule">
          <div className="max-w-4xl mx-auto py-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-ink-muted tabular">
                <span>
                  <span className="text-ink font-medium">{indexStatus.embedded}</span>
                  {' / '}
                  {indexStatus.total} indexed
                </span>
                {indexStatus.pending > 0 && (
                  <span className="text-warning">· {indexStatus.pending} pending</span>
                )}
              </div>
              {indexStatus.pending > 0 && (
                <button
                  onClick={handleIndex}
                  disabled={indexing}
                  className="
                    text-accent hover:text-accent-hover transition-colors
                    disabled:opacity-50 cursor-pointer text-xs font-medium
                  "
                >
                  {indexing ? 'Indexing…' : 'Index now'}
                </button>
              )}
            </div>
            {indexStatus.total > 0 && (
              <div className="mt-2 h-px w-full bg-rule overflow-hidden relative">
                <div
                  className="absolute inset-y-0 left-0 bg-ink transition-all duration-500"
                  style={{ width: `${(indexStatus.embedded / indexStatus.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Messages area ======================================== */}
      <div className="flex-1 overflow-y-auto px-6 lg:px-10 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {messages.length === 0 && <EmptyState onSubmit={(q) => setInput(q)} />}

          {messages.map((msg) =>
            msg.type === 'question'
              ? <QuestionRow key={msg.id} text={msg.text} />
              : <AnswerBlock key={msg.id} message={msg} onOpenSource={handleOpenSource} />,
          )}

          {loading && (
            <div className="flex items-center gap-3 text-ink-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm italic">{loadingHint}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ===== Input ================================================ */}
      <div className="border-t border-rule px-6 lg:px-10 py-4 bg-cream-soft">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your emails…"
            className="
              flex-1 h-11 px-4 bg-paper border border-rule rounded-md
              text-sm text-ink placeholder:text-ink-faint
              focus:outline-none focus:border-ink/40 transition-colors
            "
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="
              h-11 px-4 rounded-md bg-ink text-cream
              hover:bg-ink-soft border border-ink
              transition-colors cursor-pointer
              disabled:opacity-40 disabled:cursor-not-allowed
            "
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

function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const modes: Mode[] = ['hybrid', 'vector', 'vectorless']
  return (
    <div className="flex items-center text-xs">
      {modes.map((m, i) => (
        <span key={m} className="flex items-center">
          <button
            onClick={() => onChange(m)}
            className={`
              px-2 py-1 transition-colors cursor-pointer
              ${mode === m
                ? 'text-ink font-medium underline underline-offset-4 decoration-accent decoration-2'
                : 'text-ink-muted hover:text-ink'}
            `}
          >
            {m}
          </button>
          {i < modes.length - 1 && <span className="text-ink-faint">·</span>}
        </span>
      ))}
    </div>
  )
}

function EmptyState({ onSubmit }: { onSubmit: (q: string) => void }) {
  const examples = [
    'What did we agree on with Acme Corp last month?',
    'When is my flight to Mumbai?',
    'Summarize all emails from Shalini',
  ]
  return (
    <div className="py-16 max-w-2xl">
      <p className="display italic text-2xl text-ink leading-snug">
        “Treat your inbox like a library — and ask it questions.”
      </p>
      <p className="eyebrow mt-6">Try asking</p>
      <div className="mt-3 space-y-1.5">
        {examples.map((q) => (
          <button
            key={q}
            onClick={() => onSubmit(q)}
            className="
              block text-sm text-ink-soft hover:text-ink italic
              transition-colors text-left cursor-pointer
              border-l-2 border-rule hover:border-accent pl-4 py-1
            "
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

// Question — right-aligned italic serif epigraph (no bubble)
function QuestionRow({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="display italic text-lg text-ink-soft max-w-xl text-right leading-snug">
        “{text}”
      </p>
    </div>
  )
}

// Answer — body text in sans, plan tags as inline meta, sources as indented citations
function AnswerBlock({
  message,
  onOpenSource,
}: {
  message: Message
  onOpenSource: (emailId: string) => void
}) {
  const [sourcesOpen, setSourcesOpen] = useState(true)

  if (message.error) {
    return (
      <div className="border-l-2 border-danger pl-5 py-1">
        <div className="flex items-start gap-2 text-sm text-danger">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
          <p>{message.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="border-l-2 border-rule pl-5 -ml-5">
      {/* Answer body */}
      <p className="text-[15px] text-ink whitespace-pre-wrap leading-relaxed">
        {message.text}
      </p>

      {/* Plan / mode meta — uppercase tracked-out, no pills */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-[0.1em] uppercase text-ink-muted">
        <span className="text-ink-soft">{message.mode}</span>
        {message.plan?.sender && (
          <span><span className="text-ink-faint">·</span> sender {message.plan.sender}</span>
        )}
        {message.plan?.dateFrom && (
          <span><span className="text-ink-faint">·</span> from {message.plan.dateFrom}</span>
        )}
        {message.plan?.dateTo && (
          <span><span className="text-ink-faint">·</span> to {message.plan.dateTo}</span>
        )}
        {message.plan?.keywords && message.plan.keywords.length > 0 && (
          <span><span className="text-ink-faint">·</span> kw {message.plan.keywords.join(', ')}</span>
        )}
      </div>

      {/* Sources — indented citations, click to open the email */}
      {message.sources && message.sources.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setSourcesOpen(!sourcesOpen)}
            className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer eyebrow"
          >
            {sourcesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {message.sources.length} {message.sources.length === 1 ? 'source' : 'sources'}
          </button>

          {sourcesOpen && (
            <ol className="mt-2 space-y-1.5">
              {message.sources.map((source, i) => (
                <li key={source.emailId + i}>
                  <button
                    onClick={() => onOpenSource(source.emailId)}
                    className="
                      group w-full text-left flex items-start gap-3 py-1.5 px-2 -mx-2 rounded
                      hover:bg-cream-deep transition-colors cursor-pointer
                    "
                  >
                    <span className="text-[10px] text-ink-faint tabular pt-1 w-5 text-right shrink-0">
                      {i + 1}.
                    </span>
                    <Mail className="w-3.5 h-3.5 text-ink-muted group-hover:text-accent shrink-0 mt-1 transition-colors" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink truncate">
                        {source.subject || '(no subject)'}
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5 truncate">
                        {source.sender} · {formatDate(source.receivedAt)}
                        {source.score != null && (
                          <span className="ml-2 text-accent-ink tabular">{source.score}% match</span>
                        )}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

export default Ask
