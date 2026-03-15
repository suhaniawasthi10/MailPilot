import { useState } from 'react'
import { Plus, X, Send, Loader2, Minus, Maximize2, Minimize2, Sparkles } from 'lucide-react'
import api from '../lib/api'
import { useToast } from './Toast'
import { useConnections } from '../context/ConnectionContext'

function ComposeEmail() {
  const { toast } = useToast()
  const { connections, activeConnection } = useConnections()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)

  const handleSend = async () => {
    if (!to.trim() || !body.trim() || sending) return
    if (!activeConnection) {
      toast('No email account connected', 'error')
      return
    }
    setSending(true)
    try {
      await api.post('/api/emails/compose', {
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
        connectionId: activeConnection,
      })
      toast('Email sent!', 'success')
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
      setBody(data.text)
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
    setBody('')
    setAiPrompt('')
    setShowAiPrompt(false)
  }

  const handleDiscard = () => {
    if (to || subject || body) {
      if (!confirm('Discard this draft?')) return
    }
    handleClose()
  }

  if (connections.length === 0) return null

  // FAB button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 hover:shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
      >
        <Plus className="w-5 h-5" />
        Compose
      </button>
    )
  }

  // Minimized bar
  if (minimized) {
    return (
      <div className="fixed bottom-0 right-6 z-50 w-72 rounded-t-xl bg-zinc-900 border border-zinc-700 border-b-0 shadow-2xl">
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer"
          onClick={() => setMinimized(false)}
        >
          <span className="text-sm font-semibold text-zinc-100 truncate">
            {subject || 'New Message'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setMinimized(false) }}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDiscard() }}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const containerClass = maximized
    ? 'fixed inset-4 z-50 flex flex-col rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl'
    : 'fixed bottom-0 right-6 z-50 w-[520px] max-h-[600px] flex flex-col rounded-t-xl bg-zinc-900 border border-zinc-700 border-b-0 shadow-2xl'

  return (
    <>
      {/* Backdrop for maximized */}
      {maximized && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setMaximized(false)} />
      )}

      <div className={containerClass}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h3 className="text-sm font-semibold text-zinc-100">New Message</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMinimized(true)}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setMaximized(!maximized)}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleDiscard}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* To */}
        <div className="flex items-center border-b border-zinc-800/60 px-4">
          <span className="text-xs text-zinc-500 mr-2 shrink-0">To</span>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 py-2.5 focus:outline-none"
          />
        </div>

        {/* Subject */}
        <div className="flex items-center border-b border-zinc-800/60 px-4">
          <span className="text-xs text-zinc-500 mr-2 shrink-0">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 py-2.5 focus:outline-none"
          />
        </div>

        {/* Body */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message..."
          className={`flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 px-4 py-3 focus:outline-none resize-none ${
            maximized ? '' : 'min-h-[200px]'
          }`}
        />

        {/* AI Prompt Input */}
        {showAiPrompt && (
          <div className="flex gap-2 px-4 py-2 border-t border-zinc-800/60">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && aiPrompt.trim()) handleAiGenerate()
              }}
              placeholder='e.g. "Follow up on project deadline" or "Thank them for the meeting"'
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            <button
              onClick={handleAiGenerate}
              disabled={!aiPrompt.trim() || generatingAi}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              {generatingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {generatingAi ? 'Writing...' : 'Generate'}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSend}
              disabled={sending || !to.trim() || !body.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={() => setShowAiPrompt(!showAiPrompt)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                showAiPrompt
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Write with AI
            </button>
          </div>
          <p className="text-[11px] text-zinc-600 truncate ml-3">
            Sending as {connections.find(c => c._id === activeConnection)?.emailAddress}
          </p>
        </div>
      </div>
    </>
  )
}

export default ComposeEmail
