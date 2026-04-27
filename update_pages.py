import glob
import re

def update_page(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Remove the old loading spinner from the top
    content = re.sub(
        r'\{\s*isLoading\s*&&\s*\(\s*<div[^>]*>\s*<Loader2[^>]*/>[^<]*</div>\s*\)\s*\}', 
        '', 
        content
    )

    # 2. Upgrade text colors from light muted to more readable foreground colors globally
    content = content.replace('text-muted-foreground', 'text-foreground/80')
    content = content.replace('text-sm', 'text-base')
    content = content.replace('text-xs', 'text-sm')

    # 3. Handle the empty state securely by replacing `{selectedSession && <SessionContext...`
    # and wrapping the rest of the right column manually.
    
    # We know the right column starts with:
    #         {/* Right Column: Results */}
    #         <div className="xl:col-span-8 space-y-6">
    #           {selectedSession && <SessionContext session={selectedSession} />}
    
    right_col_marker = '{/* Right Column: Results */}'
    if right_col_marker in content:
        parts = content.split(right_col_marker)
        
        pre = parts[0] + right_col_marker + '\n        <div className="xl:col-span-8 space-y-6">\n'
        
        # The right part after the marker
        right_part = parts[1]
        
        # Find where {selectedSession && ...} is and remove it, then apply our conditional wrapper
        ctx_str = '{selectedSession && <SessionContext session={selectedSession} />}'
        
        if ctx_str in right_part:
            # We strip out the outer wrapper of the right column since we are rewriting it
            start_wrapper = '<div className="xl:col-span-8 space-y-6">'
            right_part = right_part[right_part.find(start_wrapper) + len(start_wrapper):]
            
            # Replace the ctx_str with our conditional block start
            right_part = right_part.replace(
                ctx_str,
                '{!selectedSession ? (\n' +
                '            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center border border-dashed rounded-xl bg-muted/5 p-8">\n' +
                '              <div className="p-4 bg-muted/20 rounded-full mb-4">\n' +
                '                <FileSearch className="size-8 text-foreground/50" />\n' +
                '              </div>\n' +
                '              <h3 className="text-xl font-bold text-foreground mb-2">Select a session to begin analysis</h3>\n' +
                '              <p className="text-base text-foreground/70 max-w-md">\n' +
                '                Choose a trace from the left panel to view its full context, execution timeline, and Aethen diagnostic results.\n' +
                '              </p>\n' +
                '            </div>\n' +
                '          ) : (\n' +
                '            <>\n' +
                '              <SessionContext session={selectedSession} />\n'
            )
            
            # Since the right column is the last thing in the file, we can just replace the last </div> chain 
            # with our closing tags.
            right_part = re.sub(r'(\s*</div>)+\s*\);\s*\}', '\n            </>\n          )}\n        </div>\n      </div>\n    </div>\n  );\n}', right_part)
            
            content = pre + right_part
            
        if 'FileSearch' not in content[:500]:
            content = content.replace('import {', 'import {\n  FileSearch,', 1)

    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Updated {filepath}")

for file in glob.glob('frontend/src/app/(dashboard)/**/page.tsx', recursive=True):
    if any(x in file for x in ['tool-misfire', 'memory-debug', 'blind-spots', 'hallucination-rca']):
        update_page(file)

