#!/usr/bin/env python3
"""
Build professional SafeAlert NG marketing videos (16:9, 9:16, 30s cut).
Requires: ffmpeg, ffprobe, Pillow (run generate-ad-scene-art.py first).
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
MKT = os.path.join(ROOT, 'public/marketing')
EXPORT = os.path.join(MKT, 'export')
AUDIO = os.path.join(MKT, 'audio')
FONT_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
PAUSE_S = 0.45
FPS = 30
GREEN = (18, 183, 106)

SCENES = [
    {
        'audio': 'scene-01.mp3',
        'caption': 'Every day, Nigerians travel roads we know are risky. Who warns you — before you enter?',
        'image_16': os.path.join(MKT, 'ad-scene-driver.png'),
        'image_9': os.path.join(MKT, 'ad-scene-driver.png'),
    },
    {
        'audio': 'scene-02.mp3',
        'caption': 'SafeAlert shows community reports — live. Your people. Not government.',
        'image_16': os.path.join(EXPORT, 'ad-scene-map-16x9.png'),
        'image_9': os.path.join(EXPORT, 'ad-scene-map-9x16.png'),
    },
    {
        'audio': 'scene-03.mp3',
        'caption': 'Hold SOS 3 seconds. Circle gets live location — instantly.',
        'image_16': os.path.join(MKT, 'ad-scene-panic.png'),
        'image_9': os.path.join(MKT, 'ad-scene-panic.png'),
    },
    {
        'audio': 'scene-04.mp3',
        'caption': 'Estate join code → all neighbors alerted on panic.',
        'image_16': os.path.join(EXPORT, 'ad-scene-estate-16x9.png'),
        'image_9': os.path.join(EXPORT, 'ad-scene-estate-9x16.png'),
    },
    {
        'audio': 'scene-05.mp3',
        'caption': 'Neighbor taps “I’m on my way.” Help is coming.',
        'image_16': os.path.join(MKT, 'ad-scene-helper.png'),
        'image_9': os.path.join(MKT, 'ad-scene-helper.png'),
    },
    {
        'audio': 'scene-06.mp3',
        'caption': 'Report · confirm · share. Built for low data.',
        'image_16': os.path.join(EXPORT, 'ad-scene-community-16x9.png'),
        'image_9': os.path.join(EXPORT, 'ad-scene-community-9x16.png'),
    },
    {
        'audio': 'scene-07.mp3',
        'caption': 'SafeAlert NG — free. Add your circle before the next journey.',
        'image_16': os.path.join(MKT, 'poster.png'),
        'image_9': os.path.join(MKT, 'poster.png'),
    },
]

# 30s social cut: scenes 1,3,5,7 (0-indexed 0,2,4,6)
SHORT_INDICES = [0, 2, 4, 6]


def ffprobe_duration(path):
    out = subprocess.check_output(
        [
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', path,
        ],
        text=True,
    ).strip()
    return float(out)


def load_font(size):
    try:
        return ImageFont.truetype(FONT_BOLD, size)
    except OSError:
        return ImageFont.load_default()


def wrap_text(text, font, max_width, draw):
    words = text.split()
    lines, line = [], []
    for word in words:
        trial = ' '.join(line + [word])
        if draw.textlength(trial, font=font) <= max_width:
            line.append(word)
        else:
            if line:
                lines.append(' '.join(line))
            line = [word]
    if line:
        lines.append(' '.join(line))
    return lines


def prepare_frame(source, caption, aspect, out_path):
    w, h = (1920, 1080) if aspect == '16x9' else (1080, 1920)
    src = Image.open(source).convert('RGB')
    sw, sh = src.size
    scale = max(w / sw, h / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    src = src.resize((nw, nh), Image.Resampling.LANCZOS)
    img = Image.new('RGB', (w, h), (5, 8, 16))
    img.paste(src, ((w - nw) // 2, (h - nh) // 2))

    overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((0, h - 160, w, h), fill=(0, 0, 0, 150))
    draw.rectangle((0, 0, w, 100), fill=(0, 0, 0, 90))

    logo = load_font(32 if w > 1200 else 26)
    draw.text((48, 36), 'SafeAlert NG', fill=(*GREEN, 255), font=logo)

    cap_font = load_font(38 if w > 1200 else 30)
    lines = wrap_text(caption, cap_font, w - 120, draw)
    y = h - 130 + (2 - len(lines)) * 22
    for line in lines:
        tw = draw.textlength(line, font=cap_font)
        draw.text(((w - tw) / 2, y), line, fill=(255, 255, 255, 255), font=cap_font)
        y += 44

    img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
    img.save(out_path, 'PNG', optimize=True)
    return out_path


def build_segment(scene, aspect, out_path, tmp_dir, add_pause=True):
    w, h = (1920, 1080) if aspect == '16x9' else (1080, 1920)
    image = scene['image_16'] if aspect == '16x9' else scene['image_9']

    audio_path = os.path.join(AUDIO, scene['audio'])
    dur = ffprobe_duration(audio_path)
    if add_pause:
        dur += PAUSE_S
    frames = max(1, int(dur * FPS))

    frame_path = os.path.join(tmp_dir, f'frame_{os.path.basename(out_path)}.png')
    prepare_frame(image, scene['caption'], aspect, frame_path)

    vf = (
        f"[0:v]zoompan=z='min(zoom+0.0006,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d={frames}:s={w}x{h}:fps={FPS},"
        f"eq=brightness=-0.03:contrast=1.06:saturation=1.04,"
        f"fade=t=in:st=0:d=0.35,fade=t=out:st={max(0, dur - 0.35):.3f}:d=0.35[v]"
    )

    cmd = [
        'ffmpeg', '-y', '-loop', '1', '-i', frame_path, '-i', audio_path,
        '-filter_complex', vf + f";[1:a]apad=whole_dur={dur}[a]",
        '-map', '[v]', '-map', '[a]',
        '-t', f'{dur:.3f}',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
        out_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode:
        print(result.stderr[-2000:], file=sys.stderr)
        result.check_returncode()
    return dur


def concat_segments(segment_paths, out_path):
    lst = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
    for p in segment_paths:
        lst.write(f"file '{p}'\n")
    lst.close()
    subprocess.run(
        [
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', lst.name,
            '-c', 'copy', out_path,
        ],
        check=True,
        capture_output=True,
    )
    os.unlink(lst.name)


def add_music(in_path, out_path, duration):
    """Mix subtle ambient bed under voiceover."""
    cmd = [
        'ffmpeg', '-y', '-i', in_path,
        '-f', 'lavfi', '-i', f'anoisesrc=color=brown:duration={duration:.2f}:sample_rate=48000,volume=0.012',
        '-f', 'lavfi', '-i', f'sine=frequency=82:duration={duration:.2f}:sample_rate=48000,volume=0.006',
        '-filter_complex',
        '[1:a][2:a]amix=inputs=2:duration=first[music];'
        '[0:a][music]amix=inputs=2:duration=first:weights=1 0.35[aout]',
        '-map', '0:v', '-map', '[aout]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        out_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def write_srt(scenes, durations, path):
    t = 0.0
    lines = []
    for i, (scene, dur) in enumerate(zip(scenes, durations), 1):
        start = t
        end = t + dur - PAUSE_S
        t += dur

        def ts(sec):
            h = int(sec // 3600)
            m = int((sec % 3600) // 60)
            s = int(sec % 60)
            ms = int((sec % 1) * 1000)
            return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'

        lines.append(str(i))
        lines.append(f'{ts(start)} --> {ts(end)}')
        lines.append(scene['caption'])
        lines.append('')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))


def build_video(aspect, name, indices=None):
    os.makedirs(EXPORT, exist_ok=True)
    scene_list = [SCENES[i] for i in (indices or range(len(SCENES)))]
    tmp_dir = tempfile.mkdtemp(prefix='safealert-ad-')
    segments = []
    durations = []

    for i, scene in enumerate(scene_list):
        seg = os.path.join(tmp_dir, f'seg_{i:02d}.mp4')
        is_last = i == len(scene_list) - 1
        dur = build_segment(scene, aspect, seg, tmp_dir, add_pause=not is_last)
        segments.append(seg)
        durations.append(dur)
        print(f'  segment {i + 1}/{len(scene_list)} — {dur:.1f}s')

    raw = os.path.join(tmp_dir, 'raw.mp4')
    concat_segments(segments, raw)

    total = sum(durations)
    final = os.path.join(EXPORT, name)
    add_music(raw, final, total)
    print(f'Exported {final} ({total:.1f}s)')

    srt_name = name.replace('.mp4', '.srt')
    write_srt(scene_list, durations, os.path.join(EXPORT, srt_name))

    for p in segments:
        os.unlink(p)
    os.unlink(raw)
    shutil.rmtree(tmp_dir, ignore_errors=True)
    return final, total


def main():
    for bin_name in ('ffmpeg', 'ffprobe'):
        if subprocess.run(['which', bin_name], capture_output=True).returncode:
            sys.exit(f'{bin_name} not found — install with: brew install ffmpeg')

    art_script = os.path.join(os.path.dirname(__file__), 'generate-ad-scene-art.py')
    subprocess.run([sys.executable, art_script], check=True)

    manifest = {'exports': [], 'generated_at': __import__('datetime').datetime.utcnow().isoformat() + 'Z'}

    print('\n=== 16:9 YouTube / TV ===')
    p, d = build_video('16x9', 'safealert-ad-16x9.mp4')
    manifest['exports'].append({'file': 'safealert-ad-16x9.mp4', 'aspect': '16:9', 'duration_s': round(d, 2)})

    print('\n=== 9:16 Reels / TikTok / WhatsApp Status ===')
    p, d = build_video('9x16', 'safealert-ad-9x16.mp4')
    manifest['exports'].append({'file': 'safealert-ad-9x16.mp4', 'aspect': '9:16', 'duration_s': round(d, 2)})

    print('\n=== 30s social cut ===')
    p, d = build_video('9x16', 'safealert-ad-30s.mp4', indices=SHORT_INDICES)
    manifest['exports'].append({'file': 'safealert-ad-30s.mp4', 'aspect': '9:16', 'duration_s': round(d, 2), 'cut': '30s'})

    manifest_path = os.path.join(EXPORT, 'manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print('\nDone — files in public/marketing/export/')


if __name__ == '__main__':
    main()
