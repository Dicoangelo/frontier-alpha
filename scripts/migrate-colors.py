#!/usr/bin/env python3
"""Migrate all hardcoded Tailwind colors to CSS variables in components."""
import re
import os
import glob

COMPONENTS_DIR = "client/src/components"

# Color name → semantic CSS variable mapping
COLOR_SEMANTIC = {
    'green': 'positive', 'emerald': 'positive', 'teal': 'positive',
    'red': 'negative', 'rose': 'negative',
    'blue': 'info', 'sky': 'info', 'cyan': 'info',
    'amber': 'warning', 'yellow': 'warning', 'orange': 'warning',
    'purple': 'accent', 'indigo': 'accent', 'violet': 'accent',
    'fuchsia': 'accent', 'pink': 'accent',
}

# Color name → rgba base values (for opacity patterns)
COLOR_RGBA = {
    'green': '16, 185, 129', 'emerald': '16, 185, 129', 'teal': '20, 184, 166',
    'red': '239, 68, 68', 'rose': '244, 63, 94',
    'blue': '59, 130, 246', 'sky': '14, 165, 233', 'cyan': '6, 182, 212',
    'amber': '245, 158, 11', 'yellow': '234, 179, 8', 'orange': '249, 115, 22',
    'purple': '123, 44, 255', 'indigo': '99, 102, 241', 'violet': '139, 92, 246',
    'fuchsia': '217, 70, 239', 'pink': '236, 72, 153',
    'gray': '107, 114, 128', 'slate': '100, 116, 139',
}

# Build all the color names as a regex alternation
ALL_COLORS = '|'.join(sorted(COLOR_SEMANTIC.keys(), key=len, reverse=True))
ALL_COLORS_PLUS_GRAY = '|'.join(sorted({**COLOR_SEMANTIC, 'gray': 'text-muted', 'slate': 'text-muted'}.keys(), key=len, reverse=True))


def get_semantic(color):
    """Get semantic CSS variable name for a color."""
    return COLOR_SEMANTIC.get(color, 'info')


