# Record the SafeAlert ad video (75 seconds)

## Quick method (5 minutes)

1. Start the app locally:
   ```bash
   cd /Users/jamesbod/Downloads/SafeAlert && npm run dev
   ```

2. Open in Chrome (full screen):
   ```
   http://localhost:3000/app/marketing/safealert-ad.html?autoplay=1
   ```

3. **Screen record** (macOS: QuickTime → New Screen Recording, or Cmd+Shift+5):
   - Crop to phone frame (430px wide) for **9:16 Reels/TikTok**
   - Or widen browser for **16:9 YouTube**

4. **Voice:** Nigerian neural VO is built in (`audio/scene-*.mp3`) — no browser robot voice. Click **▶ Play ad** (sound on).

Regenerate VO after script changes:
```bash
python3 scripts/generate-ad-voiceover.py
```

---

## Professional method (real Nigerian voice actor)

1. Send `VO_SCRIPT.md` to a Nigerian VO on Fiverr / local studio (~₦15k–50k).
2. Export 7 WAV files → `public/marketing/audio/scene-01.wav` … `scene-07.wav`.
3. Edit in **CapCut** (free):
   - Import screen recording + scene PNGs + VO
   - Add subtle tension music (low volume under voice)
   - Export 1080×1920 (Reels) and 1920×1080 (YouTube)

---

## Replace AI scenes with real filmed B-roll

| File | Film this instead |
|------|-------------------|
| `ad-scene-driver.png` | Nigerian driver checking phone before highway |
| `ad-scene-panic.png` | Close-up thumb on phone SOS (use real app) |
| `ad-scene-helper.png` | Neighbor in estate looking at notification |

Swap PNG paths in `safealert-ad.html` for `<video autoplay muted loop>` tags.

---

## WhatsApp / estate distribution

- **15s cut:** Scene 3 (SOS) + caption “Add your circle — free”
- **Estate chairman:** Scene 4 + join code demo + link to `/app/?estate=CODE`
- Host poster: `poster.png`
