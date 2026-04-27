import re

filepath = 'frontend/src/app/(dashboard)/tool-misfire/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Move SessionContext to the bottom
# It currently is right before `<div className="grid gap-6 lg:grid-cols-3">`
# We need to extract it and move it to the bottom of the page, right before the closing tags.

if '{selectedSession && <SessionContext session={selectedSession} />}' in content:
    content = content.replace('{selectedSession && <SessionContext session={selectedSession} />}\n      </div>', '      </div>')
    
    # Add it to the bottom
    # We find the last `</div>` blocks before `  );\n}` for the main component.
    parts = content.rsplit('    </div>\n  );\n}\n', 1)
    if len(parts) == 2:
        content = parts[0] + '\n        <div className="mt-8">\n          {selectedSession && <SessionContext session={selectedSession} />}\n        </div>\n      </div>\n    </div>\n  );\n}\n'

# 2. Add prominent Loading Overlay
if '{isLoading && (' in content:
    # Remove old loading spinner
    content = re.sub(
        r'\{\s*isLoading\s*&&\s*\(\s*<div[^>]*>\s*<Loader2[^>]*/>[^<]*</div>\s*\)\s*\}', 
        '', 
        content
    )

content = content.replace(
    '<div className="grid gap-6 lg:grid-cols-3">',
    '<div className="relative grid gap-6 lg:grid-cols-3">\n        {isLoading && (\n          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl">\n            <Loader2 className="size-10 animate-spin text-primary mb-4" />\n            <h3 className="text-xl font-bold">Analyzing Session...</h3>\n            <p className="text-foreground/60 text-sm mt-2">Diagnosing root causes and evaluating traces.</p>\n          </div>\n        )}\n'
)

with open(filepath, 'w') as f:
    f.write(content)

print(f"Successfully updated {filepath}")
