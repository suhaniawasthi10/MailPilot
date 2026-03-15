import { useEffect, useState } from 'react'
import {
  Mail,
  ListChecks,
  AlertTriangle,
  Reply,
  RefreshCw,
  Brain,
  Clock,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Circle,
  ArrowUpRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useConnections } from '../context/ConnectionContext'
import { useSocket } from '../context/SocketContext'
import { DashboardSkeleton } from '../components/Skeleton'
import { PriorityBadge } from '../components/PriorityBadge'
import { formatDate } from '../lib/formatDate'
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
  const [stats, setStats] = useState<Stats>({ totalEmails: 0, pendingCommitments: 0, overdueCount: 0, replyNeeded: 0 })
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
      } catch (err) {
        toast('Failed to load dashboard data', 'error')
      } finally {
        setLoadingData(false)
      }
    }
    fetchData()
  }, [activeConnection])

  // Listen for real-time new emails via WebSocket
  useEffect(() => {
    if (!socket) return

    const handleNewEmail = () => {
      // Increment email count when a new email arrives via webhook
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
    } catch (err) {
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
    } catch (err) {
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
        pendingCommitments: prev.pendingCommitments - 1,
      }))
      toast('Marked as complete', 'success')
    } catch (err) {
      toast('Failed to update commitment', 'error')
    }
  }

  if (loading || loadingData) {
    return <DashboardSkeleton />
  }

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 px-4">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <Mail className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">No email accounts connected</h2>
        <p className="text-zinc-500 text-center max-w-sm">
          Connect your Gmail or Outlook account to start tracking commitments.
        </p>
        <button
          onClick={() => navigate('/settings')}
          className="mt-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors cursor-pointer"
        >
          Connect Account
        </button>
      </div>
    )
  }

  const overdueCommitments = commitments.filter(
    (c) => c.status === 'pending' && c.deadline && new Date(c.deadline) < new Date(),
  )
  const recentCommitments = commitments.slice(0, 8)

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">Overview of your email commitments</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Mail} label="Synced Emails" value={stats.totalEmails} color="indigo" />
        <StatCard icon={ListChecks} label="Pending" value={stats.pendingCommitments} color="amber" />
        <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdueCount} color="red" />
        <StatCard icon={Reply} label="Needs Reply" value={stats.replyNeeded} color="purple" />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <ActionButton
          icon={syncing ? Loader2 : RefreshCw}
          label={syncing ? 'Syncing...' : 'Sync Emails'}
          onClick={handleSync}
          disabled={syncing}
          spinning={syncing}
        />
        <ActionButton
          icon={extracting ? Loader2 : Brain}
          label={extracting ? 'Extracting...' : 'Extract Commitments'}
          onClick={handleExtract}
          disabled={extracting}
          spinning={extracting}
        />
      </div>

      {/* Overdue alerts */}
      {overdueCommitments.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-4.5 h-4.5" />
            <h3 className="font-semibold text-sm">Overdue Commitments</h3>
          </div>
          <div className="space-y-2">
            {overdueCommitments.map((c) => (
              <div
                key={c._id}
                className="flex items-center justify-between bg-zinc-900/60 rounded-lg px-4 py-3 border border-zinc-800/50"
              >
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{c.summary}</p>
                  <p className="text-xs text-red-400/80 mt-0.5">
                    Due {formatDate(c.deadline!)}
                  </p>
                </div>
                <button
                  onClick={() => handleMarkComplete(c._id)}
                  className="text-xs text-zinc-500 hover:text-green-400 transition-colors shrink-0 ml-4 cursor-pointer"
                >
                  Mark done
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent commitments */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Recent Commitments</h2>
          {commitments.length > 0 && (
            <button
              onClick={() => navigate('/commitments')}
              className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              View all <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {recentCommitments.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
            <ListChecks className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">
              No commitments yet. Sync your emails and extract commitments to get started.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Summary</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3 hidden md:table-cell">Priority</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3 hidden sm:table-cell">Deadline</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {recentCommitments.map((c) => (
                  <tr key={c._id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-5 py-3.5">
                      {c.status === 'completed' ? (
                        <CheckCircle2 className="w-4.5 h-4.5 text-green-500" />
                      ) : (
                        <button onClick={() => handleMarkComplete(c._id)} className="cursor-pointer">
                          <Circle className="w-4.5 h-4.5 text-zinc-600 hover:text-green-500 transition-colors" />
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className={`text-sm ${c.status === 'completed' ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                        {c.summary}
                      </p>
                      {c.replyRequired && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-purple-400 mt-1">
                          <Reply className="w-3 h-3" /> Reply needed
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      {c.deadline ? (
                        <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(c.deadline)}
                        </span>
                      ) : (
                        <span className="text-sm text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => navigate('/commitments')}
                        className="text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: 'indigo' | 'amber' | 'red' | 'purple' }) {
  const colors = {
    indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    red: 'bg-red-500/10 border-red-500/20 text-red-400',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 animate-fade-in-up">
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <p className="text-2xl font-bold text-zinc-100 mt-3">{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </div>
  )
}

function ActionButton({ icon: Icon, label, onClick, disabled, spinning }: { icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean; spinning?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
    >
      <Icon className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} />
      {label}
    </button>
  )
}

export default Dashboard
