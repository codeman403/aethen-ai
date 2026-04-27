import os, glob, re

# Target all React components and pages
paths = ['frontend/src/app/**/*.tsx', 'frontend/src/components/**/*.tsx']
files = []
for p in paths:
    files.extend(glob.glob(p, recursive=True))

for f in files:
    with open(f, 'r') as file:
        content = file.read()

    # 1. Bump typography scale
    content = re.sub(r'\btext-sm\b', 'text-base', content)
    content = re.sub(r'\btext-xs\b', 'text-sm', content)
    
    # 2. Modernize radii
    content = re.sub(r'\brounded-lg\b', 'rounded-xl', content)
    content = re.sub(r'\brounded-md\b', 'rounded-lg', content)
    
    # 3. Add premium shadows and hover interactions to cards
    content = re.sub(r'\bshadow-sm\b', 'shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300', content)
    
    # 4. Enhance the main title headers globally (if any plain 3xl exists)
    content = re.sub(
        r'text-3xl font-bold tracking-tight',
        r'text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent',
        content
    )

    with open(f, 'w') as file:
        file.write(content)

print(f"Upgraded {len(files)} files!")
