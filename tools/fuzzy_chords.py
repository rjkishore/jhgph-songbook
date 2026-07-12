"""
Find chords for NJP songs that don't have any yet.
Strategy: fuzzy-match Tamil title against full site index, then VALIDATE
by comparing lyrics overlap before accepting — avoids wrong matches.
"""
import sqlite3, sys, re, json, time
from difflib import SequenceMatcher
from collections import defaultdict
import requests
from bs4 import BeautifulSoup
sys.stdout.reconfigure(encoding='utf-8')

DB_PATH   = r"C:\Users\Admin\AppData\Roaming\verseview7\Local Store\song\default.db"
CHORDS_DB = r"C:\Users\Admin\AppData\Roaming\verseview7\Local Store\song\chords.db"
JSON      = r"D:\RK Software\Chords\songs.json"
CAT       = "Nithiya Jeevan Padalgal"
BASE      = "https://tamilchristiansongs.in"
DELAY     = 0.35

LETTERS = list("abcdefghijklmnopqrstuvwxyz")
session = requests.Session()
session.headers.update({'User-Agent': 'Mozilla/5.0 (research)'})

def fetch(url, retries=2):
    for _ in range(retries):
        try:
            r = session.get(url, timeout=15)
            if r.status_code == 200:
                return r.text
        except Exception:
            time.sleep(1.5)
    return None

