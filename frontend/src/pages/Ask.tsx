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
}

interface Message {
  id: string
  type: 'question' | 'answer'
  text: string
  sources?: Source[]
  error?: boolean
}

interface IndexStatus {
  total: number
  embedded: number
  pending: number
}

// ============================================================================
// Component
// ============================================================================

function Ask() {
  const { activeConnection } = useConnections()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
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
        connectionId: activeConnection,
      })

      const answerMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'answer',
        text: data.answer,
        sources: data.sources,
      }
      setMessages((prev) => [...prev, answerMsg])
    } catch {
      const answerMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'answer',
        text: 'Something went wrong. Make sure your emails have been indexed.',
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

  const loadingHint = 'Searching your emails…'

  return (
    <div className="flex flex-col h-full animate-fade-in bg-cream">
      {/* Header */}
      <div className="border-b border-rule px-6 lg:px-10 py-5">
        <div className="flex items-center justify-between max-w-4xl mx-auto gap-4">
          <div>
            <h1 className="text-[15px] font-semibold text-ink">Ask</h1>
            <p className="text-[12px] text-ink-muted mt-0.5">
              Ask questions about your inbox. Answers cite the emails they came from.
            </p>
          </div>

          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              title="Clear conversation"
              className="
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
                text-[12px] font-medium text-ink-muted hover:text-ink hover:bg-cream-deep
                transition-colors cursor-pointer
              "
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Index status */}
      {indexStatus && indexStatus.total > 0 && (
        <div className="px-6 lg:px-10 border-b border-rule">
          <div className="max-w-4xl mx-auto py-2.5">
            <div className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2 text-ink-muted tabular">
                {indexStatus.pending > 0 ? (
                  <>
                    <span>
                      <span className="text-ink font-medium">{indexStatus.embedded}</span>
                      {' / '}
                      {indexStatus.total} indexed
                    </span>
                    <span>· {indexStatus.pending} pending</span>
                  </>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-success" />
                    All {indexStatus.total} emails indexed
                  </span>
                )}
              </div>
              {indexStatus.pending > 0 && (
                <button
                  onClick={handleIndex}
                  disabled={indexing}
                  className="
                    text-ink hover:text-ink-soft transition-colors
                    disabled:opacity-50 cursor-pointer text-[12px] font-medium
                  "
                >
                  {indexing ? 'Indexing…' : 'Index now'}
                </button>
              )}
            </div>
            {indexStatus.pending > 0 && (
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

      {/* ===== Messages area ========================================
           Empty state: vertically centered so the page doesn't feel
           orphaned at the top with a void below. */}
      <div
        className={`
          flex-1 overflow-y-auto px-6 lg:px-10 py-8
          ${messages.length === 0 ? 'flex items-center justify-center' : ''}
        `}
      >
        <div className="max-w-4xl mx-auto w-full space-y-8">
          {messages.length === 0 && <EmptyState onSubmit={(q) => setInput(q)} />}

          {messages.map((msg) =>
            msg.type === 'question'
              ? <QuestionRow key={msg.id} text={msg.text} />
              : <AnswerBlock key={msg.id} message={msg} onOpenSource={handleOpenSource} />,
          )}

          {loading && (
            <div className="flex items-center gap-2.5 text-ink-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-[13px]">{loadingHint}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-rule px-6 lg:px-10 py-3 bg-paper">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              messages.length === 0
                ? 'Ask anything about your inbox…'
                : 'Ask another question…'
            }
            className="
              flex-1 h-10 px-3 bg-paper border border-rule rounded-md
              text-[13px] text-ink placeholder:text-ink-faint
              focus:outline-none focus:border-ink/40 transition-colors
            "
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="
              h-10 px-3.5 rounded-md bg-ink text-cream font-medium
              hover:bg-accent-hover border border-ink
              transition-colors cursor-pointer
              disabled:opacity-40 disabled:cursor-not-allowed
              flex items-center gap-1.5
            "
          >
            <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline text-[13px]">Ask</span>
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

function EmptyState({ onSubmit }: { onSubmit: (q: string) => void }) {
  const examples = [
    'What did we agree on with Acme Corp last month?',
    'Find anything urgent from this week',
    'Summarize my recent receipts and payments',
  ]
  return (
    <div className="max-w-lg mx-auto text-center">
      <h2 className="text-[20px] font-semibold text-ink leading-snug">
        Ask anything about your inbox
      </h2>
      <p className="text-[13px] text-ink-muted mt-2 leading-relaxed">
        Mailpilot reads through your email and answers in plain language,
        always citing the messages it pulled from.
      </p>

      <p className="text-[11px] font-medium text-ink-muted mt-10">Try asking</p>
      <div className="mt-2.5 space-y-1.5">
        {examples.map((q) => (
          <button
            key={q}
            onClick={() => onSubmit(q)}
            className="
              w-full block text-[13px] text-ink-soft hover:text-ink
              transition-colors cursor-pointer
              border border-rule hover:border-rule-strong rounded-md
              bg-paper px-3 py-2 text-left
            "
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function QuestionRow({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="text-[13px] text-ink max-w-xl text-right leading-relaxed bg-cream-deep px-3 py-2 rounded-md">
        {text}
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
      <div className="rounded-md border border-danger/30 bg-danger-soft/40 p-3">
        <div className="flex items-start gap-2 text-[13px] text-danger">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
          <p>{message.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-[13px] text-ink whitespace-pre-wrap leading-relaxed">
        {message.text}
      </p>

      {message.sources && message.sources.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setSourcesOpen(!sourcesOpen)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            {sourcesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {message.sources.length} {message.sources.length === 1 ? 'source' : 'sources'}
          </button>

          {sourcesOpen && (
            <ol className="mt-1.5 space-y-1">
              {message.sources.map((source, i) => (
                <li key={source.emailId + i}>
                  <button
                    onClick={() => onOpenSource(source.emailId)}
                    className="
                      group w-full text-left flex items-start gap-2.5 py-1.5 px-2 rounded
                      hover:bg-cream-deep transition-colors cursor-pointer
                    "
                  >
                    <span className="text-[10px] text-ink-faint tabular pt-1 w-4 text-right shrink-0">
                      {i + 1}.
                    </span>
                    <Mail className="w-3.5 h-3.5 text-ink-muted group-hover:text-ink shrink-0 mt-0.5 transition-colors" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-ink truncate">
                        {source.subject || '(no subject)'}
                      </p>
                      <p className="text-[11px] text-ink-muted mt-0.5 truncate">
                        {source.sender} · {formatDate(source.receivedAt)}
                        {source.score != null && (
                          <span className="ml-2 text-ink-soft tabular">{source.score}% match</span>
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
