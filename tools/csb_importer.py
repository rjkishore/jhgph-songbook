#!/usr/bin/env python3
"""
csb_importer.py
Downloads all 16,075 Tamil songs from the Christian Songbook CDN
and merges them into songs.json.

Data CDN: https://samsolomonprabu.github.io/cdn/cs/v3/
  - Song list:   /data/tamil.compressed   (base64 + gzip JSON)
  - Song cache:  /caches/{sha256(floor(id/50))}.cs.song  (same encoding)
    Each cache file is a list of 50 songs; song at index (id % 50).

Run:  python csb_importer.py
Re-run skips already-downloaded cache files.
"""

import base64, gzip, hashlib, json, re, sys, time
from pathlib import Path

import requests

BASE       = Path(__file__).parent.parent
SONGS_JSON = BASE / 'songs.json'
CACHE_DIR  = Path(__file__).parent / 'csb_cache'
CACHE_DIR.mkdir(exist_ok=True)

CDN        = 'https://samsolomonprabu.github.io/cdn/cs/v3'
BATCH      = 50          # songs per cache file
NEW_ID_START = 600001    # namespace for CSB songs
HEADERS    = {'User-Agent': 'Mozilla/5.0 (compatible; NJPChords/1.0)'}
DELAY      = 0.3

# ── Helpers ──────────────────────────────────────────────────────────────────

def b64gz_decode(raw_bytes):
    """Decode base64 then gunzip, return parsed JSON."""
    return json.loads(gzip.decompress(base64.b64decode(raw_bytes)))

def cache_hash(song_id: int) -> str:
    bucket = song_id // BATCH
    return hashlib.sha256(str(bucket).encode()).hexdigest()

def fetch_with_retry(url, retries=3):
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.raise_for_status()
            return r.content
        except Exception as e:
            if attempt == retries - 1:
                return None
            time.sleep(2 ** attempt)

def is_tamil(text):
    return any('஀' <= c <= '௿' for c in (text or ''))

# ── Step 1: Download song list ────────────────────────────────────────────────

def load_song_list():
    url = f'{CDN}/data/tamil.compressed'
    print(f'Fetching song list from {url} ...')
    content = fetch_with_retry(url)
    if not content:
        sys.exit('Failed to download song list')
    data = b64gz_decode(content)
    songs = data['songs']
    print(f'  {len(songs)} Tamil songs in list')
    return songs

# ── Step 2: Download cache files ─────────────────────────────────────────────

def load_cache_file(song_id: int):
    """Load and decode a .cs.song cache file (cached to disk)."""
    h = cache_hash(song_id)
    local = CACHE_DIR / f'{h}.json'
    if local.exists():
        return json.loads(local.read_text(encoding='utf-8'))
    url = f'{CDN}/caches/{h}.cs.song'
    content = fetch_with_retry(url)
    if content is None:
        return None
    try:
        batch = b64gz_decode(content)
        local.write_text(json.dumps(batch, ensure_ascii=False), encoding='utf-8')
        return batch
    except Exception:
        return None

# ── Step 3: Merge ────────────────────────────────────────────────────────────

def main():
    print('== Christian Songbook Importer ==')

    # Load existing songs
    existing = json.loads(SONGS_JSON.read_text(encoding='utf-8'))
    print(f'Loaded {len(existing)} songs ({sum(1 for s in existing if s.get("chords"))} with chords)')

    # Build lookup for existing NJP titles
    existing_titles = {s.get('title', ''): s for s in existing if s.get('title')}
    max_existing_id = max(s['id'] for s in existing)
    next_id = max(max_existing_id + 1, NEW_ID_START)

    # Download CSB song list
    csb_list = load_song_list()

    # Group song IDs by cache bucket to minimise HTTP requests
    buckets = {}
    for s in csb_list:
        sid = int(s['a'])
        bucket = sid // BATCH
        buckets.setdefault(bucket, []).append(s)

    total_buckets = len(buckets)
    print(f'  {total_buckets} cache files to download')

    chords_added = 0
    new_added    = 0
    skipped      = 0
    errors       = 0
    done_buckets = 0

    for bucket_id, bucket_songs in sorted(buckets.items()):
        # Pick any song ID in this bucket to compute hash
        sample_id = bucket_songs[0]['a']
        batch = load_cache_file(int(sample_id))
        done_buckets += 1

        if batch is None:
            errors += len(bucket_songs)
            continue

        for meta in bucket_songs:
            sid    = int(meta['a'])
            title  = meta.get('b', '').strip()       # Tamil title
            key    = meta.get('j', '').strip()       # musical key

            # Get full song data from cache (dict keyed by str(id % BATCH))
            idx_key = str(sid % BATCH)
            detail  = {}
            if isinstance(batch, dict):
                detail = batch.get(idx_key) or {}
            elif isinstance(batch, list) and int(idx_key) < len(batch):
                detail = batch[int(idx_key)] or {}

            # Merge list metadata into detail
            detail = {**detail, **meta}

            # Extract lyrics — 'c' = lyrics text, 'chords' if present
            lyrics_raw = (detail.get('c') or '').strip()
            chords_raw = (detail.get('chords') or '').strip()
            if not lyrics_raw and not is_tamil(title):
                skipped += 1
                continue

            # Convert newline-separated lyrics to app format
            # CSB uses \n for line breaks and blank line for slide separators
            if lyrics_raw:
                slides = []
                current = []
                for line in lyrics_raw.split('\n'):
                    if line.strip() == '':
                        if current:
                            slides.append(current)
                            current = []
                    else:
                        current.append(line.strip())
                if current:
                    slides.append(current)

                chord_lyrics = '<slide>'.join('<BR>'.join(sl) for sl in slides) if slides else ''
                plain_lyrics = chord_lyrics
            else:
                chord_lyrics = plain_lyrics = ''

            # Check for NJP match by exact title
            if title in existing_titles:
                njp = existing_titles[title]
                if not njp.get('chords') and chords_raw:
                    njp['chords'] = chords_raw
                    njp['chord_lyrics'] = chord_lyrics
                    if not njp.get('key') and key:
                        njp['key'] = key
                    chords_added += 1
                elif not njp.get('lyrics') and plain_lyrics:
                    njp['lyrics'] = plain_lyrics
                    if not njp.get('chord_lyrics'):
                        njp['chord_lyrics'] = chord_lyrics
                skipped += 1
                continue

            # New song
            existing.append({
                'id':          next_id,
                'num':         '',
                'name':        '',
                'title':       title,
                'lyrics':      plain_lyrics,
                'key':         key,
                'notes':       key,
                'chord_lyrics': chord_lyrics,
                'chords':      chords_raw,
                'source':      'csb',
            })
            existing_titles[title] = existing[-1]
            next_id  += 1
            new_added += 1

        if done_buckets % 50 == 0 or done_buckets == total_buckets:
            print(f'  [{done_buckets}/{total_buckets}] new={new_added} chords_filled={chords_added} errors={errors}')
        time.sleep(DELAY)

    print(f'\nResults:')
    print(f'  New songs added:     {new_added}')
    print(f'  Chords filled (NJP): {chords_added}')
    print(f'  Skipped/duplicate:   {skipped}')
    print(f'  Cache errors:        {errors}')

    print(f'\nSaving songs.json ({len(existing)} songs) ...')
    SONGS_JSON.write_text(
        json.dumps(existing, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8'
    )
    chords_now = sum(1 for s in existing if s.get('chords'))
    print(f'Done! {len(existing)} total songs, {chords_now} with chords')

if __name__ == '__main__':
    main()
