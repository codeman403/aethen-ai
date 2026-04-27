import re

filepath = 'frontend/src/app/(dashboard)/traces/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# Make Trace Explorer list compact
content = content.replace(
    'className={`w-full text-left p-3 rounded-xl border transition-all ${',
    'className={`group w-full text-left p-2.5 rounded-md border transition-all duration-200 ${'
)
content = content.replace(
    'border-primary/60 bg-primary/5 ring-1 ring-primary/20',
    'border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/20'
)
content = content.replace(
    'border-border hover:border-primary/40 hover:bg-muted/40',
    'border-transparent bg-transparent hover:border-border hover:bg-muted/40'
)
content = content.replace(
    '<span className="font-mono text-sm truncate text-foreground">',
    '<span className={`text-[11px] font-mono truncate pr-2 ${selected?.session_id === s.session_id ? "text-primary font-medium" : "text-foreground/80 font-normal"}`}>'
)
content = content.replace(
    '<div className="text-sm text-muted-foreground mb-1.5 line-clamp-2">',
    '<div className="text-[11px] text-foreground/60 mb-1.5 line-clamp-1 pr-2">'
)
content = content.replace(
    '<div className="flex items-center gap-2 text-[10px] text-muted-foreground">',
    '<div className="flex items-center gap-2 text-[10px] text-foreground/50">'
)

with open(filepath, 'w') as f:
    f.write(content)

