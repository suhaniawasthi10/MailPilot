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
import Button from '../components/ui/Button'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnection, page])

  async function fetchCommitments() {
    setLoadingData(true)
    try {
      const { data } = await api.get(`/api/commitments?connectionId=${activeConnection}&page=${page}&limit=20`)
      setCommitments(data.commitments)
      setTotalPages(data.pagination.pages)
      setTotalCommitments(data.pagination.total)
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
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
        <ListChecks className="w-9 h-9 text-ink-muted" strokeWidth={1.5} />
        <p className="text-sm text-ink-soft">No email accounts connected yet.</p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
        <div>
          <p className="eyebrow">What's owed</p>
          <h1 className="display text-4xl text-ink mt-1 leading-tight">Commitments.</h1>
          <p className="text-sm text-ink-soft mt-2 tabular">
            <span className="text-ink font-medium">{totalCommitments}</span>{' '}
            {totalCommitments === 1 ? 'commitment' : 'commitments'} extracted from your inbox
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            onClick={handleExtract}
            disabled={extracting}
            leftIcon={extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          >
            {extracting ? 'Extracting' : 'Extract'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleCheckOverdue}
            disabled={checkingOverdue}
            leftIcon={
              checkingOverdue ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )
            }
          >
            Check overdue
          </Button>
        </div>
      </div>

      {/* Filters — minimal, no card wrapper */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search commitments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              w-full h-10 pl-9 pr-9
              bg-paper border border-rule rounded-md
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
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="
              h-10 px-3 bg-paper border border-rule rounded-md
              text-sm text-ink-soft focus:outline-none focus:border-ink/40 cursor-pointer
            "
          >
            <option value="all">All status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as FilterPriority)}
            className="
              h-10 px-3 bg-paper border border-rule rounded-md
              text-sm text-ink-soft focus:outline-none focus:border-ink/40 cursor-pointer
            "
          >
            <option value="all">All priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* List — flat rows with hairline dividers, no cards */}
      {filtered.length === 0 ? (
        <div className="border border-rule rounded-md bg-cream-soft p-12 text-center">
          <ListChecks className="w-7 h-7 text-ink-muted mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-ink-soft">
            {commitments.length === 0
              ? 'No commitments yet. Sync emails, then extract.'
              : 'No commitments match your filters.'}
          </p>
        </div>
      ) : (
        <div className="border-t border-rule">
          {filtered.map((c, i) => {
            const email = typeof c.emailId === 'object' ? (c.emailId as Email) : null
            const overdue = isOverdue(c)

            return (
              <div
                key={c._id}
                className={`
                  group flex items-start gap-4 border-b border-rule px-2 py-5
                  transition-colors animate-fade-in-up
                  ${overdue ? 'bg-danger-soft/40' : 'hover:bg-cream-soft'}
                `}
                style={{ animationDelay: `${i * 25}ms`, animationFillMode: 'both' }}
              >
                <button
                  onClick={() => handleToggleStatus(c._id, c.status)}
                  className="mt-0.5 shrink-0 cursor-pointer"
                  aria-label={c.status === 'completed' ? 'Mark pending' : 'Mark complete'}
                >
                  {c.status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-success" strokeWidth={1.75} />
                  ) : (
                    <Circle className="w-5 h-5 text-ink-muted hover:text-success transition-colors" strokeWidth={1.5} />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm leading-snug ${
                      c.status === 'completed'
                        ? 'text-ink-muted line-through'
                        : 'text-ink'
                    }`}
                  >
                    {c.summary}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-xs">
                    <PriorityBadge priority={c.priority} />
                    {c.deadline && (
                      <span
                        className={`flex items-center gap-1 tabular ${
                          overdue ? 'text-danger font-medium' : 'text-ink-muted'
                        }`}
                      >
                        {overdue ? (
                          <AlertTriangle className="w-3 h-3" strokeWidth={2} />
                        ) : (
                          <Clock className="w-3 h-3" strokeWidth={1.75} />
                        )}
                        {formatDate(c.deadline)}
                      </span>
                    )}
                    {c.replyRequired && (
                      <span className="flex items-center gap-1 text-accent-ink">
                        <Reply className="w-3 h-3" strokeWidth={1.75} /> Reply needed
                      </span>
                    )}
                    {email && (
                      <span className="text-ink-muted truncate max-w-[280px] italic">
                        from “{email.subject}”
                      </span>
                    )}
                  </div>
                </div>

                {c.deadline && c.status === 'pending' && (
                  <button
                    onClick={() => handleAddToCalendar(c._id)}
                    disabled={addingToCalendar === c._id}
                    className="
                      shrink-0 p-2 rounded-md text-ink-muted
                      hover:text-ink hover:bg-cream-deep
                      transition-colors cursor-pointer disabled:opacity-50
                      opacity-0 group-hover:opacity-100
                    "
                    title="Add to calendar"
                  >
                    {addingToCalendar === c._id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : calendarSuccess === c._id ? (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    ) : (
                      <Calendar className="w-4 h-4" strokeWidth={1.75} />
                    )}
                  </button>
                )}
              </div>
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

export default Commitments
