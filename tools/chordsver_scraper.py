#!/usr/bin/env python3
"""
chordsver_scraper.py
Scrapes Tamil Christian chords from chordsver.com and merges into songs.json.

Structure per song page:
  <pre> contains everything:
    - "KEY: X" header line
    - Chord lines: <span class="scale-key">Am</span>  ...
    - Lyric lines (transliteration): plain text
    - Section headers: "Verse 1", "[Chorus]", etc.
    - "C H O R D S V E R . C O M" watermark (skip)
    - "Tamil Lyrics" separator
    - Tamil lyric lines (after the separator)

Strategy:
  1. Split <pre> at "Tamil Lyrics" → English section + Tamil section
  2. English section: identify chord lines (have span.scale-key) vs lyric lines
     → pair each lyric line with its preceding chord line(s)
     → group into slides by blank lines / section headers
  3. Tamil section: collect Tamil lines, group into slides by blank lines
  4. Zip: chord from English[i] → Tamil line[i] per slide

Run: python -u chordsver_scraper.py
"""

import json, re, sys, time
from pathlib import Path

import requests
from bs4 import BeautifulSoup, NavigableString

BASE       = Path(__file__).parent.parent
SONGS_JSON = BASE / 'songs.json'
CACHE_DIR  = Path(__file__).parent / 'cv_cache'
CACHE_DIR.mkdir(exist_ok=True)

BASE_URL   = 'https://www.chordsver.com'
NEW_ID_START = 800001
HEADERS    = {'User-Agent': 'Mozilla/5.0 (compatible; NJPChords/1.0)'}
DELAY      = 0.6

TAMIL_RE   = re.compile(r'[஀-௿]')
WATERMARK  = re.compile(r'c\s*h\s*o\s*r\s*d\s*s\s*v\s*e\s*r', re.I)
SECTION_RE = re.compile(r'^\s*(\[.*?\]|verse|chorus|bridge|intro|outro|pre.chorus|tag|interlude)', re.I)

# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch(url, retries=3):
    for i in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.raise_for_status()
            return r.content
        except Exception as e:
            if i == retries - 1:
                print(f'  FAIL {url}: {e}', flush=True)
                return None
            time.sleep(2 ** i)

def cached_fetch(url, key):
    f = CACHE_DIR / f'{key}.html'
    if f.exists():
        return f.read_bytes()
    data = fetch(url)
    if data:
        f.write_bytes(data)
    return data

def normalize(s):
    return re.sub(r'\s+', ' ', (s or '').lower().strip())

def is_chord_line(tag):
    """True if this BeautifulSoup element is a chord line (has span.scale-key)."""
    if hasattr(tag, 'find'):
        return bool(tag.find('span', class_='scale-key'))
    return False

def get_chords_from_line(tag):
    """Extract chord names from a chord line."""
    chords = []
    for span in tag.find_all('span', class_='scale-key'):
        c = span.get_text(strip=True)
        if c:
            chords.append(c)
    return ' '.join(chords)

# ── Song list collection ──────────────────────────────────────────────────────

def get_song_urls():
    urls = []
    page = 1
    while True:
        url = f'{BASE_URL}/language/Tamil' + (f'?page={page}' if page > 1 else '')
        data = fetch(url)
        if not data:
            break
        soup = BeautifulSoup(data, 'html.parser')
        links = [a['href'] for a in soup.find_all('a', href=True)
                 if re.search(r'chordsver\.com/[^/]+/[^/]+-lyrics-chords', a['href'])]
        if not links:
            break
        new = [l for l in links if l not in urls]
        if not new:
            break
        urls.extend(new)
        print(f'  Page {page}: {len(links)} songs (total {len(urls)})', flush=True)
        page += 1
        time.sleep(DELAY)
    return list(dict.fromkeys(urls))

# ── Parse song page ───────────────────────────────────────────────────────────

def split_pre_lines(pre_tag):
    """
    Split the <pre> content into lines, preserving whether each line has
    chord spans. Returns list of (has_chords, chord_str, plain_text).
    """
    lines = []
    # Iterate children, split by \n
    current_chords = []
    current_text = []

    raw_html = str(pre_tag)
    # Work line by line on the inner HTML
    inner = pre_tag.decode_contents()
    for raw_line in inner.split('\n'):
        line_soup = BeautifulSoup(raw_line, 'html.parser')
        text = line_soup.get_text()
        has_spans = bool(line_soup.find('span', class_='scale-key'))
        chord_names = ' '.join(s.get_text(strip=True) for s in line_soup.find_all('span', class_='scale-key'))
        lines.append({'has_chords': has_spans, 'chord': chord_names, 'text': text.strip()})
    return lines

