import re

filepath = 'frontend/src/app/(dashboard)/memory-debug/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# We want to perform the same layout update we successfully did for other pages.
# First, wrap the top level div into the grid
old_wrapper = '<div className="max-w-2xl">'

if old_wrapper in content:
    parts = content.split(old_wrapper)
    
    new_wrapper_start = '''<div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Column: Sessions List */}
        <div className="xl:col-span-4 sticky top-6 z-10">
          <div className="bg-card border rounded-xl shadow-lg overflow-hidden flex flex-col h-[calc(100vh-140px)]">
            <div className="p-5 border-b bg-muted/10">
              <h3 className="font-semibold text-lg tracking-tight">Select Session</h3>
              <p className="text-sm text-muted-foreground mt-1">Click a trace to debug execution.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">'''
            
    second_part = parts[1]
    
    grid_start_marker = '<div className="grid gap-6 lg:grid-cols-3">'
    if grid_start_marker not in second_part:
        idx = second_part.find('<div className="grid')
        grid_start_marker = second_part[idx:second_part.find('>', idx)+1]
        
    session_list_and_context, rest_of_page = second_part.split(grid_start_marker, 1)
    
    session_list_and_context = session_list_and_context.strip()
    if session_list_and_context.endswith('</div>'):
        session_list_and_context = session_list_and_context[:-6]
    
    ctx_idx = session_list_and_context.find('{selectedSession && <SessionContext')
    if ctx_idx != -1:
        sessions_list = session_list_and_context[:ctx_idx]
        session_context = session_list_and_context[ctx_idx:]
    else:
        sessions_list = session_list_and_context
        session_context = ''
        
    middle = f'''{sessions_list}
            </div>
          </div>
        </div>

        {{/* Right Column: Results */}}
        <div className="xl:col-span-8 space-y-6">
          {session_context}

          <div className="grid gap-6 grid-cols-1">'''
          
    rest_of_page = rest_of_page.replace('lg:col-span-2', '')
    
    # We need exactly 3 closing divs at the end for memory-debug/page.tsx
    # We will strip off all closing divs at the very end of the file and add exactly 3.
    rest_of_page = re.sub(r'(\s*</div>)+\s*\);\s*\}', '\n      </div>\n    </div>\n    </div>\n  );\n}', rest_of_page)
    
    final_content = parts[0] + new_wrapper_start + middle + rest_of_page
    
    with open(filepath, 'w') as f:
        f.write(final_content)
    print(f"Successfully updated {filepath}")