def norm(t):
    if not t: return ''
    t = re.sub(r'[!?.,:;"\'\-–—()\[\]{}]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip().lower()

def tokens(t):
    return [w for w in norm(t).split() if len(w) > 1]

# ── Chord page parser (nota-component based) ─────────────────────────────────
def parse_chord_page(html):
    soup = BeautifulSoup(html, 'html.parser')
    body = soup.find(class_='wpChordsBody')
    if not body:
        return '', ''
    lyric_slides, chord_slides = [], []
    for para in body.find_all('p'):
        ll, cl = [], []
        for span in para.find_all('span'):
            lyric_text = chord_text = ''
            for child in span.children:
                if hasattr(child, 'name') and child.name == 'nota-component':
                    nota = child.get('nota', '')
                    if nota:
                        chord_text = chord_text.ljust(len(lyric_text)) + nota + ' '
                elif hasattr(child, 'string') and child.string:
                    lyric_text += child.string
                elif isinstance(child, str):
                    lyric_text += child
            lyric_text = lyric_text.strip()
            if lyric_text and not lyric_text.startswith('---'):
                ll.append(lyric_text)
                cl.append(chord_text.rstrip())
        if ll:
            lyric_slides.append('<BR>'.join(ll))
            chord_slides.append('<br>'.join(cl))
    return '<slide>'.join(lyric_slides), '<slide>'.join(chord_slides)

# ── Step 1: build full site index (Tamil title -> slug) ──────────────────────
print("Building site index...")
site = []  # list of (norm_title, raw_title, url, token_set)
seen = set()
for letter in LETTERS:
    html = fetch(f"{BASE}/tamil/chords/{letter}/")
    if not html:
        continue
    soup = BeautifulSoup(html, 'html.parser')
    for a in soup.find_all('a', href=True):
        href = a['href']
        if '/tamil/chords/' in href and len(href) > len(f"{BASE}/tamil/chords/") + 5:
            title = a.get_text(strip=True)
            title = re.sub(r'\s*Chords\s*$', '', title, flags=re.I)
            if title and len(title) > 3 and href not in seen:
                seen.add(href)
                slug = href.rstrip('/').split('/')[-1]
                url = f"{BASE}/chords/{slug}/"
                site.append((norm(title), title, url, set(tokens(title))))
    time.sleep(DELAY)
print(f"Site songs indexed: {len(site)}")

# Inverted index: token -> list of site indices (for fast candidate lookup)
inv = defaultdict(list)
for i, (_, _, _, toks) in enumerate(site):
    for tk in toks:
        inv[tk].append(i)

# ── Step 2: load NJP songs WITHOUT chords ────────────────────────────────────
songs = json.load(open(JSON, encoding='utf-8'))
no_chords = [s for s in songs if not s['chords'] and s['title']]
print(f"NJP songs without chords: {len(no_chords)}")

# ── Step 3: fuzzy match + validate ───────────────────────────────────────────
def lyric_token_set(lyrics_str):
    txt = lyrics_str.replace('<slide>', ' ').replace('<BR>', ' ')
    return set(tokens(txt))

def best_candidate(song):
    q_toks = set(tokens(song['title']))
    if not q_toks:
        return None
    # gather candidate site songs sharing >=1 title token
    cand = set()
    for tk in q_toks:
        cand.update(inv.get(tk, []))
    if not cand:
        return None
    best = None; best_score = 0
    qn = norm(song['title'])
    for i in cand:
        s_norm, s_title, s_url, s_toks = site[i]
        # token overlap ratio
        overlap = len(q_toks & s_toks) / max(len(q_toks | s_toks), 1)
        seq = SequenceMatcher(None, qn, s_norm).ratio()
        score = 0.5 * overlap + 0.5 * seq
        if score > best_score:
            best_score = score; best = (i, s_title, s_url, score)
    return best

print("Matching + fetching + validating...")
results = []
attempted = accepted = rejected = 0

for si, song in enumerate(no_chords):
    cand = best_candidate(song)
    if not cand or cand[3] < 0.62:
        continue
    i, s_title, s_url, score = cand
    attempted += 1
    html = fetch(s_url)
    if not html or 'wpChordsBody' not in html:
        time.sleep(DELAY); continue
    lyr, chd = parse_chord_page(html)
    if not lyr or not chd:
        time.sleep(DELAY); continue

    # VALIDATE: compare fetched lyrics tokens vs our stored lyrics tokens
    our_toks = lyric_token_set(song['lyrics'])
    web_toks = lyric_token_set(lyr)
    if our_toks and web_toks:
        val = len(our_toks & web_toks) / max(len(our_toks | web_toks), 1)
    else:
        val = 0
    # Accept if lyric overlap decent OR title score very high
    if val >= 0.30 or (score >= 0.85 and val >= 0.15):
        results.append((song['id'], song['name'], lyr, chd, s_title, round(score,2), round(val,2)))
        accepted += 1
    else:
        rejected += 1

    if attempted % 50 == 0:
        print(f"  attempted={attempted} accepted={accepted} rejected={rejected} (scanned {si}/{len(no_chords)})")
    time.sleep(DELAY)

print(f"\nDONE matching. attempted={attempted} accepted={accepted} rejected={rejected}")

# ── Step 4: store accepted chords ────────────────────────────────────────────
ccon = sqlite3.connect(CHORDS_DB); ccur = ccon.cursor()
mcon = sqlite3.connect(DB_PATH);   mcur = mcon.cursor()
ts = '7/12/2026'
ins = 0
for song_id, name, lyr, chd, s_title, score, val in results:
    ccur.execute("SELECT id FROM cm WHERE title=? AND category='Tamil'", (name,))
    ex = ccur.fetchone()
    if ex:
        ccur.execute("UPDATE cm SET lyrics=?, chords=? WHERE id=?", (lyr, chd, ex[0]))
    else:
        ccur.execute("""INSERT INTO cm (title,lyrics,chords,key,chordsby,timestamp,bpm,notes,
                        timesignature,rhythm,complexity,tags,rating,original,usagecount,category,additional)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (name, lyr, chd, '', 'tamilchristiansongs.in', ts, 0,'','','',0,'',5,1,0,'Tamil',''))
    mcur.execute("UPDATE sm SET chordsavailable=1 WHERE id=?", (song_id,))
    ins += 1
ccon.commit(); mcon.commit(); ccon.close(); mcon.close()
print(f"Stored {ins} new chord songs")

# ── Step 5: rebuild songs.json ───────────────────────────────────────────────
con = sqlite3.connect(DB_PATH); cur = con.cursor()
cur.execute("SELECT id,name,subcat,title2,lyrics,key,notes FROM sm WHERE cat=? ORDER BY CAST(subcat AS INTEGER)", (CAT,))
raw = cur.fetchall(); con.close()
ccon = sqlite3.connect(CHORDS_DB); ccur = ccon.cursor()
ccur.execute("SELECT title,lyrics,chords,key FROM cm WHERE category='Tamil' AND lyrics!='' AND chords!=''")
cmap = {t:{'lyrics':l,'chords':c,'key':k} for t,l,c,k in ccur.fetchall()}
ccon.close()
out = []
for sid,name,subcat,title2,lyrics,key,notes in raw:
    tt = re.sub(r'^\d+\s*','',title2 or '').strip()
    cd = cmap.get(name, {})
    out.append({'id':sid,'num':subcat or '','name':name,'title':tt,'lyrics':lyrics or '',
                'key':key or cd.get('key',''),'notes':notes or '',
                'chord_lyrics':cd.get('lyrics',''),'chords':cd.get('chords','')})
json.dump(out, open(JSON,'w',encoding='utf-8'), ensure_ascii=False)
print(f"songs.json rebuilt: {len(out)} songs, {sum(1 for s in out if s['chords'])} with chords")

# sample of newly accepted
print("\nSample new matches (name | site title | titleScore | lyricOverlap):")
for r in results[:15]:
    print(f"  {r[1][:32]:32} | {r[4][:32]:32} | {r[5]} | {r[6]}")
