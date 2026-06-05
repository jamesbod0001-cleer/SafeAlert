#!/usr/bin/env python3
"""Generate motion-graphic scene stills for SafeAlert marketing video."""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '../public/marketing')
EXPORT = os.path.join(ROOT, 'export')
BG = (5, 8, 16)
GREEN = (18, 183, 106)
RED = (240, 62, 62)
SUB = (180, 190, 210)
WHITE = (255, 255, 255)

FONT_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
FONT_REG = '/System/Library/Fonts/Supplemental/Arial.ttf'


def font(size, bold=False):
    path = FONT_BOLD if bold else FONT_REG
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def rounded_rect(draw, xy, radius, fill, outline=None):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline)


def draw_logo(draw, x, y, scale=1):
    f = font(int(52 * scale), bold=True)
    draw.text((x, y), 'Safe', fill=WHITE, font=f)
    w = draw.textlength('Safe', font=f)
    draw.text((x + w, y), 'Alert', fill=GREEN, font=f)
    w2 = draw.textlength('SafeAlert', font=f)
    tag = font(int(14 * scale), bold=True)
    draw.text((x, y + int(58 * scale)), 'NG · YOUR PEOPLE. NOT GOVERNMENT.', fill=GREEN, font=tag)


def scene_map(size):
    w, h = size
    img = Image.new('RGB', size, BG)
    draw = ImageDraw.Draw(img)
    draw_logo(draw, 80, 60, scale=1.2 if w > 1200 else 0.85)

    phone_w, phone_h = int(w * 0.38), int(h * 0.62)
    px = (w - phone_w) // 2
    py = int(h * 0.22)
    rounded_rect(draw, (px, py, px + phone_w, py + phone_h), 36, (10, 14, 26), GREEN)
    hdr = font(22, bold=True)
    draw.text((px + 24, py + 20), 'SafeAlert · Live map', fill=WHITE, font=hdr)

    map_y = py + 70
    map_h = int(phone_h * 0.42)
    rounded_rect(draw, (px + 16, map_y, px + phone_w - 16, map_y + map_h), 16, (13, 26, 18))
    for cx, cy, col in [(0.35, 0.35, RED), (0.62, 0.55, RED), (0.22, 0.68, GREEN), (0.78, 0.25, GREEN)]:
        mx = px + 16 + int((phone_w - 32) * cx)
        my = map_y + int(map_h * cy)
        r = 14
        draw.ellipse((mx - r, my - r, mx + r, my + r), fill=col)

    body = font(18)
    draw.text((px + 24, map_y + map_h + 20), 'Abuja–Kaduna · 3 critical zones', fill=SUB, font=body)
    draw.text((px + 24, map_y + map_h + 48), 'Community reports · Offline packs', fill=GREEN, font=font(16, bold=True))

    cap = font(28 if w > 1200 else 22, bold=True)
    draw.text((80, h - 120), 'Live danger map — works on low data', fill=WHITE, font=cap)
    return img


def scene_estate(size):
    w, h = size
    img = Image.new('RGB', size, BG)
    draw = ImageDraw.Draw(img)
    draw_logo(draw, 80, 60, scale=1.2 if w > 1200 else 0.85)

    cx = w // 2
    title = font(32, bold=True)
    draw.text((cx - draw.textlength('Estate watch', font=title) / 2, int(h * 0.28)), 'Estate watch', fill=WHITE, font=title)

    code = font(64, bold=True)
    code_text = 'RK7M2P'
    draw.text((cx - draw.textlength(code_text, font=code) / 2, int(h * 0.36)), code_text, fill=GREEN, font=code)

    card_w = int(w * 0.72)
    card_x = (w - card_w) // 2
    y = int(h * 0.52)
    for text, accent in [
        ('Neighbor SOS in Royal Garden Estate — 400m away', GREEN),
        ('Circle: Mama · Driver · Uncle T — notified', RED),
    ]:
        rounded_rect(draw, (card_x, y, card_x + card_w, y + 90), 18, (12, 28, 20) if accent == GREEN else (40, 12, 12), accent)
        draw.rectangle((card_x, y, card_x + 6, y + 90), fill=accent)
        draw.text((card_x + 24, y + 28), text, fill=WHITE, font=font(20, bold=True))
        y += 110

    cap = font(26, bold=True)
    draw.text((80, h - 110), 'One code for your whole estate', fill=SUB, font=cap)
    return img


def scene_community(size):
    w, h = size
    img = Image.new('RGB', size, BG)
    draw = ImageDraw.Draw(img)
    draw_logo(draw, 80, 60, scale=1.2 if w > 1200 else 0.85)

    icons = ['Report', 'Confirm', 'Share', 'Data saver']
    colors = [RED, GREEN, GREEN, (100, 140, 255)]
    start_x = int(w * 0.12)
    gap = int((w * 0.76) / len(icons))
    y = int(h * 0.38)
    for i, (label, col) in enumerate(zip(icons, colors)):
        x = start_x + i * gap
        rounded_rect(draw, (x, y, x + gap - 24, y + 160), 24, (15, 20, 35), col)
        draw.text((x + 28, y + 60), label, fill=WHITE, font=font(22, bold=True))

    cap = font(30, bold=True)
    draw.text((80, h - 120), 'Built for ₦500/day bundles · Citizen-powered', fill=WHITE, font=cap)
    return img


def save_pair(name, builder):
    for label, size in [('16x9', (1920, 1080)), ('9x16', (1080, 1920))]:
        path = os.path.join(EXPORT, f'{name}-{label}.png')
        builder(size).save(path, 'PNG', optimize=True)
        print('Wrote', path)


def main():
    os.makedirs(EXPORT, exist_ok=True)
    save_pair('ad-scene-map', scene_map)
    save_pair('ad-scene-estate', scene_estate)
    save_pair('ad-scene-community', scene_community)


if __name__ == '__main__':
    main()
