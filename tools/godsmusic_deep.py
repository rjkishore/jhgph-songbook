"""
Deep Tamil-based match against thegodsmusic.com.
Crawl all chord pages -> extract Tamil lyrics + chords -> build Tamil token index
-> match NJP songs (without chords) by Tamil lyric overlap -> store.
"""
import sqlite3, sys, re, json, time, pickle, os
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from bs4 import BeautifulSoup, NavigableString, Tag
sys.stdout.reconfigure(encoding='utf-8')

DB_PATH   = r"C:\Users\Admin\AppData\Roaming\verseview7\Local Store\song\default.db"
CHORDS_DB = r"C:\Users\Admin\AppData\Roaming\verseview7\Local Store\song\chords.db"
JSON      = r"D:\RK Software\Chords\songs.json"
CACHE     = r"D:\RK Software\Chords\tools\godsmusic_cache.pkl"
CAT       = "Nithiya Jeevan Padalgal"
SITE      = "https://thegodsmusic.com"
WORKERS   = 6

def new_session():
    s = requests.Session()
    s.headers.update({'User-Agent':'Mozilla/5.0 (research)'})
    return s

def fetch(url, sess, retries=2):
    for _ in range(retries):
        try:
            r = sess.get(url, timeout=15)
            if r.status_code == 200:
                return r.text
        except Exception:
            time.sleep(1.0)
    return None

def tamil_tokens(s):
    s = re.sub(r'[^஀-௿\s]', ' ', s)
    return set(w for w in s.split() if len(w) > 1)

def parse_page(html):
    soup = BeautifulSoup(html, 'html.parser')
    container = soup.find(class_='lyric-text')
    if not container: return '', ''
    def parse_line(p):
        lyric=''; chord=''
        for node in p.descendants:
            if isinstance(node, Tag) and node.name=='sup' and 'chord' in (node.get('class') or []):
                nm = node.get_text(strip=True)
                if nm: chord = chord.ljust(len(lyric)) + nm + ' '
            elif isinstance(node, NavigableString):
                if node.parent.name=='sup': continue
                lyric += str(node).replace('\xa0',' ')
        return chord.rstrip(), re.sub(r'\s+',' ',lyric).strip()
    ll, cl = [], []
    for p in container.find_all('p', class_='chords_text'):
        c,l = parse_line(p)
        if l and any('஀'<=ch<='௿' for ch in l):
            ll.append(l); cl.append(c)
    if not ll: return '', ''
    return '<BR>'.join(ll), '<br>'.join(cl)

# ── Step 1: collect URLs ─────────────────────────────────────────────────────
print("Collecting URLs...")
s0 = new_session()
urls = []
for i in range(1, 7):
    sm = f"{SITE}/chords-sitemap{'' if i==1 else i}.xml"
    txt = fetch(sm, s0)
    if not txt: continue
    locs = re.findall(r'<loc><!\[CDATA\[(.*?)\]\]></loc>', txt) or re.findall(r'<loc>(.*?)</loc>', txt)
    urls += [l for l in locs if '/chords/' in l]
urls = list(dict.fromkeys(urls))
print(f"URLs: {len(urls)}")

# ── Step 2: crawl (with cache) ───────────────────────────────────────────────
pages = {}   # url -> (lyr, chd, tamil_token_set)
if os.path.exists(CACHE):
    with open(CACHE,'rb') as f:
        pages = pickle.load(f)
    print(f"Loaded {len(pages)} cached pages")

todo = [u for u in urls if u not in pages]
print(f"To crawl: {len(todo)}")

def work(url):
    sess = new_session()
    html = fetch(url, sess)
    if not html: return url, None
    lyr, chd = parse_page(html)
    if not lyr or not chd: return url, ('','', set())
    return url, (lyr, chd, tamil_tokens(lyr))

t0 = time.time()
done = 0
with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    futs = {ex.submit(work, u): u for u in todo}
    for fut in as_completed(futs):
        url, res = fut.result()
        pages[url] = res if res else ('','',set())
        done += 1
        if done % 300 == 0:
            el = time.time()-t0; rate = done/el
            print(f"  crawled {done}/{len(todo)} | {rate:.1f}/s | ~{(len(todo)-done)/rate/60:.0f} min left")
            with open(CACHE,'wb') as f: pickle.dump(pages, f)

