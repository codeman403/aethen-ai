import glob

def fix_page(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Hide the timeline/summary/findings blocks when NO report exists, OR show a big loading state
    # All pages have a block that starts with `<div className="grid gap-6 grid-cols-1">`
    # We want to replace the content of that block so it only shows if `report` is present or `isLoading` is true.

    if '<div className="grid gap-6 grid-cols-1">' in content:
        # we know the right column starts with:
        #         {/* Right Column: Results */}
        #         <div className="xl:col-span-8 space-y-6">
        #           {!selectedSession ? (
        # ...
        #           ) : (
        #             <>
        #               <SessionContext session={selectedSession} />
        #
        #               <div className="grid gap-6 grid-cols-1">
        
        # We want to wrap the content inside the `grid gap-6 grid-cols-1` with `{isLoading ? ( <BigLoader /> ) : report ? ( <ActualContent /> ) : null}`
        # But some pages have placeholders when `!report`. Let's just rip out the placeholders and replace them with `null`.
        pass
        
    # Easiest way: just replace the `isLoading &&` block at the top with a full-page overlay over the right panel,
    # OR replace the placeholders in the JSX.
    
    # Let's replace the `isLoading` block in `handleSelectSession` to use a global state overlay.
    # Actually, a simple CSS overlay is easiest.
    
    if '{/* Right Column: Results */}' in content:
        content = content.replace(
            '<div className="xl:col-span-8 space-y-6">',
            '<div className="xl:col-span-8 space-y-6 relative">'
        )
        content = content.replace(
            '<SessionContext session={selectedSession} />',
            '<SessionContext session={selectedSession} />\n' +
            '              {isLoading && (\n' +
            '                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl border border-border/50">\n' +
            '                  <Loader2 className="size-10 animate-spin text-primary mb-4" />\n' +
            '                  <h3 className="text-xl font-bold">Analyzing Trace Data</h3>\n' +
            '                  <p className="text-foreground/70 text-sm mt-2">Running LangGraph heuristics and vector similarity checks...</p>\n' +
            '                </div>\n' +
            '              )}'
        )

    # 2. Hide the placeholders. E.g., in Memory Debug:
    content = content.replace(
        '''                <div className="relative border-l border-muted ml-3 space-y-8 pb-4">
                  <div className="relative pl-8">
                    <div className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-muted ring-4 ring-card" />
                    <p className="text-sm text-foreground/80">
                      Enter a session ID above and click Analyze to see retrieval
                      event diagnostics.
                    </p>
                  </div>
                </div>''', 
        'null'
    )
    
    content = content.replace(
        '''              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border">
                  <FileSearch className="size-5 text-foreground/80 mt-0.5" />
                  <p className="text-sm text-foreground/80">
                    Analysis findings will appear here after you run a session
                    diagnostic.
                  </p>
                </div>
              </div>''',
        'null'
    )
    
    content = content.replace(
        '''              <ul className="space-y-3">
                {[
                  "Implement circuit breaker for failing tools.",
                  "Add per-tool timeout budgets.",
                  "Define fallback behavior when tools are degraded.",
                ].map((rec) => (
                  <li
                    key={rec}
                    className="flex items-start gap-2 text-base text-foreground/80 opacity-40"
                  >
                    <div className="size-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>''',
        'null'
    )
    
    content = content.replace(
        '''              [1, 2, 3].map((attempt) => (
                <div
                  key={attempt}
                  className="rounded-lg border border-muted bg-muted/5 shadow-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/10 border-b">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold bg-background/50 border text-foreground/80 rounded-md px-1.5 py-0.5">
                        #{attempt}
                      </span>
                      <span className="font-mono text-base text-foreground/80">
                        — awaiting analysis
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="size-3.5 text-foreground/80" />
                      <span className="text-sm text-foreground/80">—</span>
                    </div>
                  </div>
                  <div className="px-4 py-3 text-base flex items-start gap-2">
                    <AlertOctagon className="size-4 text-foreground/80 mt-0.5 shrink-0" />
                    <p className="text-foreground/80 text-sm">Run an analysis to see tool call details.</p>
                  </div>
                </div>
              ))''',
        'null'
    )
    
    # Hide panels completely if report is null
    # Example: <div className="rounded-xl border bg-card shadow-sm overflow-hidden relative">
    # We will replace `<div className="grid gap-6 grid-cols-1">` with `<div className="grid gap-6 grid-cols-1">{report && (<>` and close it
    # Actually, it's easier to just let the report condition handle the panels
    if '{report && (' not in content:
        content = content.replace(
            '<div className="grid gap-6 grid-cols-1">',
            '<div className="grid gap-6 grid-cols-1">\n              {report && (\n                <>'
        )
        content = content.replace(
            '            </>\n          )}\n        </div>',
            '                </>\n              )}\n            </>\n          )}\n        </div>'
        )

    with open(filepath, 'w') as f:
        f.write(content)

for f in glob.glob('frontend/src/app/(dashboard)/**/page.tsx', recursive=True):
    if any(x in f for x in ['tool-misfire', 'memory-debug', 'blind-spots', 'hallucination-rca']):
        fix_page(f)

