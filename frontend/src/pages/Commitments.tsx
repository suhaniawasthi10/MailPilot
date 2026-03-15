import { useEffect, useState } from 'react'
import {
  ListChecks,
  Loader2,
  Brain,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Reply,
  Calendar,
  Filter,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useConnections } from '../context/ConnectionContext'
import { CommitmentsPageSkeleton } from '../components/Skeleton'
import { PriorityBadge } from '../components/PriorityBadge'
import { formatDate } from '../lib/formatDate'
import type { Commitment, Email } from '../types'

type FilterPriority = 'all' | 'high' | 'medium' | 'low'
type FilterStatus = 'all' | 'pending' | 'completed'

function Commitments() {
  const { toast } = useToast()
  const { connections, activeConnection, loading } = useConnections()
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [extracting, setExtracting] = useState(false)
  const [checkingOverdue, setCheckingOverdue] = useState(false)
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('all')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [addingToCalendar, setAddingToCalendar] = useState<string | null>(null)
  const [calendarSuccess, setCalendarSuccess] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCommitments, setTotalCommitments] = useState(0)
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!activeConnection) return
    fetchCommitments()
  }, [activeConnection, page])

  async function fetchCommitments() {
    setLoadingData(true)
    try {
      const { data } = await api.get(`/api/commitments?connectionId=${activeConnection}&page=${page}&limit=20`)
      setCommitments(data.commitments)
      setTotalPages(data.pagination.pages)
      setTotalCommitments(data.pagination.total)
    } catch (err) {
      toast('Failed to load commitments', 'error')
    } finally {
      setLoadingData(false)
    }
  }

  const handleExtract = async () => {
    if (!activeConnection || extracting) return
    setExtracting(true)
    try {
      const { data } = await api.post('/api/commitments/extract', { connectionId: activeConnection })
      toast(data.message || 'Commitments extracted', 'success')
      setPage(1)
      await fetchCommitments()
    } catch (err) {
      toast('Failed to extract commitments', 'error')
    } finally {
      setExtracting(false)
    }
  }

  const handleCheckOverdue = async () => {
    if (!activeConnection || checkingOverdue) return
    setCheckingOverdue(true)
    try {
      const { data } = await api.post('/api/commitments/check-overdue', { connectionId: activeConnection })
      if (data.overdue?.length > 0) {
        toast(`${data.overdue.length} reminder draft(s) created`, 'warning')
      } else {
        toast('No overdue commitments found', 'info')
      }
    } catch (err) {
      toast('Failed to check overdue', 'error')
    } finally {
      setCheckingOverdue(false)
    }
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'pending' ? 'completed' : 'pending'
    try {
      await api.patch(`/api/commitments/${id}`, { status: newStatus })
      setCommitments((prev) =>
        prev.map((c) => (c._id === id ? { ...c, status: newStatus as 'pending' | 'completed' } : c)),
      )
      toast(newStatus === 'completed' ? 'Marked as complete' : 'Marked as pending', 'success')
    } catch (err) {
      toast('Failed to update commitment', 'error')
    }
  }

  const handleAddToCalendar = async (id: string) => {
    setAddingToCalendar(id)
    try {
      await api.post(`/api/commitments/${id}/calendar`)
      setCalendarSuccess(id)
      toast('Added to calendar', 'success')
      setTimeout(() => setCalendarSuccess(null), 3000)
    } catch (err) {
      toast('Failed to add to calendar', 'error')
    } finally {
      setAddingToCalendar(null)
    }
  }

  const filtered = commitments.filter((c) => {
    if (filterPriority !== 'all' && c.priority !== filterPriority) return false
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      const emailSubject = typeof c.emailId === 'object' ? (c.emailId as Email).subject : ''
      return c.summary.toLowerCase().includes(q) || emailSubject?.toLowerCase().includes(q)
    }
    return true
  })

  const isOverdue = (c: Commitment) =>
    c.status === 'pending' && c.deadline && new Date(c.deadline) < new Date()

  if (loading || (loadingData && commitments.length === 0)) {
    return <CommitmentsPageSkeleton />
  }

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 px-4">
        <ListChecks className="w-10 h-10 text-zinc-600" />
        <p className="text-zinc-500">No email accounts connected yet.</p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Commitments</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {totalCommitments} commitment{totalCommitments !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {extracting ? 'Extracting...' : 'Extract'}
          </button>
          <button
            onClick={handleCheckOverdue}
            disabled={checkingOverdue}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {checkingOverdue ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            Check Overdue
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search commitments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="bg-transparent text-sm text-zinc-300 py-2.5 focus:outline-none cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as FilterPriority)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
          <ListChecks className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            {commitments.length === 0
              ? 'No commitments yet. Sync emails then extract commitments.'
              : 'No commitments match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c, i) => {
            const email = typeof c.emailId === 'object' ? (c.emailId as Email) : null
            const overdue = isOverdue(c)

            return (
              <div
                key={c._id}
                className={`rounded-xl border bg-zinc-900/40 p-5 transition-colors animate-fade-in-up ${
                  overdue ? 'border-red-500/30 bg-red-500/5' : 'border-zinc-800'
                }`}
                style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}
              >
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => handleToggleStatus(c._id, c.status)}
                    className="mt-0.5 shrink-0 cursor-pointer"
                  >
                    {c.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <Circle className="w-5 h-5 text-zinc-600 hover:text-green-500 transition-colors" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${c.status === 'completed' ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                      {c.summary}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <PriorityBadge priority={c.priority} />
                      {c.deadline && (
                        <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-400' : 'text-zinc-500'}`}>
                          {overdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {formatDate(c.deadline)}
                        </span>
                      )}
                      {c.replyRequired && (
                        <span className="flex items-center gap-1 text-xs text-purple-400">
                          <Reply className="w-3 h-3" /> Reply needed
                        </span>
                      )}
                      {email && (
                        <span className="text-xs text-zinc-600 truncate max-w-[200px]">
                          from: {email.subject}
                        </span>
                      )}
                    </div>
                  </div>

                  {c.deadline && c.status === 'pending' && (
                    <button
                      onClick={() => handleAddToCalendar(c._id)}
                      disabled={addingToCalendar === c._id}
                      className="shrink-0 p-2 rounded-lg text-zinc-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer disabled:opacity-50"
                      title="Add to calendar"
                    >
                      {addingToCalendar === c._id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : calendarSuccess === c._id ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Calendar className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
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

export default Commitments
