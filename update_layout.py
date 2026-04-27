import re
import glob

def update_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find the boundary where <div className="max-w-2xl"> starts
    marker = '<div className="max-w-2xl">'
    if marker not in content:
        print(f"Skipping {filepath} - no marker found")
        return

    # Split the file: everything before the marker, and everything after
    pre_content, main_content = content.split(marker, 1)

    # In the main content, find the SessionsList and SessionContext
    # We will just do string replacement on the structural wrappers
    
    # Replace the wrapper around SessionsList + SessionContext
    main_content = main_content.replace(
        '<SessionsList\n',
        '<div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">\n        {/* Left Column: Sessions List */}\n        <div className="xl:col-span-4 sticky top-6 z-10">\n          <div className="bg-card border rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[calc(100vh-140px)]">\n            <div className="p-5 border-b bg-muted/10">\n              <h3 className="font-semibold text-lg tracking-tight">Select Session</h3>\n              <p className="text-sm text-muted-foreground mt-1">Click a trace to debug execution.</p>\n            </div>\n            <div className="flex-1 overflow-y-auto p-4">\n              <SessionsList\n'
    )

    # After SessionContext, we need to close the left column and start the right column
    main_content = re.sub(
        r'(\{selectedSession\s*&&\s*<SessionContext\s*session=\{selectedSession\}\s*/>\})\s*</div>',
        r'</div>\n          </div>\n        </div>\n\n        {/* Right Column: Results */}\n        <div className="xl:col-span-8 space-y-6">\n          \1',
        main_content
    )

    # Modify the bottom grid to fit inside the right column nicely
    main_content = main_content.replace('<div className="grid gap-6 lg:grid-cols-3">', '<div className="grid gap-6 grid-cols-1">')
    main_content = main_content.replace('lg:col-span-2 ', '')

    # Close the new 12-col grid wrapper just before the final </div> of the page
    # Find the last </div>
    last_div_index = main_content.rfind('</div>')
    if last_div_index != -1:
        main_content = main_content[:last_div_index] + '      </div>\n    ' + main_content[last_div_index:]

    new_content = pre_content + main_content
    
    with open(filepath, 'w') as f:
        f.write(new_content)
    print(f"Updated {filepath}")

for f in glob.glob('frontend/src/app/(dashboard)/**/page.tsx', recursive=True):
    if 'traces' not in f and 'demo-agent' not in f and 'data-quality' not in f and 'chat' not in f and 'page.tsx' in f and 'layout' not in f:
        update_file(f)

