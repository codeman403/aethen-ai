export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] animate-pulse">
      {/* Sessions sidebar */}
      <div className="w-64 border-r border-white/10 p-4 space-y-3 shrink-0">
        <div className="h-8 w-full rounded-md bg-white/10" />
        <div className="space-y-2 pt-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 w-full rounded-lg bg-white/10" />
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-col flex-1">
        {/* Messages */}
        <div className="flex-1 p-6 space-y-4 overflow-hidden">
          <div className="flex justify-end">
            <div className="h-10 w-48 rounded-2xl bg-white/10" />
          </div>
          <div className="flex justify-start">
            <div className="h-24 w-80 rounded-2xl bg-white/10" />
          </div>
          <div className="flex justify-end">
            <div className="h-10 w-64 rounded-2xl bg-white/10" />
          </div>
          <div className="flex justify-start">
            <div className="h-16 w-72 rounded-2xl bg-white/10" />
          </div>
        </div>

        {/* Input bar */}
        <div className="p-4 border-t border-white/10">
          <div className="h-12 w-full rounded-xl bg-white/10" />
        </div>
      </div>
    </div>
  );
}
