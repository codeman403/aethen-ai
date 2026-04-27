import glob
import re

def fix_page(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # We just want to move the `{selectedSession && <SessionContext...` block to the bottom of the right panel
    # We will look for `{selectedSession && <SessionContext` and remove it
    
    ctx_pattern = r'\{selectedSession && <SessionContext session=\{selectedSession\} />\}'
    
    if re.search(ctx_pattern, content):
        # Remove it from its original spot
        content = re.sub(ctx_pattern, '', content)
        
        # Add the Loading Overlay at the top of the right column
        content = content.replace(
            '<div className="xl:col-span-8 space-y-6">',
            '<div className="xl:col-span-8 space-y-6 relative">\n          {isLoading && (\n            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl border border-border/50">\n              <Loader2 className="size-10 animate-spin text-primary mb-4" />\n              <h3 className="text-xl font-bold">Analyzing Trace Data</h3>\n              <p className="text-foreground/70 text-sm mt-2">Running LangGraph heuristics and vector similarity checks...</p>\n            </div>\n          )}'
        )
        
        # We need to add the SessionContext back at the bottom of the right panel, which is right before the last set of closing </div>s
        # The easiest way is to find `    </div>\n  );\n}` and put it before the closing tags of the right column
        # Looking at the file structure, the right column ends at the third to last `</div>`
        
        parts = content.rsplit('      </div>\n    </div>\n  );\n}', 1)
        if len(parts) == 2:
            content = parts[0] + '          {selectedSession && <SessionContext session={selectedSession} />}\n      </div>\n    </div>\n  );\n}'

    with open(filepath, 'w') as f:
        f.write(content)
        
    print(f"Updated layout for {filepath}")

for f in glob.glob('frontend/src/app/(dashboard)/**/page.tsx', recursive=True):
    if any(x in f for x in ['tool-misfire', 'memory-debug', 'blind-spots', 'hallucination-rca']):
        fix_page(f)

