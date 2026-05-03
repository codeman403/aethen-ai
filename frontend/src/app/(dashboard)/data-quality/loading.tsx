export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 w-72 rounded-xl bg-white/10" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-32 rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
          <div className="h-5 w-48 rounded bg-white/10" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-white/10" />
            <div className="h-4 w-2/3 rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
