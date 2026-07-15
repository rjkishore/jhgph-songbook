#!/usr/bin/env python3
"""
christsongs_scraper.py
Crawls christsongs.org (Tamil Christian songs with chords).

- Letter pages:  https://christsongs.org/chords/{a-z}/
- Song pages:    https://christsongs.org/chords/{slug}/
- Structure:     <p> = verse, span.chord-name[data-chord] + text = chord+lyric

Pass 1 — Match against NJP songs missing chords → fill chords.
Pass 2 — Add unmatched songs as new entries.

Run:  python christsongs_scraper.py
Re-run uses cache (christsongs_cache.pkl); delete to force re-crawl.
"""
import json, re, copy as _copy, time, pickle, sys
from pathlib import Path
from difflib import SequenceMatcher

import requests
from bs4 import BeautifulSoup, Tag

BASE       = Path(__file__).parent.parent
SONGS_JSON = BASE / 'songs.json'
CACHE_FILE = Path(__file__).parent / 'christsongs_cache.pkl'

HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; NJPChords/1.0)'}
DELAY   = 0.5
LETTERS = list('abcdefghijklmnopqrstuvwxyz')

def get_soup(url, retries=3):
    """Fetch URL and return BeautifulSoup. Passes bytes so BS4 detects UTF-8 correctly."""
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=25)
            r.raise_for_status()
            return BeautifulSoup(r.content, 'html.parser')  # r.content = bytes → correct UTF-8
        except Exception:
            if attempt == retries - 1:
                return None
            time.sleep(2 ** attempt)

def is_tamil(text):
    return any('஀' <= c <= '௿' for c in text)

# ── Listing page ──────────────────────────────────────────────────────────────

def get_song_urls_for_letter(letter):
    url = f'https://christsongs.org/chords/{letter}/'
    soup = get_soup(url)
    if not soup:
        return []
    seen, urls = set(), []
    for a in soup.find_all('a', href=re.compile(r'/chords/[^/]+/$')):
        href = a['href']
        # exclude letter-index links like /chords/a/
        slug = href.rstrip('/').split('/')[-1]
        if len(slug) > 2 and slug not in LETTERS and href not in seen:
            seen.add(href)
            # Try to grab Tamil title from the link text
            text = a.get_text('\n', strip=True)
            parts = [p.strip() for p in text.split('\n') if p.strip()]
            tamil_title = next((p for p in parts if is_tamil(p)), '')
            eng_title   = parts[0] if parts else ''
            eng_title   = re.sub(r'\s*Chords\s*$', '', eng_title, flags=re.I).strip()
            urls.append({'url': href if href.startswith('http') else 'https://christsongs.org' + href,
                         'name': eng_title,
                         'title': tamil_title})
    return urls

# ── Song page ─────────────────────────────────────────────────────────────────

def parse_song_page(soup, meta):
    """Extract key, chord_lyrics, chords, lyrics from a song page."""
    # Tamil panel
    panel = soup.find(id='tab-tamil')
    if not panel:
        # Fallback: try chord-display directly
        panel = soup.find(id='chord-display') or soup.find(class_='chord-content')
    if not panel:
        return None

    chord_display = panel.find(id='chord-display') or panel.find(class_='chord-content') or panel
    key = chord_display.get('data-original-scale', '').strip() if hasattr(chord_display, 'get') else ''

    # Tamil title from page if not in meta
    if not meta.get('title'):
        h1 = soup.find('h1')
        if h1:
            text = h1.get_text()
            parts = text.split('-')
            for p in parts:
                if is_tamil(p.strip()):
                    meta['title'] = p.strip()
                    break
        if not meta.get('title'):
            # Try page title
            pt = soup.find('title')
            if pt:
                for part in pt.get_text().split('-'):
                    if is_tamil(part.strip()):
                        meta['title'] = part.strip()
                        break

    # Parse verses: each <p> is a slide
    slides = []
    # Find all <p> inside chord_display
    paras = chord_display.find_all('p') if hasattr(chord_display, 'find_all') else []
    if not paras:
        # No <p> — treat whole block as one slide
        paras = [chord_display]

    for para in paras:
        lines = []
        for span in para.find_all('span', class_=re.compile(r'chords-line')):
            # A span may have multiple chord-anchors (mid-line chord changes).
            # Collect all chord tokens from the span.
            chord_els = span.find_all('span', class_='chord-name')
            chord = ' '.join(el.get('data-chord', '') for el in chord_els).strip()

            # Get lyric: clone, remove all chord-anchors, extract text
            sp_copy = _copy.copy(span)
            for anchor in sp_copy.find_all(class_='chord-anchor'):
                anchor.decompose()
            lyric = sp_copy.get_text(strip=True)

            if lyric and is_tamil(lyric):
                lines.append({'lyric': lyric, 'chord': chord})

        if lines:
            slides.append(lines)

    if not slides:
        return None

    # Convert to app format
    lyric_parts, chord_parts, plain_parts = [], [], []
    for slide in slides:
        lyric_parts.append('<BR>'.join(p['lyric'] for p in slide))
        chord_parts.append('<br>'.join(p['chord'] for p in slide))
        plain_parts.append('<BR>'.join(p['lyric'] for p in slide))

    chord_lyrics = '<slide>'.join(lyric_parts)
    chords       = '<slide>'.join(chord_parts)
    lyrics       = '<slide>'.join(plain_parts)

    all_tamil = ' '.join(p['lyric'] for sl in slides for p in sl)

    return {
        'url':          meta.get('url', ''),
        'title':        meta.get('title', ''),
        'name':         meta.get('name', ''),
        'key':          key,
        'lyrics':       lyrics,
        'chord_lyrics': chord_lyrics,
        'chords':       chords,
        'tamil_tokens': set(re.findall(r'\S+', all_tamil)),
    }