def migrate_content(content):
    """Migrate all hardcoded Tailwind colors in content."""

    # =========================================================================
    # 1. OPACITY PATTERNS FIRST (before solid patterns eat the base)
    # bg-COLOR-NUM/OPACITY → bg-[rgba(R,G,B,OPACITY)]
    # =========================================================================
    def replace_bg_opacity(m):
        color = m.group(1)
        opacity = int(m.group(3)) / 100
        rgba = COLOR_RGBA.get(color)
        if rgba:
            return f'bg-[rgba({rgba},{opacity})]'
        return m.group(0)

    content = re.sub(
        rf'bg-({ALL_COLORS_PLUS_GRAY})-(\d+)/(\d+)',
        replace_bg_opacity, content
    )

    # border-COLOR-NUM/OPACITY → border-[rgba(R,G,B,OPACITY)]
    def replace_border_opacity(m):
        color = m.group(1)
        opacity = int(m.group(3)) / 100
        rgba = COLOR_RGBA.get(color)
        if rgba:
            return f'border-[rgba({rgba},{opacity})]'
        return m.group(0)

    content = re.sub(
        rf'border-({ALL_COLORS_PLUS_GRAY})-(\d+)/(\d+)',
        replace_border_opacity, content
    )

    # hover:bg-COLOR-NUM/OPACITY
    def replace_hover_bg_opacity(m):
        color = m.group(1)
        opacity = int(m.group(3)) / 100
        rgba = COLOR_RGBA.get(color)
        if rgba:
            return f'hover:bg-[rgba({rgba},{opacity})]'
        return m.group(0)

    content = re.sub(
        rf'hover:bg-({ALL_COLORS_PLUS_GRAY})-(\d+)/(\d+)',
        replace_hover_bg_opacity, content
    )

    # =========================================================================
    # 2. TEXT COLORS: text-COLOR-NUM → text-[var(--color-SEMANTIC)]
    # =========================================================================
    def replace_text(m):
        prefix = m.group(1) or ''  # hover: or dark: prefix
        color = m.group(2)
        if color in ('gray', 'slate'):
            shade = int(m.group(3))
            if shade >= 800:
                return f'{prefix}text-[var(--color-text)]'
            elif shade >= 600:
                return f'{prefix}text-[var(--color-text-secondary)]'
            else:
                return f'{prefix}text-[var(--color-text-muted)]'
        sem = get_semantic(color)
        return f'{prefix}text-[var(--color-{sem})]'

    content = re.sub(
        rf'((?:hover:|dark:|focus:)?)?text-({ALL_COLORS_PLUS_GRAY})-(\d+)',
        replace_text, content
    )

    # =========================================================================
    # 3. SOLID BG: bg-COLOR-NUM → bg-[var(--color-SEMANTIC)]
    # =========================================================================
    def replace_bg_solid(m):
        prefix = m.group(1) or ''
        color = m.group(2)
        shade = int(m.group(3))
        if color in ('gray', 'slate'):
            if shade <= 100:
                return f'{prefix}bg-[var(--color-bg)]'
            elif shade <= 300:
                return f'{prefix}bg-[var(--color-bg-secondary)]'
            else:
                return f'{prefix}bg-[var(--color-bg-tertiary)]'
        sem = get_semantic(color)
        return f'{prefix}bg-[var(--color-{sem})]'

    content = re.sub(
        rf'((?:hover:|dark:|active:|focus:)?)?bg-({ALL_COLORS_PLUS_GRAY})-(\d+)(?!/)',
        replace_bg_solid, content
    )

    # =========================================================================
    # 4. BORDER: border-COLOR-NUM → border-[var(--color-SEMANTIC)]
    # =========================================================================
    def replace_border(m):
        color = m.group(1)
        if color in ('gray', 'slate'):
            return 'border-[var(--color-border)]'
        sem = get_semantic(color)
        return f'border-[var(--color-{sem})]'

    content = re.sub(
        rf'border-({ALL_COLORS_PLUS_GRAY})-(\d+)(?!/)',
        replace_border, content
    )

    # =========================================================================
    # 5. RING/FOCUS: ring-COLOR-NUM → ring-[var(--color-accent)]
    # =========================================================================
    def replace_ring(m):
        prefix = m.group(1) or ''
        color = m.group(2)
        sem = get_semantic(color) if color in COLOR_SEMANTIC else 'accent'
        return f'{prefix}ring-[var(--color-{sem})]'

    content = re.sub(
        rf'((?:focus:)?)?ring-({ALL_COLORS_PLUS_GRAY})-(\d+)',
        replace_ring, content
    )

    # =========================================================================
    # 6. STANDALONE HEX COLORS (in Recharts, SVG, etc.)
    # =========================================================================
    # Common hex → CSS var (only in stroke/fill/color contexts)
    hex_map = {
        '#e5e7eb': 'var(--color-border)',
        '#d1d5db': 'var(--color-border)',
        '#9ca3af': 'var(--color-text-muted)',
        '#6b7280': 'var(--color-text-muted)',
        '#4b5563': 'var(--color-text-secondary)',
        '#374151': 'var(--color-text)',
    }
    for hex_val, css_var in hex_map.items():
        content = content.replace(hex_val, css_var)

    return content


def count_remaining(filepath):
    """Count remaining hardcoded color classes."""
    with open(filepath, 'r') as f:
        content = f.read()

    colors = ALL_COLORS_PLUS_GRAY.replace('|', '|')
    pattern = rf'(?:text|bg|border|ring)-(?:{colors})-\d+'
    matches = re.findall(pattern, content)
    return len(matches), matches


def main():
    os.chdir('/Users/dicoangelo/projects/products/frontier-alpha')

    files = sorted(glob.glob(f'{COMPONENTS_DIR}/**/*.tsx', recursive=True))
    files += sorted(glob.glob('client/src/pages/**/*.tsx', recursive=True))

    modified = 0
    total_files = 0

    for filepath in files:
        with open(filepath, 'r') as f:
            original = f.read()

        content = migrate_content(original)
        total_files += 1

        if content != original:
            with open(filepath, 'w') as f:
                f.write(content)
            modified += 1
            count, remaining = count_remaining(filepath)
            status = "CLEAN" if count == 0 else f"{count} remaining: {remaining[:5]}"
            print(f"  MODIFIED: {filepath} — {status}")

    print(f"\n{'='*60}")
    print(f"Modified {modified}/{total_files} files")

    # Summary of remaining
    print(f"\nRemaining hardcoded colors:")
    total_remaining = 0
    for filepath in files:
        count, remaining = count_remaining(filepath)
        if count > 0:
            total_remaining += count
            print(f"  {count:3d} {filepath} — {remaining[:5]}")

    if total_remaining == 0:
        print("  NONE — all clean!")
    else:
        print(f"\n  TOTAL: {total_remaining} remaining across all files")


if __name__ == '__main__':
    main()
