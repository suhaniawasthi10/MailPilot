import { useEffect, useState } from 'react'
import {
  Mail,
  ListChecks,
  AlertTriangle,
  RefreshCw,
  Brain,
  Clock,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Circle,
  Reply,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useConnections } from '../context/ConnectionContext'
import { useSocket } from '../context/SocketContext'
import { DashboardSkeleton } from '../components/Skeleton'
import { PriorityBadge } from '../components/PriorityBadge'
import { formatDate } from '../lib/formatDate'
import Button from '../components/ui/Button'
import Stat from '../components/ui/Stat'
import type { Commitment } from '../types'

interface Stats {
  totalEmails: number
  pendingCommitments: number
  overdueCount: number
  replyNeeded: number
}

function Dashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { connections, activeConnection, loading } = useConnections()
  const socket = useSocket()
  const [stats, setStats] = useState<Stats>({
    totalEmails: 0,
    pendingCommitments: 0,
    overdueCount: 0,
    replyNeeded: 0,
  })
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [syncing, setSyncing] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!activeConnection) return

    async function fetchData() {
      setLoadingData(true)
      try {
        const [emailsRes, commitmentsRes] = await Promise.all([
          api.get(`/api/emails?connectionId=${activeConnection}&page=1&limit=1`),
          api.get(`/api/commitments?connectionId=${activeConnection}&page=1&limit=50`),
        ])

        const totalEmails = emailsRes.data.pagination.total
        const comms: Commitment[] = commitmentsRes.data.commitments
        const pending = comms.filter((c) => c.status === 'pending')

        setStats({
          totalEmails,
          pendingCommitments: pending.length,
          overdueCount: pending.filter((c) => c.deadline && new Date(c.deadline) < new Date()).length,
          replyNeeded: pending.filter((c) => c.replyRequired).length,
        })
        setCommitments(comms)
      } catch {
        toast('Failed to load dashboard data', 'error')
      } finally {
        setLoadingData(false)
      }
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnection])

  // Real-time email count via WebSocket
  useEffect(() => {
    if (!socket) return
    const handleNewEmail = () => {
      setStats((prev) => ({ ...prev, totalEmails: prev.totalEmails + 1 }))
    }
    socket.on('email:new', handleNewEmail)
    return () => { socket.off('email:new', handleNewEmail) }
  }, [socket])

  const handleSync = async () => {
    if (!activeConnection || syncing) return
    setSyncing(true)
    try {
      const { data } = await api.post('/api/emails/sync', { connectionId: activeConnection })
      toast(`Synced ${data.emails?.length || 0} emails`, 'success')
      const [emailsRes, commitmentsRes] = await Promise.all([
        api.get(`/api/emails?connectionId=${activeConnection}&page=1&limit=1`),
        api.get(`/api/commitments?connectionId=${activeConnection}&page=1&limit=50`),
      ])
      const totalEmails = emailsRes.data.pagination.total
      const comms: Commitment[] = commitmentsRes.data.commitments
      const pending = comms.filter((c) => c.status === 'pending')
      setStats({
        totalEmails,
        pendingCommitments: pending.length,
        overdueCount: pending.filter((c) => c.deadline && new Date(c.deadline) < new Date()).length,
        replyNeeded: pending.filter((c) => c.replyRequired).length,
      })
      setCommitments(comms)
    } catch {
      toast('Failed to sync emails', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleExtract = async () => {
    if (!activeConnection || extracting) return
    setExtracting(true)
    try {
      const { data: extractRes } = await api.post('/api/commitments/extract', { connectionId: activeConnection })
      toast(extractRes.message || 'Commitments extracted', 'success')
      const { data: commsRes } = await api.get(`/api/commitments?connectionId=${activeConnection}&page=1&limit=50`)
      const commsData: Commitment[] = commsRes.commitments
      const pending = commsData.filter((c) => c.status === 'pending')
      setStats((prev) => ({
        ...prev,
        pendingCommitments: pending.length,
        overdueCount: pending.filter((c) => c.deadline && new Date(c.deadline) < new Date()).length,
        replyNeeded: pending.filter((c) => c.replyRequired).length,
      }))
      setCommitments(commsData)
    } catch {
      toast('Failed to extract commitments', 'error')
    } finally {
      setExtracting(false)
    }
  }

  const handleMarkComplete = async (id: string) => {
    try {
      await api.patch(`/api/commitments/${id}`, { status: 'completed' })
      setCommitments((prev) =>
        prev.map((c) => (c._id === id ? { ...c, status: 'completed' as const } : c)),
      )
      setStats((prev) => ({
        ...prev,
        pendingCommitments: Math.max(0, prev.pendingCommitments - 1),
      }))
      toast('Marked as complete', 'success')
    } catch {
      toast('Failed to update commitment', 'error')
    }
  }

  if (loading || loadingData) {
    return <DashboardSkeleton />
  }

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 px-4 max-w-md mx-auto text-center">
        <div className="w-12 h-12 rounded-md bg-cream-soft border border-rule flex items-center justify-center">
          <Mail className="w-5 h-5 text-ink-soft" strokeWidth={1.5} />
        </div>
        <div className="space-y-2">
          <h2 className="display text-2xl text-ink">No accounts yet.</h2>
          <p className="text-sm text-ink-soft leading-relaxed">
            Connect your Gmail or Outlook account to begin tracking commitments.
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/settings')}>
          Connect an account
        </Button>
      </div>
    )
  }

  const overdueCommitments = commitments.filter(
    (c) => c.status === 'pending' && c.deadline && new Date(c.deadline) < new Date(),
  )
  const recentCommitments = commitments.slice(0, 8)

  // Date for greeting — gives the page a "morning paper" feel
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-12 animate-fade-in">
      {/* ===== Header — editorial, like a publication masthead ====== */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 border-b border-rule pb-8">
        <div>
          <p className="eyebrow">{today}</p>
          <h1 className="display text-5xl text-ink mt-1.5 leading-[0.95]">
            Today<span className="text-accent">.</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleSync}
            disabled={syncing}
            leftIcon={<RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />}
          >
            {syncing ? 'Syncing' : 'Sync inbox'}
          </Button>
          <Button
            variant="primary"
            onClick={handleExtract}
            disabled={extracting}
            leftIcon={extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          >
            {extracting ? 'Extracting' : 'Extract commitments'}
          </Button>
        </div>
      </div>

      {/* ===== Stats — giant editorial numbers, no boxes ============ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
        <Stat value={stats.totalEmails}        label="Synced emails" />
        <Stat value={stats.pendingCommitments} label="Pending" />
        <Stat
          value={stats.overdueCount}
          label="Overdue"
          accent={stats.overdueCount > 0}
        />
        <Stat value={stats.replyNeeded}        label="Reply needed" />
      </div>

      {/* ===== Overdue alerts — terracotta-warm panel ============== */}
      {overdueCommitments.length > 0 && (
        <section className="border-l-2 border-accent pl-5 py-1 space-y-3">
          <div className="flex items-center gap-2 text-accent-ink">
            <AlertTriangle className="w-4 h-4" strokeWidth={1.75} />
            <p className="eyebrow text-accent-ink">Overdue</p>
          </div>
          <ul className="space-y-1">
            {overdueCommitments.map((c) => (
              <li
                key={c._id}
                className="flex items-center justify-between gap-4 py-2 border-b border-rule last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{c.summary}</p>
                  <p className="text-xs text-accent-ink mt-0.5 tabular">
                    Due {formatDate(c.deadline!)}
                  </p>
                </div>
                <button
                  onClick={() => handleMarkComplete(c._id)}
                  className="text-xs text-ink-muted hover:text-success transition-colors shrink-0 cursor-pointer underline-offset-4 hover:underline"
                >
                  Mark done
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ===== Recent commitments — flat list, matches /commitments == */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">Recent commitments</h2>
          {commitments.length > 0 && (
            <button
              onClick={() => navigate('/commitments')}
              className="
                text-xs text-ink-soft hover:text-ink
                flex items-center gap-1 transition-colors cursor-pointer
                underline-offset-4 hover:underline
              "
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {recentCommitments.length === 0 ? (
          <div className="border border-rule rounded-md bg-cream-soft p-12 text-center">
            <ListChecks className="w-7 h-7 text-ink-muted mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-ink-soft">
              No commitments yet. Sync your emails, then extract.
            </p>
          </div>
        ) : (
          <div className="border-t border-rule">
            {recentCommitments.map((c) => (
              <div
                key={c._id}
                className="flex items-start gap-4 border-b border-rule px-2 py-4 hover:bg-cream-soft transition-colors group"
              >
                <button
                  onClick={() => c.status === 'pending' && handleMarkComplete(c._id)}
                  disabled={c.status === 'completed'}
                  className="mt-0.5 shrink-0 cursor-pointer disabled:cursor-default"
                  aria-label="Mark complete"
                >
                  {c.status === 'completed' ? (
                    <CheckCircle2 className="w-4.5 h-4.5 text-success" strokeWidth={1.75} />
                  ) : (
                    <Circle className="w-4.5 h-4.5 text-ink-muted hover:text-success transition-colors" strokeWidth={1.5} />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm ${
                      c.status === 'completed' ? 'text-ink-muted line-through' : 'text-ink'
                    }`}
                  >
                    {c.summary}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
                    <PriorityBadge priority={c.priority} />
                    {c.deadline && (
                      <span className="flex items-center gap-1 text-ink-muted tabular">
                        <Clock className="w-3 h-3" strokeWidth={1.75} />
                        {formatDate(c.deadline)}
                      </span>
                    )}
                    {c.replyRequired && (
                      <span className="flex items-center gap-1 text-accent-ink">
                        <Reply className="w-3 h-3" strokeWidth={1.75} /> Reply needed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Dashboard
