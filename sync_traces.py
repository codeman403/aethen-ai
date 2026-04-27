import re

filepath = 'frontend/src/app/(dashboard)/traces/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Fix Layout Wrappers to match master-detail grid
content = content.replace(
    '<div className="flex gap-6 h-[calc(100vh-5rem)] animate-in fade-in duration-500">',
    '<div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start animate-in fade-in duration-500">'
)

content = content.replace(
    '<div className="w-80 flex-shrink-0 flex flex-col rounded-xl border bg-card shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">',
    '<div className="xl:col-span-4 sticky top-6 z-10 flex flex-col rounded-xl border bg-card shadow-lg overflow-hidden h-[calc(100vh-140px)]">'
)

content = content.replace(
    '      {/* ── Right: Detail Panel ────────────────────────────────────────── */}\n      <div className="flex-1 overflow-auto">',
    '      {/* ── Right: Detail Panel ────────────────────────────────────────── */}\n      <div className="xl:col-span-8 space-y-6">'
)

# 2. Fix Empty State to match the other pages
old_empty_state = '''        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Eye className="size-8 opacity-40" />
            </div>
            <p className="font-medium text-foreground">Select a session to inspect</p>
            <p className="text-base mt-1">Choose a trace from the list to view its execution details</p>
          </div>
        ) : ('''

new_empty_state = '''        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center border border-dashed rounded-xl bg-muted/5 p-8">
            <div className="p-4 bg-muted/20 rounded-full mb-4">
              <Eye className="size-8 text-foreground/50" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Select a session to begin</h3>
            <p className="text-base text-foreground/70 max-w-md">
              Choose a trace from the left panel to view its full context, execution timeline, and run diagnostic analyses.
            </p>
          </div>
        ) : ('''

content = content.replace(old_empty_state, new_empty_state)

# 3. Add prominent Loading Overlay
content = content.replace(
    '          <div className="space-y-6">',
    '          <div className="space-y-6 relative">\n            {analysisLoading && (\n              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/60 backdrop-blur-md rounded-2xl border shadow-2xl">\n                <div className="p-5 bg-card rounded-2xl shadow-xl flex flex-col items-center gap-4">\n                  <Loader2 className="size-10 animate-spin text-primary" />\n                  <div className="text-center">\n                    <h3 className="text-xl font-bold">Analyzing Trace Data</h3>\n                    <p className="text-foreground/70 text-sm mt-1">Running LangGraph heuristics and vector similarity checks...</p>\n                  </div>\n                </div>\n              </div>\n            )}\n'
)

# 4. Remove text-muted-foreground and make fonts bigger globally
content = content.replace('text-muted-foreground', 'text-foreground/80')

with open(filepath, 'w') as f:
    f.write(content)

print(f"Updated {filepath}")
