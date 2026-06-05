#!/usr/bin/env python3
"""Add SafeAlert branding overlays to AI photo posters."""
import json
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '../public/marketing/posters')
PHOTOS = os.path.join(ROOT, 'photos')
FONT_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
GREEN = (18, 183, 106)
WHITE = (255, 255, 255)
SUB = (200, 210, 225)

OVERLAYS = {
    'poster-travel-check.png': {
        'headline': ['Check the road', 'before you enter.'],
        'sub': 'SafeAlert NG · Live community map',
    },
    'poster-estate-watch.png': {
        'headline': ['One join code.', 'Whole estate protected.'],
        'sub': 'Estate watch · Share on WhatsApp',
    },
    'poster-sos-closeup.png': {
        'headline': ['Hold SOS 3 seconds.'],
        'sub': 'Circle gets live GPS instantly',
    },
    'poster-whatsapp-community.png': {
        'headline': ['Your people.', 'Not government.'],
        'sub': 'Citizen-powered safety',
    },
    'poster-campus-safety.png': {
        'headline': ['Campus routes.', 'Community alerts.'],
        'sub': 'Stay aware after dark',
    },
    'poster-driver-danfo.png': {
        'headline': ['Long trip?', 'Check alerts first.'],
        'sub': 'Abuja–Kaduna · community reports',
    },
    'poster-market-alert.png': {
        'headline': ['See something?', 'Report in seconds.'],
        'sub': 'Market · church · bus stop — your area',
    },
}


def fnt(size):
    try:
        return ImageFont.truetype(FONT_BOLD, size)
    except OSError:
        return ImageFont.load_default()


def brand_photo(src_name, meta, size_label, out_w, out_h):
    src = os.path.join(PHOTOS, src_name)
    if not os.path.isfile(src):
        return None
    base = Image.open(src).convert('RGB')
    sw, sh = base.size
    scale = max(out_w / sw, out_h / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    base = base.resize((nw, nh), Image.Resampling.LANCZOS)
    img = Image.new('RGB', (out_w, out_h), (5, 8, 16))
    img.paste(base, ((out_w - nw) // 2, (out_h - nh) // 2))

    overlay = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((0, out_h - 280, out_w, out_h), fill=(0, 0, 0, 200))
    draw.rectangle((0, 0, out_w, 120), fill=(0, 0, 0, 140))
    draw.text((40, 36), 'SafeAlert NG', fill=(*GREEN, 255), font=fnt(32))

    y = out_h - 240
    for line in meta['headline']:
        fs = fnt(44 if out_w >= 1200 else 38)
        tw = draw.textlength(line, font=fs)
        draw.text(((out_w - tw) / 2, y), line, fill=(*WHITE, 255), font=fs)
        y += 52
    sub = fnt(20)
    st = meta['sub']
    draw.text(((out_w - draw.textlength(st, font=sub)) / 2, out_h - 70), st, fill=(*SUB, 255), font=sub)
    draw.text(((out_w - draw.textlength('safealert.ng/app', font=sub)) / 2, out_h - 38), 'safealert.ng/app', fill=(*GREEN, 255), font=sub)

    return Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')


def main():
    os.makedirs(PHOTOS, exist_ok=True)
    manifest = []
    for src, meta in OVERLAYS.items():
        slug = src.replace('poster-', '').replace('.png', '')
        for label, (w, h) in [('story', (1080, 1920)), ('square', (1080, 1080)), ('landscape', (1920, 1080))]:
            out = brand_photo(src, meta, label, w, h)
            if out is None:
                continue
            path = os.path.join(PHOTOS, f'{slug}-branded-{label}.png')
            out.save(path, 'PNG', optimize=True)
            manifest.append({'file': f'posters/photos/{slug}-branded-{label}.png', 'theme': slug, 'format': label})
            print('Wrote', path)

    with open(os.path.join(PHOTOS, 'branded-manifest.json'), 'w', encoding='utf-8') as f:
        json.dump({'branded': manifest}, f, indent=2)


if __name__ == '__main__':
    main()