def scrape_song(meta):
    soup = get_soup(meta['url'])
    if not soup:
        return None
    return parse_song_page(soup, meta)

# ── Matching ──────────────────────────────────────────────────────────────────

def lyric_overlap(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / max(len(a), len(b))

def find_njp_match(cs, by_title, all_tok):
    exact = by_title.get(cs['title'])
    if exact:
        return exact, 1.0
    best_s, best_score = None, 0.0
    cs_tok = cs['tamil_tokens']
    for s, tok in all_tok:
        ts = SequenceMatcher(None, cs['title'], s.get('title', '')).ratio()
        if ts < 0.78:
            continue
        ov = lyric_overlap(cs_tok, tok)
        score = ts * 0.55 + ov * 0.45
        if score > best_score:
            best_score, best_s = score, s
    return (best_s, best_score) if best_score >= 0.62 else (None, 0.0)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print('== Christsongs.org Scraper ==')
    songs = json.loads(SONGS_JSON.read_text(encoding='utf-8'))
    print(f'Loaded {len(songs)} songs ({sum(1 for s in songs if s.get("chords"))} with chords)')

    print('Building NJP token index...')
    all_tok = []
    for s in songs:
        txt = re.sub(r'<BR>|<slide>', ' ', s.get('lyrics', ''))
        tok = set(re.findall(r'\S+', txt))
        s['_tok'] = tok
        all_tok.append((s, tok))
    by_title = {s.get('title', ''): s for s in songs if s.get('title')}

    # ── Crawl or cache ───────────────────────────────────────────────────────
    if CACHE_FILE.exists():
        print(f'Loading cache from {CACHE_FILE}...')
        cs_songs = pickle.loads(CACHE_FILE.read_bytes())
        print(f'  {len(cs_songs)} cached songs')
    else:
        print('Crawling christsongs.org...')
        all_metas = []
        for letter in LETTERS:
            try:
                metas = get_song_urls_for_letter(letter)
                all_metas.extend(metas)
                print(f'  [{letter}] {len(metas)} songs  (total {len(all_metas)})')
                time.sleep(DELAY)
            except Exception as e:
                print(f'  [{letter}] ERROR: {e}')

        # Deduplicate by URL
        seen_urls = set()
        unique_metas = []
        for m in all_metas:
            if m['url'] not in seen_urls:
                seen_urls.add(m['url'])
                unique_metas.append(m)
        print(f'Total unique songs: {len(unique_metas)}')

        cs_songs = []
        for i, meta in enumerate(unique_metas, 1):
            try:
                song = scrape_song(meta)
                if song and song['chords']:
                    cs_songs.append(song)
                if i % 100 == 0:
                    print(f'  [{i}/{len(unique_metas)}] {len(cs_songs)} valid')
                time.sleep(DELAY)
            except Exception:
                pass

        print(f'Scraped {len(cs_songs)} valid songs')
        CACHE_FILE.write_bytes(pickle.dumps(cs_songs))
        print(f'Cached to {CACHE_FILE}')

    # ── Match & update ───────────────────────────────────────────────────────
    print('\nMatching against NJP songs...')
    chords_added, new_songs = 0, []

    for cs in cs_songs:
        match, score = find_njp_match(cs, by_title, all_tok)
        if match and not match.get('chords'):
            match['chord_lyrics'] = cs['chord_lyrics']
            match['chords']       = cs['chords']
            if not match.get('key') and cs.get('key'):
                match['key'] = cs['key']
            chords_added += 1
        elif not match:
            new_songs.append(cs)

    print(f'  Chords filled for {chords_added} NJP songs')
    print(f'  New songs to add: {len(new_songs)}')

    # ── Add new songs ────────────────────────────────────────────────────────
    if new_songs:
        max_id  = max(s['id'] for s in songs)
        next_id = max(max_id + 1, 500001)
        for cs in new_songs:
            songs.append({
                'id':           next_id,
                'num':          '',
                'name':         cs['name'],
                'title':        cs['title'],
                'lyrics':       cs['lyrics'],
                'key':          cs.get('key', ''),
                'notes':        cs.get('key', ''),
                'chord_lyrics': cs['chord_lyrics'],
                'chords':       cs['chords'],
                'source':       'christsongs',
            })
            next_id += 1

    # ── Save ─────────────────────────────────────────────────────────────────
    for s in songs:
        s.pop('_tok', None)

    print(f'\nSaving songs.json ({len(songs)} songs)...')
    SONGS_JSON.write_text(json.dumps(songs, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    chords_now = sum(1 for s in songs if s.get('chords'))
    print(f'Done! {len(songs)} total songs, {chords_now} with chords')

if __name__ == '__main__':
    main()
