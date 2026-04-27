import glob
import re

def fix_page(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # We want to add an explicit loading overlay to the right column.
    # The right column always has `<div className="xl:col-span-8 space-y-6">`
    # Let's change that to `<div className="xl:col-span-8 space-y-6 relative">`
    content = content.replace(
        '<div className="xl:col-span-8 space-y-6">',
        '<div className="xl:col-span-8 space-y-6 relative">'
    )

    # And inject the Loading Overlay right after it
    loading_overlay = '''
          {isLoading && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/60 backdrop-blur-md rounded-2xl border shadow-2xl">
              <div className="p-5 bg-card rounded-2xl shadow-xl flex flex-col items-center gap-4">
                <Loader2 className="size-10 animate-spin text-primary" />
                <div className="text-center">
                  <h3 className="text-xl font-bold">Analyzing Trace Data</h3>
                  <p className="text-foreground/70 text-sm mt-1">Running LangGraph heuristics and vector similarity checks...</p>
                </div>
              </div>
            </div>
          )}
    '''
    content = content.replace(
        '<div className="xl:col-span-8 space-y-6 relative">\n          {!selectedSession ? (',
        '<div className="xl:col-span-8 space-y-6 relative">' + loading_overlay + '\n          {!selectedSession ? ('
    )

    # Now, hide the specific right-hand panels if `report` is missing but a session IS selected.
    # We will do this by finding `<div className="grid gap-6 grid-cols-1">` and wrapping its contents.
    # Wait, `report` condition is already partially there in some places (like `{report ? ... : ...}`).
    # Let's just wrap the entire grid with `{report && (` to hide everything until analysis is complete.
    
    if '<div className="grid gap-6 grid-cols-1">' in content:
        content = content.replace(
            '<div className="grid gap-6 grid-cols-1">',
            '{report && (\n          <div className="grid gap-6 grid-cols-1">'
        )
        
        # We need to close it. The easiest way is to close it before the `</>` of the selectedSession block.
        # Find the last `</>`
        idx = content.rfind('</>\n          )}')
        if idx != -1:
            content = content[:idx] + '          )}\n            ' + content[idx:]

    with open(filepath, 'w') as f:
        f.write(content)

for f in glob.glob('frontend/src/app/(dashboard)/**/page.tsx', recursive=True):
    if any(x in f for x in ['tool-misfire', 'memory-debug', 'blind-spots', 'hallucination-rca']):
        fix_page(f)

