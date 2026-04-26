export default function DashboardLoading() {
  return (
    <div className="flex-1 p-6 space-y-6 animate-pulse">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 rounded-md bg-white/10" />
        <div className="h-9 w-32 rounded-md bg-white/10" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
            <div className="h-4 w-24 rounded bg-white/10" />
            <div className="h-8 w-16 rounded bg-white/10" />
            <div className="h-3 w-20 rounded bg-white/10" />
          </div>
        ))}
      </div>

      {/* Reliability gauge + failure distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <div className="h-4 w-36 rounded bg-white/10" />
          <div className="mx-auto h-36 w-36 rounded-full bg-white/10" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-white/10" />
            ))}
          </div>
        </div>

        <div className="xl:col-span-2 rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <div className="h-4 w-40 rounded bg-white/10" />
          <div className="space-y-2 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-20 rounded bg-white/10" />
                <div className="h-4 flex-1 rounded-full bg-white/10" />
                <div className="h-3 w-8 rounded bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent alerts */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <div className="h-4 w-28 rounded bg-white/10" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
              <div className="h-4 w-3/4 rounded bg-white/10" />
              <div className="h-3 w-1/2 rounded bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
