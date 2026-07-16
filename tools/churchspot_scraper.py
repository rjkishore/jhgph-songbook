#!/usr/bin/env python3
"""
churchspot_scraper.py
Crawls churchspot.com (2200+ Tamil Christian songs with chords).

Pass 1 — Match churchspot songs against NJP songs that have no chords → fill chords.
Pass 2 — Add unmatched churchspot songs as new entries in songs.json.

Run:  python churchspot_scraper.py
Re-run skips crawling (uses churchspot_cache.pkl); delete that file to force re-crawl.
"""
import json, re, time, pickle, os, sys
from pathlib import Path
from difflib import SequenceMatcher

import requests
from bs4 import BeautifulSoup

BASE       = Path(__file__).parent.parent
SONGS_JSON = BASE / 'songs.json'
CACHE_FILE = Path(__file__).parent / 'churchspot_cache.pkl'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}
DELAY   = 0.6   # seconds between HTTP requests (be polite)

# ─────────────────────────────── HTTP ────────────────────────────────────────

def get(url, retries=3):
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=25)
            r.raise_for_status()
            return r
        except Exception as exc:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)

# ─────────────────────────────── Parsing helpers ─────────────────────────────

def is_tamil(text):
    return any('஀' <= c <= '௿' for c in text)

# A chord line is all ASCII, contains at least one A-G, and nothing Tamil.
_CHORD_OK = re.compile(r'^[\sA-Ga-g#bBmMjJaorisupwediag0-9/()\-\.]+$')

def is_chord_line(line):
    s = line.strip()
    if not s or is_tamil(s):
        return False
    if not re.search(r'[A-G]', s):
        return False
    return bool(_CHORD_OK.match(s))

def is_transliteration(line):
    s = line.strip()
    return bool(s) and not is_tamil(s) and not is_chord_line(s)


def parse_songpre(soup_el):
    """
    Parse .songpre BeautifulSoup element into slides.
    Structure: flat sequence of span.chordline / samp.lyricline / strong.translite
    Returns list of slides; each slide is list of {'lyric': str, 'chord': str}.
    churchspot has no slide separators so we return one slide per song.
    """
    pairs = []
    pending_chord = ''

    from bs4 import Tag
    for child in soup_el.children:
        if not isinstance(child, Tag):     # NavigableString (whitespace node)
            continue
        cls = ' '.join(child.get('class', []))

        if 'chordline' in cls:
            # Preserve full text with spaces for chord alignment
            pending_chord = child.get_text()
        elif 'lyricline' in cls:
            lyric = child.get_text(strip=True)
            if lyric:
                pairs.append({'lyric': lyric, 'chord': pending_chord.rstrip()})
                pending_chord = ''
        # 'translite' strong tags → skip

    return [pairs] if pairs else []


def slides_to_app_format(slides):
    """Convert parsed slides to the (chord_lyrics, chords) strings used in songs.json."""
    lyric_parts, chord_parts = [], []
    for slide in slides:
        lyric_parts.append('<BR>'.join(p['lyric'] for p in slide))
        chord_parts.append('<br>'.join(p['chord'] for p in slide))
    return '<slide>'.join(lyric_parts), '<slide>'.join(chord_parts)


def slides_to_lyrics(slides):
    """Plain lyrics (no chords) from parsed slides."""
    parts = []
    for slide in slides:
        parts.append('<BR>'.join(p['lyric'] for p in slide))
    return '<slide>'.join(parts)


# ─────────────────────────────── Crawling ────────────────────────────────────

def get_letter_urls():
    # Hardcoded from browser inspection of churchspot.com/search-first/?sfl=1
    return [
        'https://churchspot.com/search-first/?sfl=1&let=P',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%83',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%85',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%86',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%87',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%89',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%8A',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%8E',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%8F',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%90',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%92',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%93',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%95',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%95%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%95%E0%AE%BF',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%95%E0%AF%80',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%95%E0%AF%81',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%95%E0%AF%82',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%95%E0%AF%88',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%95%E0%AF%8A',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%95%E0%AF%8B',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9A',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9A%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9A%E0%AE%BF',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9A%E0%AF%80',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9A%E0%AF%81',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9A%E0%AF%82',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9A%E0%AF%86',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9A%E0%AF%87',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9A%E0%AF%8B',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9C',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9C%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9C%E0%AF%80',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9C%E0%AF%86',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9C%E0%AF%8B',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%9F%E0%AE%BF',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A4',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A4%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A4%E0%AE%BF',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A4%E0%AF%81',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A4%E0%AF%82',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A4%E0%AF%86',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A4%E0%AF%87',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A4%E0%AF%8A',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A8',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A8%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A8%E0%AE%BF',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A8%E0%AF%80',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A8%E0%AF%82',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A8%E0%AF%86',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A8%E0%AF%87',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%A8%E0%AF%8B',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AA',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AA%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AA%E0%AE%BF',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AA%E0%AF%80',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AA%E0%AF%81',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AA%E0%AF%82',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AA%E0%AF%86',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AA%E0%AF%87',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AA%E0%AF%87%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AA%E0%AF%8A',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AA%E0%AF%8B',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AE%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AE%E0%AF%80',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AE%E0%AF%81',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AE%E0%AF%86',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AE%E0%AF%87',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AE%E0%AF%8B',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AF%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AF%E0%AF%81',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AF%E0%AF%82',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AF%E0%AF%86',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AF%E0%AF%87',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%AF%E0%AF%8B',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B0',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B0%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B0%E0%AF%8A',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B2%E0%AF%87',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B5',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B5%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B5%E0%AE%BF',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B5%E0%AF%80',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B5%E0%AF%86',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B5%E0%AF%87',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B5%E0%AF%88',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B7%E0%AE%BE',
        'https://churchspot.com/search-first/?sfl=1&let=%E0%AE%B8%E0%AF%8D',
    ]