def parse_english_section(lines):
    """
    From English section lines, extract list of slides.
    Each slide = list of (chord, lyric) pairs.
    """
    slides = []
    current_slide = []
    pending_chord = ''

    for line in lines:
        text = line['text']

        # Skip empty, watermarks, key/bpm header
        if not text:
            # Blank line = new slide
            if current_slide:
                slides.append(current_slide)
                current_slide = []
                pending_chord = ''
            continue
        if WATERMARK.search(text):
            continue
        if re.match(r'^KEY:', text, re.I):
            continue
        if re.match(r'^ARTIST\s+INFO', text, re.I):
            break

        if line['has_chords']:
            # Accumulate chords (sometimes multiple chord lines before one lyric)
            pending_chord = (pending_chord + ' ' + line['chord']).strip() if pending_chord else line['chord']
        elif SECTION_RE.match(text):
            # Section header = slide break
            if current_slide:
                slides.append(current_slide)
                current_slide = []
            pending_chord = ''
        else:
            # Lyric line
            current_slide.append((pending_chord, text))
            pending_chord = ''

    if current_slide:
        slides.append(current_slide)
    return slides

def parse_tamil_section(lines):
    """
    From Tamil section lines, extract list of slides.
    Each slide = list of Tamil lyric strings.
    """
    slides = []
    current_slide = []

    for line in lines:
        text = line['text']
        if not text:
            if current_slide:
                slides.append(current_slide)
                current_slide = []
            continue
        if WATERMARK.search(text):
            continue
        if SECTION_RE.match(text):
            if current_slide:
                slides.append(current_slide)
                current_slide = []
            continue
        if re.match(r'^ARTIST\s+INFO|^SONGWRITER|^lyrics\s+©', text, re.I):
            break
        if re.match(r'^More\s+Tamil|^Tags:|^#', text, re.I):
            break
        if TAMIL_RE.search(text):
            current_slide.append(text)
        # Skip non-Tamil non-section lines in Tamil section

    if current_slide:
        slides.append(current_slide)
    return slides

def merge_slides(eng_slides, tam_slides):
    """
    Zip English chord info with Tamil lyrics.
    Falls back to English transliteration if Tamil is missing/mismatched.
    """
    chord_slides = []
    lyric_slides = []

    n = max(len(eng_slides), len(tam_slides))
    for i in range(n):
        eng = eng_slides[i] if i < len(eng_slides) else []
        tam = tam_slides[i] if i < len(tam_slides) else []

        # Prefer Tamil lines; fall back to English transliteration
        if tam and len(tam) == len(eng):
            lyric_lines = [t for t in tam]
        elif tam:
            lyric_lines = [t for t in tam]
            # Pad or trim chords to match Tamil line count
            eng_padded = eng + [('', '')] * max(0, len(tam) - len(eng))
            eng = eng_padded[:len(tam)]
        else:
            lyric_lines = [e[1] for e in eng]

        chord_lines = [e[0] for e in eng] if eng else [''] * len(lyric_lines)
        # Pad chord_lines if needed
        while len(chord_lines) < len(lyric_lines):
            chord_lines.append('')

        lyric_slides.append('<BR>'.join(lyric_lines))
        chord_slides.append('<br>'.join(chord_lines[:len(lyric_lines)]))

    return '<slide>'.join(chord_slides), '<slide>'.join(lyric_slides)

def parse_song(url):
    slug = url.rstrip('/').split('/')[-1]
    data = cached_fetch(url, slug)
    if not data:
        return None

    soup = BeautifulSoup(data, 'html.parser')

    # Title from <title> tag — extract Tamil if present
    page_title = soup.find('title')
    page_title_text = page_title.get_text() if page_title else ''
    # Pattern: "English Title (தமிழ் தலைப்பு) Lyrics & Chords by Artist"
    tamil_in_title = re.search(r'\(([஀-௿][^)]+)\)', page_title_text)
    tamil_title = tamil_in_title.group(1).strip() if tamil_in_title else ''
    # English title (before the Tamil part or "Lyrics & Chords")
    eng_title = re.sub(r'\s*\([^)]*\)\s*', ' ', page_title_text)
    eng_title = re.sub(r'\s*Lyrics\s*&\s*Chords.*', '', eng_title, flags=re.I).strip()

    # Key
    key = ''
    key_match = re.search(r'KEY:\s*([A-G][b#♭]?m?)', page_title_text + (soup.get_text()[:500]))
    if key_match:
        key = key_match.group(1)

    # Find <pre>
    pre = soup.find('pre')
    if not pre:
        return None

    # Split pre at "Tamil Lyrics"
    full_text = pre.get_text()
    split_idx = full_text.lower().find('tamil lyrics')
    if split_idx == -1:
        # No Tamil section — check if there's Tamil text anywhere in pre
        if not TAMIL_RE.search(full_text):
            return None

    all_lines = split_pre_lines(pre)

    # Find the Tamil Lyrics separator line index
    tamil_start = None
    for i, line in enumerate(all_lines):
        if re.match(r'tamil\s+lyrics', line['text'], re.I):
            tamil_start = i + 1
            break

    if tamil_start is not None:
        eng_lines = all_lines[:tamil_start - 1]
        tam_lines = all_lines[tamil_start:]
    else:
        eng_lines = all_lines
        tam_lines = []

    eng_slides = parse_english_section(eng_lines)
    tam_slides = parse_tamil_section(tam_lines)

    if not eng_slides and not tam_slides:
        return None

    chords, chord_lyrics = merge_slides(eng_slides, tam_slides)

    # If no Tamil at all, chord_lyrics will be English — skip unless we have Tamil title
    if not TAMIL_RE.search(chord_lyrics) and not tamil_title:
        return None

    return {
        'title': tamil_title,
        'name': eng_title,
        'key': key,
        'chord_lyrics': chord_lyrics,
        'chords': chords,
        'url': url,
    }

