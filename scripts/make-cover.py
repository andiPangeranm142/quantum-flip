#!/usr/bin/env python3
"""Generate the Quantum Flip cover image (1280x720, 16:9) for the fest submission.

Title art only: no statistics, no transaction data, nothing fabricated.
Regenerate with: python3 scripts/make-cover.py
"""
from PIL import Image, ImageDraw, ImageFont
import math
import os

W, H = 1280, 720
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cover.png")

# Deep-space gradient: dark indigo -> near-black blue.
top = (16, 14, 48)
bottom = (6, 8, 24)
img = Image.new("RGB", (W, H), top)
px = img.load()
for y in range(H):
    t = y / (H - 1)
    r = int(top[0] + (bottom[0] - top[0]) * t)
    g = int(top[1] + (bottom[1] - top[1]) * t)
    b = int(top[2] + (bottom[2] - top[2]) * t)
    for x in range(W):
        px[x, y] = (r, g, b)

d = ImageDraw.Draw(img, "RGBA")

# Subtle starfield (deterministic pseudo-random dots).
import random
random.seed(42)
for _ in range(220):
    x = random.randint(0, W - 1)
    y = random.randint(0, H - 1)
    r = random.choice([1, 1, 2])
    a = random.randint(24, 90)
    d.ellipse([x - r, y - r, x + r, y + r], fill=(180, 190, 255, a))

# Glow behind the coin.
cx, cy, R = 1010, 330, 190
for i in range(60, 0, -1):
    a = int(3 + (60 - i) * 0.35)
    d.ellipse([cx - R - i * 3, cy - R - i * 3, cx + R + i * 3, cy + R + i * 3],
              fill=(96, 120, 255, a))

# The coin: gold ring, dark face, "Q" monogram, heads/tails orbit dots.
d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(212, 175, 55, 255))
d.ellipse([cx - R + 14, cy - R + 14, cx + R - 14, cy + R - 14], fill=(24, 20, 52, 255))
d.ellipse([cx - R + 26, cy - R + 26, cx + R - 26, cy + R - 26],
          outline=(212, 175, 55, 255), width=3)

font_dir = "/usr/share/fonts/truetype/dejavu"
f_q = ImageFont.truetype(f"{font_dir}/DejaVuSans-Bold.ttf", 210)
f_title = ImageFont.truetype(f"{font_dir}/DejaVuSans-Bold.ttf", 118)
f_sub = ImageFont.truetype(f"{font_dir}/DejaVuSans.ttf", 34)
f_small = ImageFont.truetype(f"{font_dir}/DejaVuSans.ttf", 26)
f_badge = ImageFont.truetype(f"{font_dir}/DejaVuSans-Bold.ttf", 26)
f_mono = ImageFont.truetype(f"{font_dir}/DejaVuSansMono.ttf", 24)

# "Q" monogram centered on the coin.
q = "Q"
bbox = d.textbbox((0, 0), q, font=f_q)
d.text((cx - (bbox[2] - bbox[0]) / 2 - bbox[0], cy - (bbox[2] - bbox[1]) / 2 - bbox[1] - 12),
       q, font=f_q, fill=(232, 200, 90, 255))

# Orbiting dots around the coin (heads on top, tails at the bottom).
for angle_deg, label in [(270, "H"), (90, "T")]:
    a = math.radians(angle_deg)
    ox, oy = cx + int(math.cos(a) * (R + 52)), cy + int(math.sin(a) * (R + 52))
    d.ellipse([ox - 26, oy - 26, ox + 26, oy + 26], fill=(40, 44, 92, 255),
              outline=(140, 160, 255, 255), width=2)
    bb = d.textbbox((0, 0), label, font=f_badge)
    d.text((ox - (bb[2] - bb[0]) / 2 - bb[0], oy - (bb[2] - bb[1]) / 2 - bb[1] - 2),
           label, font=f_badge, fill=(200, 210, 255, 255))

# Title block, left side.
x0 = 80
d.text((x0, 190), "QUANTUM", font=f_title, fill=(255, 255, 255, 255))
d.text((x0, 315), "FLIP", font=f_title, fill=(232, 200, 90, 255))
d.text((x0, 470), "Every flip is quantum-safe.", font=f_sub, fill=(205, 212, 255, 255))
d.text((x0, 520), "On-chain coin-flip game  ·  QoreChain testnet",
       font=f_small, fill=(150, 158, 205, 255))

# Badge pill, bottom left.
badge = "BUILD BEFORE Q-DAY  ·  QUANTUM PASS"
bb = d.textbbox((0, 0), badge, font=f_badge)
pad_x, pad_y = 22, 12
bx0, by0 = x0, 600
bx1, by1 = bx0 + (bb[2] - bb[0]) + pad_x * 2, by0 + (bb[3] - bb[1]) + pad_y * 2
d.rounded_rectangle([bx0, by0, bx1, by1], radius=22,
                    outline=(120, 140, 255, 255), width=2, fill=(30, 32, 72, 255))
d.text((bx0 + pad_x - bb[0], by0 + pad_y - bb[1]), badge, font=f_badge,
       fill=(190, 200, 255, 255))

# Chain id, bottom right.
chain = "qorechain-diana  ·  chain 9800"
bb = d.textbbox((0, 0), chain, font=f_mono)
d.text((W - 80 - (bb[2] - bb[0]), 668), chain, font=f_mono, fill=(120, 128, 175, 255))

img.save(OUT, "PNG", optimize=True)
print(f"Wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB, {W}x{H})")
