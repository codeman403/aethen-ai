import glob

def fix_file(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    # We want to remove the extra </div> that was inserted.
    # Looking at the end of the file, we expect:
    #       </div>
    #     </div>
    #   );
    # }
    
    # Let's count divs from top to bottom, but the simplest is just to remove one </div> from the bottom block.
    # Let's just find the last occurrence of `</div>\n    </div>\n  );\n}` and replace it with `    </div>\n  );\n}`
    
    content = "".join(lines)
    
    # Target the extra div added by our previous script
    if '      </div>\n          </div>\n    </div>\n  );\n}' in content:
        content = content.replace('      </div>\n          </div>\n    </div>\n  );\n}', '      </div>\n    </div>\n  );\n}')
    elif '      </div>\n    </div>\n  );\n}' in content:
        content = content.replace('      </div>\n    </div>\n  );\n}', '    </div>\n  );\n}')
    
    # Brute force fix: remove the 3rd to last </div> if it's imbalanced.
    # Actually, a better way is to just replace the specific end pattern
    import re
    content = re.sub(r'(\s*</div>)+\s*\);\s*\}', '\n    </div>\n  );\n}', content)
    
    with open(filepath, 'w') as f:
        f.write(content)

for f in ['frontend/src/app/(dashboard)/tool-misfire/page.tsx', 
          'frontend/src/app/(dashboard)/blind-spots/page.tsx', 
          'frontend/src/app/(dashboard)/hallucination-rca/page.tsx', 
          'frontend/src/app/(dashboard)/memory-debug/page.tsx']:
    fix_file(f)

