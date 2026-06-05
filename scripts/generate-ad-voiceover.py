#!/usr/bin/env python3
"""Generate SafeAlert ad voiceover with Microsoft en-NG neural voices."""
import asyncio
import json
import os
import edge_tts

OUT_DIR = os.path.join(os.path.dirname(__file__), '../public/marketing/audio')
VOICE_FEMALE = 'en-NG-EzinneNeural'
VOICE_MALE = 'en-NG-AbeoNeural'

SCENES = [
    {
        'file': 'scene-01.mp3',
        'voice': VOICE_FEMALE,
        'text': (
            'Every day, Nigerians travel roads we already know are risky. '
            'Kidnapping. Robbery. One-chance. Who warns you — before you enter?'
        ),
    },
    {
        'file': 'scene-02.mp3',
        'voice': VOICE_FEMALE,
        'text': (
            'SafeAlert NG shows you what your community is reporting — right now. '
            'Danger zones. Hot routes. Offline packs when network fails. '
            'Your people. Not government.'
        ),
    },
    {
        'file': 'scene-03.mp3',
        'voice': VOICE_MALE,
        'text': (
            'In trouble? Hold SOS for three seconds. '
            'Your safety circle gets your live location — on WhatsApp and push. Instantly.'
        ),
    },
    {
        'file': 'scene-04.mp3',
        'voice': VOICE_FEMALE,
        'text': (
            'Your estate chairman shares one join code. '
            'When anyone panics, neighbors get alert — security, family, trusted people nearby. '
            'Na your community dey respond.'
        ),
    },
    {
        'file': 'scene-05.mp3',
        'voice': VOICE_MALE,
        'text': (
            'Someone nearby taps I am on the way. You get the message: help is coming. '
            'No waiting for official dispatch. Citizens saving citizens.'
        ),
    },
    {
        'file': 'scene-06.mp3',
        'voice': VOICE_FEMALE,
        'text': (
            'See something? Report it in seconds. Confirm false alerts. '
            'Download state maps on Wi-Fi. Data saver for small bundles.'
        ),
    },
    {
        'file': 'scene-07.mp3',
        'voice': VOICE_FEMALE,
        'text': (
            'SafeAlert NG. Built for Nigerians. Powered by community. Free to use. '
            'Add your circle tonight — before the next journey.'
        ),
    },
]


async def generate_one(scene):
    path = os.path.join(OUT_DIR, scene['file'])
    communicate = edge_tts.Communicate(scene['text'], scene['voice'], rate='-5%')
    await communicate.save(path)
    return path


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = []
    for i, scene in enumerate(SCENES):
        path = await generate_one(scene)
        print('Wrote', path)
        manifest.append(
            {
                'file': f'audio/{scene["file"]}',
                'voice': scene['voice'],
                'index': i,
            }
        )
    manifest_path = os.path.join(OUT_DIR, 'manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump({'scenes': manifest, 'voices': [VOICE_FEMALE, VOICE_MALE]}, f, indent=2)
    print('Done —', len(SCENES), 'tracks in', OUT_DIR)


if __name__ == '__main__':
    asyncio.run(main())
