"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[500px] flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="flex size-20 items-center justify-center rounded-full bg-rose-500/10 mb-6">
        <AlertTriangle className="size-10 text-rose-600 dark:text-rose-400" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight mb-2">Something went wrong</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        {error.message || "An unexpected error occurred while loading this page. Please try again or check your connection."}
      </p>
      <div className="flex items-center gap-4">
        <Button onClick={() => reset()} className="gap-2">
          <RefreshCw className="size-4" />
          Try again
        </Button>
        <Button variant="outline" onClick={() => window.location.href = '/'}>
          Return to Overview
        </Button>
      </div>
    </div>
  );
}
