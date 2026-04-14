// Skeleton loaders — cream theme. Subtle pulse, hairline borders.
// All container shapes mirror the real component layout for stable transitions.

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-cream-deep ${className}`} />
}

export function StatCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="w-20 h-12" />
      <Skeleton className="w-24 h-3" />
    </div>
  )
}

export function EmailListSkeleton() {
  return (
    <div className="border-t border-rule">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-5 py-4 flex items-start gap-4 border-b border-rule">
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
    <div className="border-t border-rule">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="border-b border-rule px-5 py-5 flex items-start gap-4">
          <Skeleton className="w-5 h-5 rounded-full shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="w-3/4 h-4" />
            <div className="flex gap-3">
              <Skeleton className="w-14 h-5" />
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
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-10">
      <div>
        <Skeleton className="w-40 h-8" />
        <Skeleton className="w-64 h-4 mt-2" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="flex gap-3">
        <Skeleton className="w-36 h-9" />
        <Skeleton className="w-48 h-9" />
      </div>
      <CommitmentListSkeleton />
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto space-y-10">
      <div>
        <Skeleton className="w-32 h-8" />
        <Skeleton className="w-56 h-4 mt-2" />
      </div>
      <div className="space-y-4">
        <Skeleton className="w-40 h-3" />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border border-rule px-5 py-4 rounded-md">
              <Skeleton className="w-10 h-10 rounded-md shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="w-48 h-4" />
                <Skeleton className="w-32 h-3" />
              </div>
              <Skeleton className="w-20 h-7" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="w-36 h-3" />
        <div className="border border-rule rounded-md overflow-hidden">
          <div className="px-3 py-2 border-b border-rule">
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="w-7 h-7" />
              ))}
            </div>
          </div>
          <Skeleton className="w-full h-[120px] rounded-none" />
          <div className="flex items-center justify-between px-4 py-3 border-t border-rule">
            <Skeleton className="w-64 h-3" />
            <Skeleton className="w-16 h-7" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function EmailsPageSkeleton() {
  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Skeleton className="w-32 h-8" />
          <Skeleton className="w-24 h-4 mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="w-16 h-9" />
          <Skeleton className="w-24 h-9" />
        </div>
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="w-20 h-7 shrink-0" />
        ))}
      </div>
      <Skeleton className="w-full h-10" />
      <EmailListSkeleton />
    </div>
  )
}

export function CommitmentsPageSkeleton() {
  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Skeleton className="w-40 h-8" />
          <Skeleton className="w-28 h-4 mt-2" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="w-28 h-9" />
          <Skeleton className="w-32 h-9" />
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Skeleton className="flex-1 h-10" />
        <div className="flex gap-2">
          <Skeleton className="w-28 h-9" />
          <Skeleton className="w-28 h-9" />
        </div>
      </div>
      <CommitmentListSkeleton />
    </div>
  )
}

export default Skeleton
