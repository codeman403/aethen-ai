export function Header() {
  return (
    <header className="h-14 border-b flex items-center justify-between px-6">
      <div className="text-sm text-muted-foreground">
        AI Agent Failure Intelligence
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground">v0.1.0</span>
      </div>
    </header>
  );
}