with open(CACHE,'wb') as f: pickle.dump(pages, f)
print(f"Crawl done in {(time.time()-t0)/60:.1f} min. Pages with chords: {sum(1 for v in pages.values() if v and v[0])}")

# ── Step 3: build Tamil inverted index ───────────────────────────────────────
page_list = [(u, v) for u,v in pages.items() if v and v[0]]
inv = defaultdict(list)
for idx,(u,v) in enumerate(page_list):
    for tk in v[2]:
        inv[tk].append(idx)
print(f"Indexed {len(page_list)} pages")

# ── Step 4: match NJP songs without chords ───────────────────────────────────
songs = json.load(open(JSON, encoding='utf-8'))
no_chords = [s for s in songs if not s['chords'] and s['title']]
print(f"NJP without chords: {len(no_chords)}")

results = []
for song in no_chords:
    our = tamil_tokens(song['lyrics'] + ' ' + song['title'])
    if len(our) < 3: continue
    pool = defaultdict(int)
    for tk in our:
        for idx in inv.get(tk, []):
            pool[idx] += 1
    if not pool: continue
    best=None; best_val=0
    for idx,shared in pool.items():
        if shared < 3: continue
        web = page_list[idx][1][2]
        val = len(our & web)/max(len(our | web),1)
        if val > best_val:
            best_val = val; best = idx
    if best is not None and best_val >= 0.33:
        u, (lyr, chd, _) = page_list[best]
        results.append((song['id'], song['name'], lyr, chd, u, round(best_val,2)))

print(f"New matches (val>=0.33): {len(results)}")

# ── Step 5: store ─────────────────────────────────────────────────────────────
ccon=sqlite3.connect(CHORDS_DB); ccur=ccon.cursor()
mcon=sqlite3.connect(DB_PATH); mcur=mcon.cursor()
ts='7/12/2026'; ins=0
for song_id,name,lyr,chd,u,val in results:
    ccur.execute("SELECT id FROM cm WHERE title=? AND category='Tamil'",(name,))
    ex=ccur.fetchone()
    if ex:
        ccur.execute("UPDATE cm SET lyrics=?, chords=? WHERE id=?",(lyr,chd,ex[0]))
    else:
        ccur.execute("""INSERT INTO cm (title,lyrics,chords,key,chordsby,timestamp,bpm,notes,
                        timesignature,rhythm,complexity,tags,rating,original,usagecount,category,additional)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (name,lyr,chd,'','thegodsmusic.com',ts,0,'','','',0,'',5,1,0,'Tamil',''))
    mcur.execute("UPDATE sm SET chordsavailable=1 WHERE id=?",(song_id,))
    ins+=1
ccon.commit(); mcon.commit(); ccon.close(); mcon.close()
print(f"Stored {ins} new songs")

# ── Step 6: rebuild songs.json ───────────────────────────────────────────────
con=sqlite3.connect(DB_PATH); cur=con.cursor()
cur.execute("SELECT id,name,subcat,title2,lyrics,key,notes FROM sm WHERE cat=? ORDER BY CAST(subcat AS INTEGER)",(CAT,))
raw=cur.fetchall(); con.close()
ccon=sqlite3.connect(CHORDS_DB); ccur=ccon.cursor()
ccur.execute("SELECT title,lyrics,chords,key FROM cm WHERE category='Tamil' AND lyrics!='' AND chords!=''")
cmap={t:{'lyrics':l,'chords':c,'key':k} for t,l,c,k in ccur.fetchall()}; ccon.close()
out=[]
for sid,name,subcat,title2,lyrics,key,notes in raw:
    tt=re.sub(r'^\d+\s*','',title2 or '').strip(); cd=cmap.get(name,{})
    out.append({'id':sid,'num':subcat or '','name':name,'title':tt,'lyrics':lyrics or '',
                'key':key or cd.get('key',''),'notes':notes or '',
                'chord_lyrics':cd.get('lyrics',''),'chords':cd.get('chords','')})
json.dump(out, open(JSON,'w',encoding='utf-8'), ensure_ascii=False)
print(f"songs.json: {len(out)} songs, {sum(1 for s in out if s['chords'])} with chords")
print("\nSamples:")
for r in results[:15]:
    print(f"  {r[1][:34]:34} val={r[5]} | {r[4].split('/')[-2][:42]}")