def get_song_urls_for_letter(letter_url):
    seen, urls = set(), []
    base = letter_url.split('&pageno=')[0]
    page = 1
    while True:
        url = base if page == 1 else f'{base}&pageno={page}'
        r = get(url)
        soup = BeautifulSoup(r.text, 'html.parser')
        found = []
        for a in soup.find_all('a', href=re.compile(r'/\d{4}/\d{2}/\d{2}/')):
            href = a['href']
            if href not in seen:
                seen.add(href)
                found.append(href)
        urls.extend(found)
        # Find max page number from pagination links
        page_links = soup.find_all('a', href=re.compile(r'pageno=\d+'))
        max_page = max(
            (int(re.search(r'pageno=(\d+)', a['href']).group(1)) for a in page_links),
            default=1
        )
        if page >= max_page:
            break
        page += 1
        time.sleep(DELAY)
    return urls


def scrape_song_page(url):
    """Fetch and parse one churchspot song page. Returns dict or None."""
    r = get(url)
    soup = BeautifulSoup(r.text, 'html.parser')

    title_el = soup.find(class_='song_title')
    if not title_el:
        return None
    tamil_title = title_el.get_text(strip=True)
    if not is_tamil(tamil_title):
        return None

    # Key + time from the title block text
    entry_wrap = soup.find(class_='entrytitle_wrap')
    key = time_sig = eng_title = ''
    if entry_wrap:
        block_text = entry_wrap.get_text(' ', strip=True)
        m = re.search(r'([A-G][#b]?(?:m|maj)?)\s*\|\s*(\d/\d)', block_text)
        if m:
            key      = m.group(1)
            time_sig = m.group(2)
        # English title: text before the '|' minus the Tamil title
        parts = block_text.split('|')
        if parts:
            eng_title = re.sub(re.escape(tamil_title), '', parts[0]).strip()
            eng_title = re.sub(r'\s+', ' ', eng_title).strip()

    songpre = soup.find(class_='songpre')
    if not songpre:
        return None

    slides = parse_songpre(songpre)
    if not slides:
        return None

    chord_lyrics, chords = slides_to_app_format(slides)
    lyrics               = slides_to_lyrics(slides)

    # Tamil token set for fuzzy matching
    all_tamil_text = ' '.join(p['lyric'] for slide in slides for p in slide)
    tamil_tokens   = set(re.findall(r'\S+', all_tamil_text))

    return {
        'url':          url,
        'title':        tamil_title,
        'name':         eng_title,
        'key':          key,
        'time':         time_sig,
        'lyrics':       lyrics,
        'chord_lyrics': chord_lyrics,
        'chords':       chords,
        'tamil_tokens': tamil_tokens,
    }


# ─────────────────────────────── Matching ────────────────────────────────────

def lyric_overlap(tok_a, tok_b):
    if not tok_a or not tok_b:
        return 0.0
    return len(tok_a & tok_b) / max(len(tok_a), len(tok_b))

def title_sim(a, b):
    return SequenceMatcher(None, a, b).ratio()

def find_njp_match(cs_song, songs_by_title, all_songs_tokens):
    """Return (njp_song, score) or (None, 0)."""
    # Exact title match
    exact = songs_by_title.get(cs_song['title'])
    if exact:
        return exact, 1.0

    best_score, best = 0.0, None
    cs_tok = cs_song['tamil_tokens']
    for s, tok in all_songs_tokens:
        ts = title_sim(cs_song['title'], s.get('title', ''))
        if ts < 0.72:   # lowered from 0.80
            continue
        if not tok or not cs_tok:
            # No lyrics to compare — rely on title similarity alone
            score = ts
        else:
            ov    = lyric_overlap(cs_tok, tok)
            score = ts * 0.60 + ov * 0.40
        if score > best_score:
            best_score, best = score, s

    if best_score >= 0.68:
        return best, best_score
    return None, 0.0


