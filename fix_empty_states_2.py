import glob
import re

def refactor_empty_states(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # The goal: Hide all the inner panels (Execution Timeline, Executive Summary, Key Findings) 
    # if `selectedSession` is null.
    # The previous script added the start of the condition `{selectedSession && ( <> <SessionContext />`
    # We need to add the closing `</> )}` at the very end of the right column block.

    # The right column typically ends with:
    #       </div>
    #     </div>
    #   );
    # }

    # We need to replace the last set of closing divs
    if '            </>\n          )}\n        </div>\n      </div>\n    </div>\n  );\n}' not in content:
        # Depending on the page, the number of closing divs varies.
        # We will use regex to find the final `</div>` chain and inject the closing brackets.
        content = re.sub(r'(\s*</div>)+\s*\);\s*\}', '\n            </>\n          )}\n        </div>\n      </div>\n    </div>\n  );\n}', content)
        
    # Also, we should make sure `FileSearch` is imported from `lucide-react`
    if 'FileSearch' not in content[:500]:
        content = content.replace('import {', 'import {\n  FileSearch,', 1)

    # And we remove the individual empty states inside the components because they will never be seen now
    # Actually, removing them is a nice-to-have, but just hiding the parent is enough to clean up the UI.

    with open(filepath, 'w') as f:
        f.write(content)

for file in glob.glob('frontend/src/app/(dashboard)/**/page.tsx', recursive=True):
    if any(x in file for x in ['tool-misfire', 'memory-debug', 'blind-spots', 'hallucination-rca']):
        refactor_empty_states(file)

