import re

filepath = 'frontend/src/app/(dashboard)/memory-debug/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# Make memory-debug layout identical to tool-misfire
content = content.replace('''      <div className="max-w-2xl">
        <SessionsList
          failureType="memory"
          onSelect={handleSelectSession}
          selectedId={selectedId}
        />
      </div>

      {selectedSession && <SessionContext session={selectedSession} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">''', '''      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Column: Sessions List */}
        <div className="xl:col-span-4 sticky top-6 z-10">
          <div className="bg-card border rounded-xl shadow-lg overflow-hidden flex flex-col h-[calc(100vh-140px)]">
            <div className="p-5 border-b bg-muted/10">
              <h3 className="font-semibold text-lg tracking-tight">Select Session</h3>
              <p className="text-sm text-muted-foreground mt-1">Click a trace to debug execution.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <SessionsList
                failureType="memory"
                onSelect={handleSelectSession}
                selectedId={selectedId}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="xl:col-span-8 space-y-6">
          {selectedSession && <SessionContext session={selectedSession} />}
          <div className="grid gap-6 grid-cols-1">
            <div className="space-y-6">''')

# Fix the end of the file safely
# Find the last `</div>` blocks before `  );\n}` for the main component.
# Actually, let's just use rsplit.

parts = content.rsplit('    </div>\n  );\n}\n', 1)
if len(parts) == 2:
    content = parts[0] + '      </div>\n    </div>\n    </div>\n  );\n}\n'

with open(filepath, 'w') as f:
    f.write(content)