# ── Merge into songs.json ─────────────────────────────────────────────────────

def title_match(a, b):
    na, nb = normalize(a), normalize(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if na in nb or nb in na:
        return True
    return False

def main():
    print('== ChordsVer.com Scraper ==', flush=True)

    existing = json.loads(SONGS_JSON.read_text(encoding='utf-8'))
    print(f'Loaded {len(existing)} songs ({sum(1 for s in existing if s.get("chords"))} with chords)', flush=True)

    # Build title index
    title_index = {}
    for s in existing:
        for field in ('title', 'name'):
            t = normalize(s.get(field, ''))
            if t:
                title_index[t] = s

    max_id = max(s['id'] for s in existing)
    next_id = max(max_id + 1, NEW_ID_START)

    print('Collecting song URLs...', flush=True)
    all_urls = get_song_urls()
    print(f'Total songs: {len(all_urls)}', flush=True)

    chords_filled = new_songs = skipped = errors = 0

    for i, url in enumerate(all_urls, 1):
        result = parse_song(url)
        if result is None:
            errors += 1
        else:
            title = result['title']
            name  = result['name']
            chords = result['chords']
            chord_lyrics = result['chord_lyrics']
            key = result['key']

            matched = None
            for t in (title, name):
                nt = normalize(t)
                if nt and nt in title_index:
                    matched = title_index[nt]
                    break
            if not matched:
                for t in (title, name):
                    for et, song in title_index.items():
                        if title_match(t, song.get('title','') or song.get('name','')):
                            matched = song
                            break
                    if matched:
                        break

            if matched:
                if not matched.get('chords') and chords:
                    matched['chords'] = chords
                    matched['chord_lyrics'] = chord_lyrics
                    if not matched.get('key') and key:
                        matched['key'] = key
                    chords_filled += 1
                else:
                    skipped += 1
            else:
                if chord_lyrics and (TAMIL_RE.search(chord_lyrics) or title):
                    new_song = {
                        'id': next_id,
                        'num': '',
                        'name': name,
                        'title': title,
                        'lyrics': chord_lyrics,
                        'key': key,
                        'notes': key,
                        'chord_lyrics': chord_lyrics,
                        'chords': chords,
                        'source': 'cv',
                    }
                    existing.append(new_song)
                    if title: title_index[normalize(title)] = new_song
                    if name:  title_index[normalize(name)]  = new_song
                    next_id += 1
                    new_songs += 1
                else:
                    skipped += 1

        if i % 25 == 0 or i == len(all_urls):
            print(f'  [{i}/{len(all_urls)}] chords_filled={chords_filled} new={new_songs} skip={skipped} err={errors}', flush=True)
        time.sleep(DELAY)

    print(f'\nResults:', flush=True)
    print(f'  Chords filled: {chords_filled}', flush=True)
    print(f'  New songs:     {new_songs}', flush=True)
    print(f'  Skipped:       {skipped}', flush=True)
    print(f'  Errors:        {errors}', flush=True)

    print(f'\nSaving {len(existing)} songs...', flush=True)
    SONGS_JSON.write_text(
        json.dumps(existing, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8'
    )

    # Regenerate songs-index.json
    index = [{'i': s['id'], 'n': s.get('num',''), 't': s.get('title',''),
               'e': s.get('name',''), 'k': s.get('key',''),
               'c': 1 if s.get('chords') else 0} for s in existing]
    (BASE / 'songs-index.json').write_text(
        json.dumps(index, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8'
    )
    chords_now = sum(1 for s in existing if s.get('chords'))
    print(f'Done! {len(existing)} total songs, {chords_now} with chords', flush=True)

if __name__ == '__main__':
    main()
