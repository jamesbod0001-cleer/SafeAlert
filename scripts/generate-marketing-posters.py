#!/usr/bin/env python3
"""Generate branded SafeAlert NG marketing posters (multiple sizes & themes)."""
import json
import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '../public/marketing/posters')
FONT_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
FONT_REG = '/System/Library/Fonts/Supplemental/Arial.ttf'

BG = (5, 8, 16)
BG2 = (10, 14, 26)
GREEN = (18, 183, 106)
RED = (240, 62, 62)
AMBER = (255, 176, 32)
SUB = (160, 175, 200)
WHITE = (255, 255, 255)

SIZES = {
    'square': (1080, 1080),
    'story': (1080, 1920),
    'landscape': (1920, 1080),
    'whatsapp': (800, 800),
}


def fnt(size, bold=True):
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)
    except OSError:
        return ImageFont.load_default()


def wrap(draw, text, font, max_w):
    words, lines, line = text.split(), [], []
    for w in words:
        t = ' '.join(line + [w])
        if draw.textlength(t, font=font) <= max_w:
            line.append(w)
        else:
            if line:
                lines.append(' '.join(line))
            line = [w]
    if line:
        lines.append(' '.join(line))
    return lines


def rr(draw, box, r, fill, outline=None):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline)


def logo_block(draw, x, y, scale=1):
    fb = fnt(int(44 * scale))
    draw.text((x, y), 'Safe', fill=WHITE, font=fb)
    w = draw.textlength('Safe', font=fb)
    draw.text((x + w, y), 'Alert', fill=GREEN, font=fb)
    tag = fnt(int(13 * scale))
    draw.text((x, y + int(50 * scale)), 'NG', fill=GREEN, font=tag)


def footer_cta(draw, w, h, url='safealert.ng/app', sub='Free · Citizen-powered'):
    draw.rectangle((0, h - 130, w, h), fill=(3, 5, 10))
    draw.rectangle((0, h - 130, w, h - 127), fill=GREEN)
    t = fnt(28 if w >= 1200 else 22)
    draw.text(((w - draw.textlength(url, font=t)) / 2, h - 95), url, fill=GREEN, font=t)
    s = fnt(16, bold=False)
    draw.text(((w - draw.textlength(sub, font=s)) / 2, h - 55), sub, fill=SUB, font=s)


def headline(draw, w, h, lines, y_ratio=0.62, size=52):
    fs = size if w >= 1200 else int(size * 0.78)
    font = fnt(fs)
    y = int(h * y_ratio)
    for line in lines:
        tw = draw.textlength(line, font=font)
        draw.text(((w - tw) / 2, y), line, fill=WHITE, font=font)
        y += fs + 12


def subline(draw, w, y, text, size=24):
    font = fnt(size, bold=False)
    tw = draw.textlength(text, font=font)
    draw.text(((w - tw) / 2, y), text, fill=SUB, font=font)


def gradient_bg(w, h, top=(5, 8, 16), bottom=(12, 28, 20)):
    img = Image.new('RGB', (w, h), top)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        row = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = row
    return img


def draw_sos_ring(draw, cx, cy, r):
    for i, alpha in enumerate([40, 70, 110]):
        rr(draw, (cx - r - i * 28, cy - r - i * 28, cx + r + i * 28, cy + r + i * 28), r + i * 28, (240, 62, 62))
    rr(draw, (cx - r, cy - r, cx + r, cy + r), r, RED)
    t = fnt(int(r * 0.55))
    tw = draw.textlength('SOS', font=t)
    draw.text((cx - tw / 2, cy - r * 0.35), 'SOS', fill=WHITE, font=t)


def draw_nigeria_outline(draw, cx, cy, scale, color=GREEN):
    import random
    rng = random.Random(7)
    pts = []
    for deg in range(0, 360, 8):
        rad = math.radians(deg)
        bump = 1 + 0.12 * math.sin(rad * 3) + 0.08 * math.cos(rad * 5)
        x = cx + math.cos(rad) * 120 * scale * bump
        y = cy + math.sin(rad) * 140 * scale * bump
        pts.append((x, y))
    draw.polygon(pts, outline=color, fill=(12, 28, 18))
    for _ in range(6):
        dx = cx + rng.randint(-80, 80) * scale
        dy = cy + rng.randint(-90, 90) * scale
        col = RED if rng.random() > 0.5 else GREEN
        rr(draw, (dx - 8, dy - 8, dx + 8, dy + 8), 8, col)


