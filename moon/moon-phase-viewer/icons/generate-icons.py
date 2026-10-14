#!/usr/bin/env python3
"""
Regenerates every PWA icon file from icons/source.png.

TO SWAP IN YOUR OWN ART: replace icons/source.png with your own image
(square, at least 512x512 — 1024x1024 recommended, PNG, transparent
background is fine) and run this script from anywhere:

    python3 icons/generate-icons.py

That's it — manifest.json and index.html already reference the fixed
output filenames below, so nothing else needs to change. Needs Pillow
(`pip install Pillow --break-system-packages` if it's not already on
your machine).
"""
from PIL import Image
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_PATH = os.path.join(HERE, 'source.png')

src = Image.open(SRC_PATH).convert('RGBA')

if src.width != src.height:
    print(f"Note: source.png is {src.width}x{src.height}, not square — center-cropping to a square first.")
    side = min(src.width, src.height)
    left = (src.width - side) // 2
    top = (src.height - side) // 2
    src = src.crop((left, top, left + side, top + side))


def save_plain(size, filename, flatten_bg=None):
    """Resize to fill the whole canvas. flatten_bg (an RGBA tuple) composites
    onto an opaque background and drops to RGB — use for formats (like iOS
    touch icons) that shouldn't rely on transparency."""
    resized = src.resize((size, size), Image.LANCZOS)
    if flatten_bg:
        bg = Image.new('RGBA', resized.size, flatten_bg)
        resized = Image.alpha_composite(bg, resized).convert('RGB')
    resized.save(os.path.join(HERE, filename))
    print(f'  wrote {filename} ({size}x{size})')


def save_maskable(size, filename, bg=(0, 0, 0, 255)):
    """Android can crop a maskable icon to various shapes (circle, squircle,
    etc.), so real content needs to stay inside a safe-zone circle — by
    convention, about 80% of the canvas, centered, on an opaque background."""
    canvas = Image.new('RGBA', (size, size), bg)
    inner = int(size * 0.8)
    resized = src.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.alpha_composite(resized, (offset, offset))
    canvas.convert('RGB').save(os.path.join(HERE, filename))
    print(f'  wrote {filename} ({size}x{size}, maskable safe-zone 80%)')


print(f'Generating icons from {SRC_PATH} ({src.size[0]}x{src.size[1]})...')

# Standard manifest icons (Chrome/Android, "any" purpose)
save_plain(192, 'icon-192.png')
save_plain(512, 'icon-512.png')

# Maskable manifest icon (Android adaptive-icon shapes)
save_maskable(512, 'icon-512-maskable.png')

# iOS home-screen icon — flattened onto opaque black, no transparency
save_plain(180, 'apple-touch-icon.png', flatten_bg=(0, 0, 0, 255))

# Browser tab favicon
save_plain(32, 'favicon-32.png')

print('Done.')
