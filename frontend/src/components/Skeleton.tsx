function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-zinc-800/60 ${className}`} />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <Skeleton className="w-9 h-9 rounded-lg" />
      <Skeleton className="w-16 h-7 mt-3" />
      <Skeleton className="w-24 h-3.5 mt-2" />
    </div>
  )
}

export function EmailListSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/60 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-5 py-4 flex items-start gap-4">
          <Skeleton className="w-9 h-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="w-32 h-4" />
              <Skeleton className="w-16 h-3" />
            </div>
            <Skeleton className="w-3/4 h-4" />
            <Skeleton className="w-1/2 h-3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CommitmentListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 flex items-start gap-4">
          <Skeleton className="w-5 h-5 rounded-full shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="w-3/4 h-4" />
            <div className="flex gap-3">
              <Skeleton className="w-14 h-5 rounded-md" />
              <Skeleton className="w-20 h-4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <Skeleton className="w-40 h-8" />
        <Skeleton className="w-64 h-4 mt-2" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="flex gap-3">
        <Skeleton className="w-36 h-10 rounded-lg" />
        <Skeleton className="w-48 h-10 rounded-lg" />
      </div>
      <CommitmentListSkeleton />
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <Skeleton className="w-32 h-8" />
        <Skeleton className="w-56 h-4 mt-2" />
      </div>
      <div className="space-y-4">
        <Skeleton className="w-40 h-4" />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
              <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="w-48 h-4" />
                <Skeleton className="w-32 h-3" />
              </div>
              <Skeleton className="w-16 h-6 rounded-md" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="w-28 h-4" />
        <div className="grid sm:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="w-32 h-4" />
                <Skeleton className="w-24 h-3" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="w-36 h-4" />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800">
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="w-7 h-7 rounded" />
              ))}
            </div>
          </div>
          <Skeleton className="w-full h-[120px] rounded-none" />
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <Skeleton className="w-64 h-3" />
            <Skeleton className="w-16 h-7 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function EmailsPageSkeleton() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Skeleton className="w-32 h-8" />
          <Skeleton className="w-24 h-4 mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="w-16 h-10 rounded-lg" />
          <Skeleton className="w-24 h-10 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="w-20 h-8 rounded-lg shrink-0" />
        ))}
      </div>
      <Skeleton className="w-full h-10 rounded-lg" />
      <EmailListSkeleton />
    </div>
  )
}

export function CommitmentsPageSkeleton() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Skeleton className="w-40 h-8" />
          <Skeleton className="w-28 h-4 mt-2" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="w-28 h-10 rounded-lg" />
          <Skeleton className="w-32 h-10 rounded-lg" />
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Skeleton className="flex-1 h-10 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="w-28 h-10 rounded-lg" />
          <Skeleton className="w-28 h-10 rounded-lg" />
        </div>
      </div>
      <CommitmentListSkeleton />
    </div>
  )
}

export default Skeleton
