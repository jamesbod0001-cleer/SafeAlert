# SafeAlert NG — 75s TV / Social Ad Voiceover (Nigerian English)

**Tone:** Calm, urgent when needed, trustworthy — like a trusted neighbor, not a government announcement.  
**Accent:** Nigerian English (Lagos/Abuja neutral). Optional Pidgin line in scene 4.  
**Pace:** ~130 words/minute  

---

## Scene 1 — Hook (0:00–0:08)
**Visual:** Driver on highway at night, checking phone  
**VO:**
> Every day, Nigerians travel roads we already know are risky. Kidnapping. Robbery. One-chance. Who warns you — before you enter?

---

## Scene 2 — Map (0:08–0:18)
**Visual:** SafeAlert map with danger zones  
**VO:**
> SafeAlert NG shows you what your community is reporting — right now. Danger zones. Hot routes. Offline packs for when network fails. Your people. Not government.

---

## Scene 3 — Panic (0:18–0:28)
**Visual:** Finger on SOS button  
**VO:**
> In trouble? Hold SOS for three seconds. Your safety circle gets your live location — on WhatsApp and push. Instantly.

---

## Scene 4 — Estate watch (0:28–0:40)
**Visual:** Notifications to neighbors / estate  
**VO:**
> Your estate chairman shares one join code. When anyone panics, neighbors get alert — security, family, trusted people nearby. Na your community dey respond.

---

## Scene 5 — Helper (0:40–0:52)
**Visual:** Neighbor sees alert, taps “I’m on my way”  
**VO:**
> Someone nearby taps “I’m on my way.” You get the message: help is coming. No waiting for official dispatch. Citizens saving citizens.

---

## Scene 6 — Report (0:52–1:05)
**Visual:** Community reporting on map  
**VO:**
> See something? Report it in seconds — anonymous if you want. Confirm false alerts. Download state maps on Wi‑Fi. Data saver for small bundles.

---

## Scene 7 — CTA (1:05–1:15)
**Visual:** Logo + poster + “Download free”  
**VO:**
> SafeAlert NG. Built for Nigerians. Powered by community. Free to use. Add your circle tonight — before the next journey.

---

## Voice (built-in)

The ad uses **Microsoft Nigerian English neural voices** (free, generated locally):

| Voice | Gender | Scenes |
|-------|--------|--------|
| `en-NG-EzinneNeural` | Female | 1, 2, 4, 6, 7 |
| `en-NG-AbeoNeural` | Male | 3, 5 |

Regenerate after script edits:

```bash
python3 scripts/generate-ad-voiceover.py
```

Files land in `public/marketing/audio/scene-01.mp3` … `scene-07.mp3`.

For a **100% human** actor, replace those MP3s with studio recordings (same filenames).

---

## Recording notes

- Record **dry** (no music). Export **WAV 48kHz**.  
- Place files in `public/marketing/audio/` as `scene-01.wav` … `scene-07.wav` to replace browser TTS.  
- For **real filmed humans**, replace PNG scenes with MP4 clips (same duration).  

## Social cuts

| Format | Length | Focus |
|--------|--------|--------|
| TikTok/Reels | 30s | Scenes 1, 3, 5, 7 |
| WhatsApp Status | 15s | Scene 3 + “Add your circle” |
| Estate WhatsApp | 45s | Scenes 4, 3, 7 |
