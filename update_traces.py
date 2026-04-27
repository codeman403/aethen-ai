import re
import glob

def fix_page(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. We want to remove the old <Loader2> inside the page, but we'll leave it if it's not present.
    # 2. Re-arrange right column: Put Results first, then Session Context
    
    # We will use regex to extract `<div className="grid gap-6 grid-cols-1">` block, and swap it with `<SessionContext />`
    
    if '<div className="grid gap-6 lg:grid-cols-3">' in content:
        # Tool Misfire, Blind Spots, Hallucination RCA, Memory Debug use this grid layout.
        pass
        
    # We'll just replace the entire right column structure via regex since they all follow the same pattern:
    #         {/* Right Column: Results */}
    #         <div className="xl:col-span-8 space-y-6">
    #           {selectedSession && <SessionContext session={selectedSession} />}
    #           <div className="grid gap-6 lg:grid-cols-3">...
    
    if '{selectedSession && <SessionContext session={selectedSession} />}' in content and '<div className="grid gap-6 lg:grid-cols-3">' in content:
        
        # Split at `{selectedSession && <SessionContext session={selectedSession} />}`
        parts = content.split('{selectedSession && <SessionContext session={selectedSession} />}')
        
        pre = parts[0]
        post = parts[1]
        
        # In post, we have `<div className="grid gap-6 lg:grid-cols-3">` and at the end we have `</div>\n    </div>\n  );\n}`
        # Let's extract the grid and put it BEFORE the SessionContext
        
        # We find the end of the post block by looking for the last `</div>\n    </div>\n  );\n}` sequence
        idx = post.rfind('    </div>\n  );\n}')
        
        if idx != -1:
            grid_content = post[:idx]
            closing_tags = post[idx:]
            
            # The new structure:
            new_right_col = '''
          {isLoading && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl border border-border/50">
              <Loader2 className="size-10 animate-spin text-primary mb-4" />
              <h3 className="text-xl font-bold">Analyzing Trace Data</h3>
              <p className="text-foreground/70 text-sm mt-2">Running LangGraph heuristics and vector similarity checks...</p>
            </div>
          )}

          {!selectedSession ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center border border-dashed rounded-xl bg-muted/5 p-8">
              <div className="p-4 bg-muted/20 rounded-full mb-4">
                <FileSearch className="size-8 text-foreground/50" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Select a session to begin analysis</h3>
              <p className="text-base text-foreground/70 max-w-md">
                Choose a trace from the left panel to view its full context, execution timeline, and Aethen diagnostic results.
              </p>
            </div>
          ) : (
            <>
              {report && (
''' + grid_content + '''
              )}
              <SessionContext session={selectedSession} />
            </>
          )}
'''
            
            # Now we need to remove the empty state placeholders from grid_content
            # To do that easily, we just use regex on the new_right_col
            new_right_col = re.sub(
                r'\{\s*isLoading\s*&&\s*\(\s*<div[^>]*>\s*<Loader2[^>]*/>[^<]*</div>\s*\)\s*\}', 
                '', 
                new_right_col
            )
            
            final_content = pre + new_right_col + closing_tags
            
            # Upgrade text colors globally
            final_content = final_content.replace('text-muted-foreground', 'text-foreground/80')
            final_content = final_content.replace('text-sm', 'text-base')
            final_content = final_content.replace('text-xs', 'text-sm')
            
            # Ensure FileSearch is imported
            if 'FileSearch' not in final_content[:500]:
                final_content = final_content.replace('import {', 'import {\n  FileSearch,', 1)
                
            with open(filepath, 'w') as f:
                f.write(final_content)
            print(f"Updated {filepath}")

for f in glob.glob('frontend/src/app/(dashboard)/**/page.tsx', recursive=True):
    if any(x in f for x in ['tool-misfire', 'memory-debug', 'blind-spots', 'hallucination-rca']):
        fix_page(f)

