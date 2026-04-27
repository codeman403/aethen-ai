import glob

for f in ['frontend/src/app/(dashboard)/tool-misfire/page.tsx', 
          'frontend/src/app/(dashboard)/blind-spots/page.tsx']:
    with open(f, 'r') as file:
        content = file.read()
    
    # Add one more </div>
    content = content.replace('      </div>\n    </div>\n    </div>\n  );\n}', '      </div>\n    </div>\n    </div>\n    </div>\n  );\n}')
    
    with open(f, 'w') as file:
        file.write(content)