def poster_sos(size):
    w, h = size
    img = gradient_bg(w, h, (20, 5, 8), BG)
    draw = ImageDraw.Draw(img)
    logo_block(draw, 48, 48, scale=0.9 if w < 1200 else 1)
    draw_sos_ring(draw, w // 2, int(h * 0.32), min(w, h) // 8)
    headline(draw, w, h, ['Hold 3 seconds.', 'Your circle gets live GPS.'], y_ratio=0.52, size=46)
    subline(draw, w, int(h * 0.52) + 120, 'WhatsApp SOS · Push alert · No government wait')
    footer_cta(draw, w, h)
    return img


def poster_estate(size):
    w, h = size
    img = gradient_bg(w, h, (5, 12, 20), BG)
    draw = ImageDraw.Draw(img)
    logo_block(draw, 48, 48)
    code = fnt(72 if w >= 1200 else 56)
    txt = 'RK7M2P'
    draw.text(((w - draw.textlength(txt, font=code)) / 2, int(h * 0.22)), txt, fill=GREEN, font=code)
    subline(draw, w, int(h * 0.22) + 90, 'Estate join code — share on WhatsApp')
    card_w = int(w * 0.82)
    x0 = (w - card_w) // 2
    y = int(h * 0.42)
    for msg, col in [
        ('🆘 Neighbor SOS — 400m away', GREEN),
        ('Chairman · Security · Family notified', AMBER),
    ]:
        rr(draw, (x0, y, x0 + card_w, y + 88), 16, BG2, col)
        draw.text((x0 + 20, y + 28), msg, fill=WHITE, font=fnt(22))
        y += 108
    headline(draw, w, h, ['One code.', 'Whole estate protected.'], y_ratio=0.68, size=40)
    footer_cta(draw, w, h, sub='Estate watch · Free')
    return img


def poster_map(size):
    w, h = size
    img = gradient_bg(w, h)
    draw = ImageDraw.Draw(img)
    logo_block(draw, 48, 48)
    draw_nigeria_outline(draw, w // 2, int(h * 0.34), 1.2 if w >= 1200 else 0.85)
    headline(draw, w, h, ['Know the road', 'before you enter.'], y_ratio=0.58, size=44)
    subline(draw, w, int(h * 0.58) + 110, 'Abuja–Kaduna · Lokoja · community reports live')
    chips = ['Offline packs', 'Low data', 'Confirm alerts']
    cx = w // 2 - (len(chips) * 180) // 2
    for i, c in enumerate(chips):
        rr(draw, (cx + i * 190, h - 200, cx + i * 190 + 170, h - 155), 12, BG2, GREEN)
        draw.text((cx + i * 190 + 16, h - 188), c, fill=GREEN, font=fnt(16))
    footer_cta(draw, w, h)
    return img


def poster_citizen(size):
    w, h = size
    img = Image.new('RGB', size, BG)
    draw = ImageDraw.Draw(img)
    logo_block(draw, 48, 48)
    t = fnt(56 if w >= 1200 else 42)
    draw.text((48, int(h * 0.28)), 'Your people.', fill=GREEN, font=t)
    draw.text((48, int(h * 0.28) + 70), 'Not government.', fill=WHITE, font=t)
    bullets = [
        'Circle alerts on panic',
        'Neighbors tap “I’m on my way”',
        'Report danger anonymously',
        'Built for ₦500/day data',
    ]
    y = int(h * 0.48)
    for b in bullets:
        draw.ellipse((56, y + 8, 68, y + 20), fill=GREEN)
        draw.text((84, y), b, fill=SUB, font=fnt(22, bold=False))
        y += 48
    footer_cta(draw, w, h)
    return img


def poster_whatsapp(size):
    w, h = size
    img = gradient_bg(w, h, (8, 20, 14), BG)
    draw = ImageDraw.Draw(img)
    logo_block(draw, 48, 48)
    bubble_w = int(w * 0.78)
    x0 = (w - bubble_w) // 2
    msgs = [
        ('Mama', 'Be careful on Kaduna road o! 3 reports today 🚨', GREEN),
        ('SafeAlert', 'Critical zone: Rijana stretch — 12 confirmations', RED),
        ('You', 'Adding Uncle T to my circle tonight ✅', (100, 180, 255)),
    ]
    y = int(h * 0.18)
    for who, msg, col in msgs:
        rr(draw, (x0, y, x0 + bubble_w, y + 100), 18, BG2, col)
        draw.text((x0 + 16, y + 12), who, fill=col, font=fnt(14))
        for i, line in enumerate(wrap(draw, msg, fnt(18, bold=False), bubble_w - 32)):
            draw.text((x0 + 16, y + 38 + i * 24), line, fill=WHITE, font=fnt(18, bold=False))
        y += 118
    headline(draw, w, h, ['Share alerts', 'on WhatsApp.'], y_ratio=0.72, size=38)
    footer_cta(draw, w, h)
    return img


def poster_travel(size):
    w, h = size
    img = gradient_bg(w, h, (8, 8, 24), (20, 8, 12))
    draw = ImageDraw.Draw(img)
    logo_block(draw, 48, 48)
    routes = ['Abuja → Kaduna', 'Lagos → Ibadan', 'PH → Owerri', 'Kano → Kaduna']
    y = int(h * 0.2)
    for r in routes:
        rr(draw, (80, y, w - 80, y + 56), 14, BG2, SUB)
        draw.text((100, y + 14), r, fill=WHITE, font=fnt(22))
        rr(draw, (w - 200, y + 10, w - 100, y + 46), 10, (40, 12, 12) if 'Kaduna' in r and 'Abuja' in r else (12, 40, 24))
        status = '3 alerts' if 'Kaduna' in r and 'Abuja' in r else 'Clear'
        draw.text((w - 185, y + 18), status, fill=RED if status != 'Clear' else GREEN, font=fnt(14))
        y += 68
    headline(draw, w, h, ['Check routes', 'before you travel.'], y_ratio=0.62, size=42)
    footer_cta(draw, w, h)
    return img


def poster_helper(size):
    w, h = size
    img = gradient_bg(w, h, BG, (8, 24, 16))
    draw = ImageDraw.Draw(img)
    logo_block(draw, 48, 48)
    rr(draw, (int(w * 0.1), int(h * 0.22), int(w * 0.9), int(h * 0.42)), 20, BG2, GREEN)
    draw.text((int(w * 0.14), int(h * 0.26)), 'Citizen SOS · Alert #K4M2P9', fill=SUB, font=fnt(16))
    draw.text((int(w * 0.14), int(h * 0.32)), '✅ Amina is on the way', fill=GREEN, font=fnt(36))
    draw.text((int(w * 0.14), int(h * 0.38)), 'ETA ~6 min · 1.2 km away', fill=WHITE, font=fnt(20, bold=False))
    headline(draw, w, h, ['Help is coming.', 'No dispatch wait.'], y_ratio=0.58, size=44)
    footer_cta(draw, w, h)
    return img


def poster_free(size):
    w, h = size
    img = Image.new('RGB', size, BG)
    draw = ImageDraw.Draw(img)
    cx, cy = w // 2, int(h * 0.38)
    for i in range(3):
        rr(draw, (cx - 200 - i * 20, cy - 200 - i * 20, cx + 200 + i * 20, cy + 200 + i * 20), 200, (18, 183, 106) if i == 0 else BG2)
    t = fnt(80 if w >= 1200 else 60)
    draw.text((cx - draw.textlength('FREE', font=t) / 2, cy - 50), 'FREE', fill=WHITE, font=t)
    headline(draw, w, h, ['Add your circle tonight.'], y_ratio=0.62, size=40)
    subline(draw, w, int(h * 0.62) + 70, 'Before the next journey · safealert.ng/app')
    footer_cta(draw, w, h, sub='No subscription · Community-powered')
    return img


def poster_chairman(size):
    w, h = size
    img = gradient_bg(w, h, (5, 16, 12), BG)
    draw = ImageDraw.Draw(img)
    logo_block(draw, 48, 48)
    draw.text((48, int(h * 0.2)), 'For estate chairmen', fill=AMBER, font=fnt(22))
    steps = [
        '1. Register your estate on SafeAlert',
        '2. Share join code on WhatsApp group',
        '3. Every panic alerts all members',
    ]
    y = int(h * 0.28)
    for s in steps:
        rr(draw, (48, y, w - 48, y + 64), 14, BG2, GREEN)
        draw.text((64, y + 18), s, fill=WHITE, font=fnt(20, bold=False))
        y += 80
    headline(draw, w, h, ['Protect your estate', 'in 5 minutes.'], y_ratio=0.68, size=38)
    footer_cta(draw, w, h)
    return img


def poster_data_saver(size):
    w, h = size
    img = Image.new('RGB', size, BG)
    draw = ImageDraw.Draw(img)
    logo_block(draw, 48, 48)
    bars = [90, 70, 45, 30, 20]
    bx = w // 2 - 120
    by = int(h * 0.25)
    for i, pct in enumerate(bars):
        hh = int(180 * pct / 100)
        rr(draw, (bx + i * 55, by + 180 - hh, bx + i * 55 + 40, by + 180), 8, GREEN if i >= 2 else SUB)
    draw.text((bx, by + 200), 'Data saver mode', fill=WHITE, font=fnt(28))
    draw.text((bx, by + 240), 'Works on ₦500/day bundles', fill=SUB, font=fnt(20, bold=False))
    headline(draw, w, h, ['Low data.', 'Still protected.'], y_ratio=0.62, size=44)
    footer_cta(draw, w, h)
    return img


def poster_stores(size):
    w, h = size
    img = gradient_bg(w, h, BG, (8, 20, 14))
    draw = ImageDraw.Draw(img)
    logo_block(draw, 48, 48, scale=1.1 if w > 1200 else 0.85)

    title = fnt(48 if w > 1200 else 36, bold=True)
    draw.text((48, int(h * 0.22)), 'Free on', fill=SUB, font=fnt(28, bold=False))
    draw.text((48, int(h * 0.28)), 'iPhone & Android', fill=WHITE, font=title)

    y = int(h * 0.42)
    for label, sub, col in [
        ('App Store', 'iPhone · iPad', WHITE),
        ('Google Play', 'Android phones', GREEN),
    ]:
        bw = int(w * 0.84)
        bx = (w - bw) // 2
        rr(draw, (bx, y, bx + bw, y + 72), 16, (20, 24, 35), col)
        draw.text((bx + 24, y + 14), label, fill=col if col == GREEN else WHITE, font=fnt(24, bold=True))
        draw.text((bx + 24, y + 44), sub, fill=SUB, font=fnt(16, bold=False))
        y += 88

    cap = fnt(26, bold=True)
    draw.text((48, h - 110), 'safealert.ng/app/download', fill=GREEN, font=cap)
    return img


POSTERS = [
    ('sos', poster_sos),
    ('estate', poster_estate),
    ('map', poster_map),
    ('citizen', poster_citizen),
    ('whatsapp', poster_whatsapp),
    ('travel', poster_travel),
    ('helper', poster_helper),
    ('free', poster_free),
    ('chairman', poster_chairman),
    ('data-saver', poster_data_saver),
    ('stores', poster_stores),
]


def main():
    os.makedirs(ROOT, exist_ok=True)
    manifest = {'posters': [], 'generated': []}

    for name, builder in POSTERS:
        for label, size in SIZES.items():
            path = os.path.join(ROOT, f'{name}-{label}.png')
            builder(size).save(path, 'PNG', optimize=True)
            rel = f'posters/{name}-{label}.png'
            manifest['posters'].append({'id': name, 'format': label, 'file': rel, 'size': list(size)})
            print('Wrote', path)

    manifest_path = os.path.join(ROOT, 'manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f'Done — {len(manifest["posters"])} posters in {ROOT}')


if __name__ == '__main__':
    main()
