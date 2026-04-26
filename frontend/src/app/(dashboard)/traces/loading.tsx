export default function TracesLoading() {
  return (
    <div className="flex-1 p-6 space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 rounded-md bg-white/10" />
        <div className="flex gap-2">
          <div className="h-9 w-40 rounded-md bg-white/10" />
          <div className="h-9 w-32 rounded-md bg-white/10" />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-white/10" />
        ))}
      </div>

      {/* Session rows */}
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center gap-4"
          >
            <div className="h-5 w-24 rounded bg-white/10" />
            <div className="h-4 flex-1 rounded bg-white/10" />
            <div className="h-5 w-20 rounded-full bg-white/10" />
            <div className="h-4 w-16 rounded bg-white/10" />
            <div className="h-8 w-24 rounded-md bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
