import glob

def refactor_empty_states(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Add a global placeholder for the right panel when NO session is selected
    if '{selectedSession && <SessionContext session={selectedSession} />}\n' in content:
        content = content.replace(
            '{selectedSession && <SessionContext session={selectedSession} />}\n',
            '{!selectedSession && (\n' +
            '            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center border border-dashed rounded-xl bg-muted/5">\n' +
            '              <div className="p-4 bg-muted/20 rounded-full mb-4">\n' +
            '                <FileSearch className="size-8 text-muted-foreground/50" />\n' +
            '              </div>\n' +
            '              <h3 className="text-xl font-bold text-foreground mb-2">Select a session to begin analysis</h3>\n' +
            '              <p className="text-base text-foreground/70 max-w-md">\n' +
            '                Choose a trace from the left panel to view its full context, execution timeline, and Aethen diagnostic results.\n' +
            '              </p>\n' +
            '            </div>\n' +
            '          )}\n' +
            '          {selectedSession && (\n' +
            '            <>\n' +
            '              <SessionContext session={selectedSession} />\n'
        )

    # In order to close the `{selectedSession && (` we added above, we need to wrap the grid
    # So we replace `<div className="grid gap-6 grid-cols-1">` 
    # Or actually, let's just wrap the entire right column logic in a massive condition.
    
    with open(filepath, 'w') as f:
        f.write(content)

