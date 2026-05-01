import { useState, useRef, useEffect } from 'react'
import { Plus, X, Send, Loader2, Minus, Maximize2, Minimize2, Sparkles } from 'lucide-react'
import api from '../lib/api'
import { useToast } from './Toast'
import { useConnections } from '../context/ConnectionContext'
import Button from './ui/Button'
import ConfirmModal from './ConfirmModal'

function ComposeEmail() {
  const { toast } = useToast()
  const { connections, activeConnection } = useConnections()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [sending, setSending] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)
  const [signatureHtml, setSignatureHtml] = useState('')
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  // Fetch signature when compose opens
  useEffect(() => {
    if (!open) return
    api.get('/api/user/signature').then(({ data }) => {
      const sig = data.signature || ''
      setSignatureHtml(sig)
      if (bodyRef.current && sig) {
        bodyRef.current.innerHTML = `<br><br><div style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:8px;color:#4b5563">${sig}</div>`
      }
    }).catch(() => {})
  }, [open])

  const getBodyContent = () => bodyRef.current?.innerText?.trim() || ''
  const getBodyHtml = () => bodyRef.current?.innerHTML || ''

  const handleSend = async () => {
    if (!to.trim() || !getBodyContent() || sending) return
    if (!activeConnection) {
      toast('No email account connected', 'error')
      return
    }
    setSending(true)
    try {
      await api.post('/api/emails/compose', {
        to: to.trim(),
        subject: subject.trim(),
        body: getBodyHtml(),
        connectionId: activeConnection,
      })
      toast('Email sent', 'success')
      handleClose()
    } catch {
      toast('Failed to send email', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || generatingAi) return
    setGeneratingAi(true)
    try {
      const { data } = await api.post('/api/emails/generate-compose', {
        prompt: aiPrompt.trim(),
        subject: subject.trim(),
        to: to.trim(),
      })
      if (bodyRef.current) {
        const sigBlock = signatureHtml
          ? `<br><br><div style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:8px;color:#4b5563">${signatureHtml}</div>`
          : ''
        bodyRef.current.innerHTML = data.text.replace(/\n/g, '<br>') + sigBlock
      }
      setShowAiPrompt(false)
      setAiPrompt('')
      toast('AI draft generated', 'success')
    } catch {
      toast('Failed to generate email', 'error')
    } finally {
      setGeneratingAi(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setMinimized(false)
    setMaximized(false)
    setTo('')
    setSubject('')
    if (bodyRef.current) bodyRef.current.innerHTML = ''
    setAiPrompt('')
    setShowAiPrompt(false)
  }

  const handleDiscard = () => {
    if (to || subject || getBodyContent()) {
      setShowDiscardConfirm(true)
      return
    }
    handleClose()
  }

  if (connections.length === 0) return null

  // ===== FAB — paper surface with subtle lift, hover reveals accent.
  // Sits ON the page, doesn't punch through it. Soft shadow gives weight
  // without using black ink. =====
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="
          group fixed bottom-6 right-6 z-50
          flex items-center gap-1.5 px-3 py-2 rounded-md
          bg-ink text-cream text-[13px] font-medium
          hover:bg-accent-hover
          shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)]
          transition-all duration-150 cursor-pointer
        "
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2} />
        Compose
      </button>
    )
  }

  // ===== Minimized bar =====
  if (minimized) {
    return (
      <div className="fixed bottom-0 right-6 z-50 w-72 rounded-t-md bg-paper border border-rule border-b-0 shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.10)]">
        <div
          className="flex items-center justify-between px-3 py-2.5 cursor-pointer"
          onClick={() => setMinimized(false)}
        >
          <span className="text-[13px] font-medium text-ink truncate">
            {subject || 'New message'}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); setMinimized(false) }}
              className="p-1 rounded text-ink-muted hover:text-ink hover:bg-cream-deep transition-colors"
              aria-label="Restore"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDiscard() }}
              className="p-1 rounded text-ink-muted hover:text-ink hover:bg-cream-deep transition-colors"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const containerClass = maximized
    ? 'fixed inset-6 z-50 flex flex-col rounded-md bg-paper border border-rule shadow-[0_8px_40px_-12px_rgba(0,0,0,0.15)]'
    : 'fixed bottom-0 right-6 z-50 w-[520px] max-h-[580px] flex flex-col rounded-t-md bg-paper border border-rule border-b-0 shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.10)]'

  return (
    <>
      {/* Backdrop for maximized */}
      {maximized && (
        <div className="fixed inset-0 z-40 bg-ink/30" onClick={() => setMaximized(false)} />
      )}

      <div className={containerClass}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-rule shrink-0 bg-cream-soft rounded-t-md">
          <h3 className="text-[13px] font-medium text-ink">New message</h3>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setMinimized(true)}
              className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-cream-deep transition-colors"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setMaximized(!maximized)}
              className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-cream-deep transition-colors"
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleDiscard}
              className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-cream-deep transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* To */}
        <div className="flex items-center border-b border-rule px-3">
          <span className="text-[11px] text-ink-muted mr-2 shrink-0">To</span>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-faint py-2 focus:outline-none"
          />
        </div>

        {/* Subject */}
        <div className="flex items-center border-b border-rule px-3">
          <span className="text-[11px] text-ink-muted mr-2 shrink-0">Re</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-faint py-2 focus:outline-none"
          />
        </div>

        {/* Body */}
        <div
          ref={bodyRef}
          contentEditable
          data-placeholder="Write your message…"
          className={`
            flex-1 bg-transparent text-[13px] text-ink leading-relaxed
            px-3 py-2.5 focus:outline-none overflow-y-auto
            [&:empty]:before:content-[attr(data-placeholder)]
            [&:empty]:before:text-ink-faint
            [&_a]:text-ink [&_a]:underline
            ${maximized ? '' : 'min-h-[180px]'}
          `}
        />

        {/* AI Prompt Input */}
        {showAiPrompt && (
          <div className="flex gap-2 px-3 py-2.5 border-t border-rule bg-cream-soft">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && aiPrompt.trim()) handleAiGenerate()
              }}
              placeholder='e.g. "Follow up on project deadline"'
              className="
                flex-1 h-8 px-2.5 bg-paper border border-rule rounded-md
                text-[13px] text-ink placeholder:text-ink-faint
                focus:outline-none focus:border-ink/40
              "
              autoFocus
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleAiGenerate}
              disabled={!aiPrompt.trim() || generatingAi}
              leftIcon={generatingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            >
              {generatingAi ? 'Writing' : 'Generate'}
            </Button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2.5 border-t border-rule shrink-0 bg-cream-soft">
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={sending || !to.trim()}
              leftIcon={sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            >
              {sending ? 'Sending' : 'Send'}
            </Button>
            <Button
              variant={showAiPrompt ? 'primary' : 'secondary'}
              onClick={() => setShowAiPrompt(!showAiPrompt)}
              leftIcon={<Sparkles className="w-3.5 h-3.5" />}
            >
              Write with AI
            </Button>
          </div>
          <p className="text-[11px] text-ink-muted truncate ml-3">
            {connections.find(c => c._id === activeConnection)?.emailAddress}
          </p>
        </div>
      </div>

      <ConfirmModal
        open={showDiscardConfirm}
        title="Discard this draft?"
        message="Your message will be lost. This cannot be undone."
        confirmText="Discard"
        cancelText="Keep editing"
        variant="danger"
        onConfirm={() => { setShowDiscardConfirm(false); handleClose() }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </>
  )
}

export default ComposeEmail
