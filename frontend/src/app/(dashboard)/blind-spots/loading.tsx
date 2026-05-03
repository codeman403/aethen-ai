export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-3">
        <div className="h-9 w-72 rounded-xl bg-white/10" />
        <div className="h-5 w-[34rem] rounded bg-white/10" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-4 rounded-2xl border border-white/10 bg-white/5 p-3 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white/5 border border-white/10" />
          ))}
        </div>

        <div className="xl:col-span-8 space-y-6">
          <div className="h-24 rounded-2xl bg-white/5 border border-white/10" />
          <div className="h-96 rounded-2xl bg-white/5 border border-white/10" />
          <div className="h-32 rounded-2xl bg-white/5 border border-white/10" />
        </div>
      </div>
    </div>
  );
}