# ─────────────────────────────── Main ────────────────────────────────────────

def main():
    print('== Churchspot Scraper ==')
    print(f'Loading {SONGS_JSON} ...', end=' ')
    songs = json.loads(SONGS_JSON.read_text(encoding='utf-8'))
    print(f'{len(songs)} songs')

    no_chords  = [s for s in songs if not s.get('chords')]
    has_chords = len(songs) - len(no_chords)
    print(f'  {has_chords} already have chords, {len(no_chords)} do not')

    # Pre-compute lyric token sets for all NJP songs
    print('Building NJP token index...')
    all_songs_tokens = []
    for s in songs:
        # Use both lyrics and chord_lyrics so songs with only chord_lyrics still match
        combined = s.get('lyrics','') + ' ' + re.sub(r'<BR>|<slide>', ' ', s.get('chord_lyrics',''))
        text = re.sub(r'<BR>|<slide>', ' ', combined)
        tok  = set(re.findall(r'\S+', text))
        s['_tok'] = tok
        all_songs_tokens.append((s, tok))
    songs_by_title = {s.get('title', ''): s for s in songs if s.get('title')}

    # ── Crawl or load cache ──────────────────────────────────────────────────
    if CACHE_FILE.exists():
        print(f'Loading churchspot cache from {CACHE_FILE} ...')
        cs_songs = pickle.loads(CACHE_FILE.read_bytes())
        print(f'  {len(cs_songs)} cached songs')
    else:
        print('Crawling churchspot.com (this takes ~30 min on first run)...')
        letter_urls = get_letter_urls()
        print(f'  Found {len(letter_urls)} letter index pages')

        song_urls = []
        for lu in letter_urls:
            try:
                urls = get_song_urls_for_letter(lu)
                song_urls.extend(urls)
                print(f'  [{len(song_urls):4d} URLs] {lu}')
                time.sleep(DELAY)
            except Exception as e:
                print(f'  ERROR on {lu}: {e}')

        song_urls = list(dict.fromkeys(song_urls))   # deduplicate
        print(f'Total song URLs: {len(song_urls)}')

        cs_songs = []
        for i, url in enumerate(song_urls, 1):
            try:
                song = scrape_song_page(url)
                if song:
                    cs_songs.append(song)
                if i % 50 == 0:
                    print(f'  [{i}/{len(song_urls)}] {len(cs_songs)} valid songs scraped')
                time.sleep(DELAY)
            except Exception as e:
                pass  # skip bad pages silently

        print(f'Scraped {len(cs_songs)} valid songs from churchspot')
        CACHE_FILE.write_bytes(pickle.dumps(cs_songs))
        print(f'Cached to {CACHE_FILE}')

    # ── Match & update ───────────────────────────────────────────────────────
    print('\nMatching churchspot songs...')
    chords_added   = 0
    new_song_dicts = []

    for cs in cs_songs:
        match, score = find_njp_match(cs, songs_by_title, all_songs_tokens)

        if match and not match.get('chords'):
            # Fill in missing chords for an NJP song
            match['chord_lyrics'] = cs['chord_lyrics']
            match['chords']       = cs['chords']
            if not match.get('key') and cs.get('key'):
                match['key'] = cs['key']
            chords_added += 1

        elif match and match.get('chords'):
            pass   # already has chords — skip

        else:
            # Brand-new song (not in NJP)
            new_song_dicts.append(cs)

    print(f'  Chords filled for {chords_added} NJP songs')
    print(f'  New songs to add: {len(new_song_dicts)}')

    # ── Add new songs ────────────────────────────────────────────────────────
    if new_song_dicts:
        max_id  = max(s['id'] for s in songs)
        next_id = max(max_id + 1, 400001)   # separate namespace from NJP (1–2611-based)

        for cs in new_song_dicts:
            notes = ''
            if cs.get('key') or cs.get('time'):
                notes = f"{cs.get('key','')}/{cs.get('time','')}"
            songs.append({
                'id':          next_id,
                'num':         '',
                'name':        cs['name'],
                'title':       cs['title'],
                'lyrics':      cs['lyrics'],
                'key':         cs.get('key', ''),
                'notes':       notes,
                'chord_lyrics': cs['chord_lyrics'],
                'chords':      cs['chords'],
                'source':      'churchspot',
            })
            next_id += 1

    # ── Clean temp fields & save ─────────────────────────────────────────────
    for s in songs:
        s.pop('_tok', None)

    print(f'\nSaving songs.json ({len(songs)} songs)...')
    SONGS_JSON.write_text(
        json.dumps(songs, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8'
    )

    chords_now = sum(1 for s in songs if s.get('chords'))
    print(f'Done!  {len(songs)} songs total,  {chords_now} with chords  '
          f'(was {has_chords + len([s for s in songs if s.get("source")=="njp"])}, now +{chords_now - has_chords})')


if __name__ == '__main__':
    main()
