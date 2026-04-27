import os, re, glob

def fix_page(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find SessionsList
    sl_match = re.search(r'(<SessionsList[^>]+/>)', content)
    if not sl_match: return
    sl_code = sl_match.group(1)

    # Remove old isLoading block
    content = re.sub(r'\{\s*isLoading\s*&&\s*\([^)]*<Loader2[^>]*/>[^)]*\)\s*\}', '', content, flags=re.DOTALL)
    
    # Remove the max-w-2xl block entirely (which holds SessionsList and possibly SessionContext)
    content = re.sub(r'<div className="max-w-2xl">[\s\S]*?</div>\s*(?:\{selectedSession && <SessionContext session=\{selectedSession\} />\})?', '', content)
    content = re.sub(r'\{selectedSession && <SessionContext session=\{selectedSession\} />\}', '', content)

    # Find the start of the report block
    grid_start = '<div className="grid gap-6 lg:grid-cols-3">'
    if grid_start not in content:
        grid_start = '<div className="grid gap-6 grid-cols-1">'
        if grid_start not in content:
            grid_start = '<div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">' # Ignore Traces page for now
            if grid_start in content:
                # If it's traces, we skip it here and do it separately
                return
    
    if grid_start not in content:
        return

    parts = content.split(grid_start)
    pre_grid = parts[0]
    report_block_inner = parts[1]

    # Fix top container to be flex and take up screen height
    pre_grid = re.sub(r'<div className="space-y-8 animate-in fade-in duration-500">', '<div className="flex flex-col h-[calc(100vh-6rem)] animate-in fade-in duration-500 pb-4">', pre_grid)
    
    # Add a shrink-0 to the header so it doesn't compress
    pre_grid = pre_grid.replace('<div className="flex flex-col gap-1">', '<div className="flex flex-col gap-1 shrink-0 mb-4">')

    # Build new layout
    new_layout = f"""
      <div className="flex flex-1 gap-6 min-h-0">
        {{/* Left: Compact Sessions List */}}
        <div className="w-[300px] flex-shrink-0 flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="p-3 border-b bg-muted/10">
            <h3 className="font-semibold text-sm tracking-tight">Analyzed Sessions</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            {sl_code}
          </div>
        </div>

        {{/* Right: Results */}}
        <div className="flex-1 rounded-xl border bg-card/40 overflow-y-auto relative shadow-sm">
          {{isLoading && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl">
              <Loader2 className="size-10 animate-spin text-primary mb-4" />
              <h3 className="text-xl font-bold">Analyzing Session...</h3>
              <p className="text-foreground/60 text-sm mt-2">Diagnosing root causes and evaluating traces.</p>
            </div>
          )}}

          {{!selectedSession ? (
            <div className="flex flex-col items-center justify-center h-full text-foreground/50">
              <p>Select a session from the list to begin analysis.</p>
            </div>
          ) : (
            <div className="p-6 space-y-8">
              {grid_start}
              {report_block_inner}
    """

    # We need to inject the `<SessionContext />` at the bottom of the right panel.
    # Extract everything before the final return statement closure
    clean_content = re.sub(r'(\s*</div>)+\s*\);\s*\}', '', new_layout)
    
    final_content = clean_content + """
              </div>
              
              {/* Session Context Placed BELOW Results */}
              <div className="mt-8">
                <SessionContext session={selectedSession} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
"""
    with open(filepath, 'w') as f:
        f.write(pre_grid + final_content)

for file in glob.glob('frontend/src/app/(dashboard)/**/page.tsx', recursive=True):
    if any(x in file for x in ['tool-misfire', 'memory-debug', 'blind-spots', 'hallucination-rca']):
        fix_page(file)

