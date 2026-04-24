import { Search, Bell, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="h-16 border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between px-8">
      <div className="flex items-center gap-4">
        <div className="text-sm font-medium text-muted-foreground/80 flex items-center gap-2">
          <span>Agent Reliability Studio</span>
          <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-semibold text-muted-foreground border">
            v0.1.0
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="relative hidden md:flex items-center">
          <Search className="absolute left-3 size-4 text-muted-foreground/70" />
          <input
            type="text"
            placeholder="Search traces... (Cmd+K)"
            className="h-9 w-72 rounded-full border border-input bg-muted/40 pl-9 pr-4 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-background"
          />
        </div>
        <div className="flex items-center gap-1 ml-2 border-l pl-4 py-1">
          <Button variant="ghost" size="icon" className="size-9 rounded-full text-muted-foreground hover:text-foreground">
            <Bell className="size-[18px]" />
          </Button>
          <Button variant="ghost" size="icon" className="size-9 rounded-full text-muted-foreground hover:text-foreground">
            <Settings className="size-[18px]" />
          </Button>
        </div>
      </div>
    </header>
  );
}
