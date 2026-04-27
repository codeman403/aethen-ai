import re

filepath = 'frontend/src/app/(dashboard)/traces/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# We need to extract the entire report block at the bottom
report_start = '{report && ('
# The report block ends right before the closing divs:
#                   </div>
#                 )}
#               </>
#             )}
#           </div>
#         )}
#       </div>
#     </div>
#   );
# }

# Let's find the exact block
report_idx = content.find('{report && (')
if report_idx == -1:
    print("Report block not found.")
    exit(1)

# Extract from report_idx to `</>`
end_str = '              </>\n            )}'
report_end_idx = content.find(end_str, report_idx) + len(end_str)

report_block = content[report_idx:report_end_idx]

# Remove it from the bottom
content = content[:report_idx] + content[report_end_idx:]

# Now insert it right after the analysis button container.
# The container ends with:
#             {analysisError && (
#               <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-6 py-4 text-base text-destructive">
#                 {analysisError}
#               </div>
#             )}

target = '            )}\n\n            {/* Session Context — prompt, response, tool calls, retrievals */}'
insertion_point = content.find(target)

if insertion_point != -1:
    content = content[:insertion_point] + '            )}\n\n            {/* Analysis Results */}\n            ' + report_block + '\n\n' + content[insertion_point + 15:]

with open(filepath, 'w') as f:
    f.write(content)

print("Updated traces page")
