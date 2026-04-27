import glob

def refactor_page(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Step 1: Replace the top-level container around SessionsList & SessionContext
    # from <div className="max-w-2xl"> to our new grid structure.
    
    old_wrapper = '<div className="max-w-2xl">'
    
    # Tool Misfire, Blind Spots, Hallucination RCA, Memory Debug all follow this pattern
    if old_wrapper not in content:
        return
        
    parts = content.split(old_wrapper)
    
    # We will build the new content
    new_wrapper_start = '''<div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Column: Sessions List */}
        <div className="xl:col-span-4 sticky top-6 z-10">
          <div className="bg-card border rounded-xl shadow-lg overflow-hidden flex flex-col h-[calc(100vh-140px)]">
            <div className="p-5 border-b bg-muted/10">
              <h3 className="font-semibold text-lg tracking-tight">Select Session</h3>
              <p className="text-sm text-muted-foreground mt-1">Click a trace to debug execution.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">'''
            
    # Step 2: Now we need to find where the <div className="max-w-2xl"> ends.
    # It usually ends right before <div className="grid gap-6 lg:grid-cols-3">
    
    second_part = parts[1]
    
    grid_start_marker = '<div className="grid gap-6 lg:grid-cols-3">'
    if grid_start_marker not in second_part:
        # Some might use grid-cols-2 or something, let's find '<div className="grid'
        idx = second_part.find('<div className="grid')
        if idx == -1: return
        grid_start_marker = second_part[idx:second_part.find('>', idx)+1]
        
    session_list_and_context, rest_of_page = second_part.split(grid_start_marker, 1)
    
    # We need to remove the closing </div> of the max-w-2xl wrapper
    # It's at the end of session_list_and_context
    session_list_and_context = session_list_and_context.strip()
    if session_list_and_context.endswith('</div>'):
        session_list_and_context = session_list_and_context[:-6]
    
    # Step 3: We need to split SessionsList and SessionContext
    # We look for '{selectedSession && <SessionContext'
    ctx_idx = session_list_and_context.find('{selectedSession && <SessionContext')
    if ctx_idx != -1:
        sessions_list = session_list_and_context[:ctx_idx]
        session_context = session_list_and_context[ctx_idx:]
    else:
        sessions_list = session_list_and_context
        session_context = ''
        
    # Build the middle part
    middle = f'''{sessions_list}
            </div>
          </div>
        </div>

        {{/* Right Column: Results */}}
        <div className="xl:col-span-8 space-y-6">
          {session_context}

          <div className="grid gap-6 grid-cols-1">'''
          
    # Step 4: Fix the inner grid columns 
    # Replace lg:col-span-2 with just standard layout or leave it since grid-cols-1 ignores it
    rest_of_page = rest_of_page.replace('lg:col-span-2', '')
    
    # Step 5: Wrap the entire right column with the closing div
    # Find the last </div> before the final return statement
    lines = rest_of_page.split('\n')
    for i in range(len(lines)-1, -1, -1):
        if '</div>' in lines[i]:
            # Replace the last </div> which belonged to the main page wrapper, 
            # we need to add one more to close our new grid
            lines[i] = lines[i].replace('</div>', '  </div>\n      </div>')
            break
            
    rest_of_page = '\n'.join(lines)
    
    final_content = parts[0] + new_wrapper_start + middle + rest_of_page
    
    with open(filepath, 'w') as f:
        f.write(final_content)
    print(f"Successfully updated {filepath}")

for f in glob.glob('frontend/src/app/(dashboard)/**/page.tsx', recursive=True):
    if any(x in f for x in ['tool-misfire', 'blind-spots', 'hallucination-rca', 'memory-debug']):
        refactor_page(f)

