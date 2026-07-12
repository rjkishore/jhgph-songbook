# நித்திய ஜீவன் பாடல்கள் — NJP Chords App

Offline Progressive Web App (PWA) for the **Nithiya Jeevan Padalgal** Tamil
Christian songbook — 2,611 songs with Tamil lyrics, chords, key, tempo & style.

Standalone repo — location: `D:\RK Software\Chords`

## Features

- **2,611 songs** with clean Tamil lyrics
- **993 songs** with chord progressions (shown in **red** above the lyrics)
- **888 songs** with key / tempo / style info
- **Search** by song number (`0001`) or title (Tamil or English)
- **"Chords only" toggle** — list & search restrict to songs that have chords
- **Transpose** — shift chords up/down to any key
- **Light / dark theme** (remembered)
- **Fully offline** — installable, works with no internet

## Files

```
Chords/
├── index.html        ← the app (self-contained)
├── songs.json        ← all song data (lyrics + chords)
├── manifest.json     ← PWA manifest (install metadata)
├── sw.js             ← service worker (offline cache)
├── icon-192/512/maskable.png
└── tools/
    ├── update.py            ← re-run to fetch newly added chords
    ├── run_update.cmd       ← wrapper run by the weekly scheduled task
    ├── godsmusic_deep.py    ← matcher: thegodsmusic.com (Tamil-based)
    ├── fuzzy_chords.py      ← matcher: tamilchristiansongs.in (fuzzy)
    └── godsmusic_cache.pkl  ← cached crawl (speeds up re-runs)
```

## Install on a phone / tablet

1. Open the app URL in Chrome (Android) or Safari (iOS)
2. Menu → **"Add to Home Screen" / "Install app"**
3. It now opens like a native app and works **offline** anywhere

## Deploy (host it online)

The app is static — host this folder anywhere over HTTPS (Netlify, GitHub
Pages, etc.). Offline install requires HTTPS. `localhost` works for testing:

```
python -m http.server 8765
# open http://localhost:8765/index.html
```

---

## How chords stay up to date (future new songs)

Chords come from two public sites that keep adding songs:
[tamilchristiansongs.in](https://tamilchristiansongs.in) and
[thegodsmusic.com](https://thegodsmusic.com).

When they add new songs, re-run the updater:

```bash
cd tools
python update.py
```

It looks **only** at songs that still have no chords, searches both sites,
**validates every match by comparing the actual Tamil lyrics** (so a wrong song
with a similar title is never accepted), stores any new chords, and regenerates
`songs.json`. Then redeploy (git push). Devices auto-update: the service worker
uses *stale-while-revalidate* on `songs.json`, so the next time a device is
online it silently pulls the new data — no reinstall.

### Automatic weekly update

A Windows scheduled task **"NJP Chord Update"** runs `tools/run_update.cmd`
every Sunday at 10 AM (or when the PC is next available). It refreshes
`songs.json`, commits, and pushes. Output is logged to `tools/update.log`.

### Requirements for the updater

```bash
pip install requests beautifulsoup4
```

The updater reads/writes the VerseVIEW databases (`default.db`, `chords.db`) so
VerseVIEW and this app stay in sync.

---

## Getting chords for songs not on either site

~1,618 songs have no online chord source. Future options:

1. **Manual entry** — type chords for the songs you use most
2. **Audio detection** — paste a YouTube link and auto-detect chords from audio

## Data notes

- Lyrics were OCR'd from the original PDF (Tesseract, Tamil).
- Section markers (பல்லவி / சரணங்கள் / அனுபல்லவி / கோரஸ்) and OCR tempo-line
  junk were stripped from titles and lyrics.
- Chord alignment is preserved from the source (chord names sit above the exact
  syllable where the change happens).
