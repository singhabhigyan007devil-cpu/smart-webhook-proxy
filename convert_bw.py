import re

def rgb_to_gray(r, g, b):
    # Luminance formula
    l = int(0.299*int(r) + 0.587*int(g) + 0.114*int(b))
    return f"{l}, {l}, {l}"

def replace_rgba(match):
    r, g, b, a = match.groups()
    gray = rgb_to_gray(r, g, b)
    return f"rgba({gray}, {a})"

def replace_hex(match):
    hex_val = match.group(1)
    if len(hex_val) == 6:
        r, g, b = int(hex_val[0:2], 16), int(hex_val[2:4], 16), int(hex_val[4:6], 16)
        gray = rgb_to_gray(r, g, b)
        # Convert back to hex
        l = int(gray.split(',')[0])
        return f"#{l:02x}{l:02x}{l:02x}"
    return match.group(0)

for filename in ['frontend/app/components/HeroScene.tsx', 'frontend/app/components/TechBackground.tsx']:
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace rgba
    content = re.sub(r'rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+|\$\{.*?\})\)', replace_rgba, content)
    
    # Replace hex
    content = re.sub(r'#([0-9a-fA-F]{6})\b', replace_hex, content)
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
