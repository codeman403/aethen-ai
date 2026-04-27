import glob
import re

def update_page(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Remove the old, unnoticeable loading spinner from the top
    content = re.sub(
        r'\{\s*isLoading\s*&&\s*\(\s*<div[^>]*>\s*<Loader2[^>]*/>[^<]*</div>\s*\)\s*\}', 
        '', 
        content
    )

    # 2. Upgrade text colors from light muted to more readable foreground colors
    content = content.replace('text-muted-foreground', 'text-foreground/80')
    content = content.replace('text-sm', 'text-base')
    content = content.replace('text-xs', 'text-sm')

    # 3. Refactor the Right Column to handle Empty and Loading states cleanly
    right_col_marker = '{/* Right Column: Results */}'
    if right_col_marker in content:
        parts = content.split(right_col_marker)
        pre = parts[0] + right_col_marker + '\n        <div className="xl:col-span-8 space-y-6">\n'
        
        # Get the inner content of the right column
        right_col_content = parts[1]
        
        # Strip the opening div className="xl:col-span-8 space-y-6">
        idx = right_col_content.find('<div className="xl:col-span-8')
        if idx != -1:
            # find the end of this div tag
            idx2 = right_col_content.find('>', idx)
            right_col_content = right_col_content[idx2+1:]
        
        # We need to find where the right column ends. It's usually the third to last `</div>`
        # We'll just wrap the whole `right_col_content` except the last `</div>\n    </div>\n  );\n}`
        
        # Let's use a simpler approach: replace `{selectedSession && <SessionContext session={selectedSession} />}`
        # with our conditional block start, and put the closing tags at the bottom.
        
        # Let's revert the split and do a more targeted replace
        pass

    with open(filepath, 'w') as f:
        f.write(content)

for file in glob.glob('frontend/src/app/(dashboard)/**/page.tsx', recursive=True):
    if any(x in file for x in ['tool-misfire', 'memory-debug', 'blind-spots', 'hallucination-rca']):
        update_page(file)

