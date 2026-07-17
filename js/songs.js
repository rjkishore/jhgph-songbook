// songs.js — all song-related logic: data loading, list, detail, lyrics,
// transpose, favourites, setlist, chord finder, voice search, scale notes.

import { Storage } from './storage.js';
import { escHtml, showToast, acquireWakeLock } from './ui.js';

// ── Music constants ────────────────────────────────────────────────────────
const CHROMATIC  = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const ENHARMONIC = { Db:'C#',Eb:'D#',Fb:'E',Gb:'F#',Ab:'G#',Bb:'A#',Cb:'B' };
const CAPO_TABLE = {
  C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11
};

export function transposeChord(c, s) {
  if (!c || !s) return c;
  return c.replace(/[A-G][b#]?/g, n => {
    const k = ENHARMONIC[n] || n;
    const i = CHROMATIC.indexOf(k);
    return i < 0 ? n : CHROMATIC[((i + s) % 12 + 12) % 12];
  });
}

export function transposeLine(l, s) {
  if (!l || !s) return l;
  return l.replace(/[A-G][b#]?(?:m|maj|min|aug|dim|sus|add)?[0-9]?(?:\/[A-G][b#]?)?/g,
    c => transposeChord(c, s));
}

// ── State ──────────────────────────────────────────────────────────────────
let _index      = [];
let _detail     = {};
let _fullLoaded = false;
let _filtered   = [];
let _activeSong = null;
let _transpose  = 0;
let _showChords = true;
let _activeTab  = 'songs';
let _chordsOnly = false;
let _favOnly    = false;
let _fontSize   = Storage.songs.getFontSize();
let _favs       = Storage.songs.getFavs();
let _setlist    = Storage.songs.getSetlist();
let _foundChordsData = null;

// ── Helpers ────────────────────────────────────────────────────────────────
function _saveFavs()    { Storage.songs.saveFavs(_favs); }
function _saveSetlist() { Storage.songs.saveSetlist(_setlist); _updateSetBadge(); }

function _applyFontSize() {
  document.documentElement.style.setProperty('--lyric-size', _fontSize + 'px');
}

function _updateSetBadge() {
  const b = document.getElementById('setlist-badge');
  if (b) b.textContent = _setlist.length ? '(' + _setlist.length + ')' : '';
}

// ── Boot / data loading ────────────────────────────────────────────────────
export function init(onReady) {
  _applyFontSize();
  _updateSetBadge();

  const savedTab = Storage.settings.getActiveTab();
  setActiveTab(savedTab, false);

  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = '20%';

  fetch('./songs-index.json')
    .then(r => r.json())
    .then(data => {
      _index = data;
      if (fill) fill.style.width = '60%';
      applyFilters();
      if (fill) fill.style.width = '90%';
      setTimeout(() => {
        document.getElementById('splash')?.classList.add('hidden');
        if (fill) fill.style.width = '100%';
        onReady?.();
      }, 200);

      // Load full song data in background
      fetch('./songs.json')
        .then(r => r.json())
        .then(songs => {
          const extra = Storage.songs.getExtraChords();
          songs.forEach(s => {
            if (extra[s.id] && !s.chords) {
              s.chord_lyrics = extra[s.id].chord_lyrics;
              s.chords       = extra[s.id].chords;
            }
            const src = s.chord_lyrics || s.lyrics || '';
            s._first = src.split(/<BR>|<slide>/i)[0].trim();
            const idx = _index.find(x => x.i === s.id);
            if (idx) idx.fl = s._first;
            _detail[s.id] = s;
          });
          _fullLoaded = true;
          // If a song is open and was waiting for lyrics, refresh
          if (_activeSong) {
            const full = _detail[_activeSong.id];
            if (full && !_activeSong._fullLoaded) {
              _activeSong = { ...full, _fullLoaded: true };
              renderDetail(_activeSong);
            }
          }
        })
        .catch(() => {});
    })
    .catch(() => {
      const sub = document.getElementById('splash')?.querySelector('.splash-sub');
      if (sub) sub.textContent = 'ஏற்றுவதில் பிழை உள்ளது.';
    });
}

// ── Filters ───────────────────────────────────────────────────────────────
export function applyFilters() {
  const q = document.getElementById('searchbox')?.value.trim().toLowerCase() || '';
  const clear = document.getElementById('search-clear');
  if (clear) clear.style.display = q ? 'block' : 'none';

  let list = _index;
  if (_chordsOnly) list = list.filter(s => s.c);
  if (_favOnly)    list = list.filter(s => _favs.has(s.i));
  if (q) list = list.filter(s => {
    const n = String(s.n || '');
    return n === q || n.startsWith(q) ||
      (s.t || '').toLowerCase().includes(q) ||
      (s.e || '').toLowerCase().includes(q) ||
      (s.fl || '').toLowerCase().includes(q);
  });
  _filtered = list;
  _renderList(list);
  _updateCountBar(list.length);
}

export function setActiveTab(tab, runFilters = true) {
  _activeTab  = tab;
  _chordsOnly = tab === 'chords';
  _favOnly    = tab === 'favs';
  Storage.settings.saveActiveTab(tab);

  ['songs','chords','favs','tracker','piano'].forEach(t => {
    document.getElementById('tab-' + t)?.classList.toggle('active', tab === t);
  });
  document.getElementById('chords-pill')?.classList.toggle('active', _chordsOnly);
  document.getElementById('fav-pill')?.classList.toggle('active', _favOnly);
  document.getElementById('tracker-view')?.classList.toggle('show', tab === 'tracker');
  document.getElementById('piano-view')?.classList.toggle('show', tab === 'piano');
  if (tab === 'piano' && window._initPiano) window._initPiano();
  if (runFilters) applyFilters();
}

export function toggleFilter(type) {
  if (type === 'chords') setActiveTab(_activeTab === 'chords' ? 'songs' : 'chords');
  else                   setActiveTab(_activeTab === 'favs'   ? 'songs' : 'favs');
}

function _updateCountBar(n) {
  const el = document.getElementById('song-count');
  if (el) el.textContent = `${n} / ${_index.length} பாடல்கள்`;
}

// ── List rendering ─────────────────────────────────────────────────────────
function _renderList(songs) {
  const el = document.getElementById('song-list');
  if (!el) return;
  if (!songs.length) {
    el.innerHTML = '<div class="list-empty">பாடல்கள் கிடைக்கவில்லை</div>';
    return;
  }
  el.innerHTML = songs.map(s => `
    <div class="song-item" data-id="${s.i}" onclick="openSong(${s.i})">
      <div class="song-num">${s.n || '—'}</div>
      <div class="song-info">
        <div class="song-title">${escHtml(s.t || s.e || '')}</div>
        ${s.e && s.e !== s.t ? `<div class="song-eng">${escHtml(s.e)}</div>` : ''}
      </div>
      <div class="song-badges">
        ${s.c ? '<div class="badge-chord">♪</div>' : ''}
        ${_favs.has(s.i) ? '<div class="badge-fav">★</div>' : ''}
      </div>
    </div>`).join('');
}

// ── Open song ──────────────────────────────────────────────────────────────
export function openSong(id) {
  document.querySelectorAll('.song-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.song-item[data-id="${id}"]`);
  if (item) { item.classList.add('active'); item.scrollIntoView({ block: 'nearest' }); }

  const idx  = _index.find(s => s.i === id);
  const full = _detail[id];
  _activeSong = full ? { ...full, _fullLoaded: true } : { id, ...(idx || {}), i: id, _fullLoaded: false };
  _transpose  = 0;
  _showChords = true;

  renderDetail(_activeSong);
  _showDetailView();
  acquireWakeLock();
  history.pushState({ songId: id }, '', location.pathname);
}

function _showDetailView() {
  document.getElementById('detail-view')?.classList.add('show');
}

// Called by Nav.back() handler in app.js
export function closeDetailView() {
  document.getElementById('detail-view')?.classList.remove('show');
  ['songs','chords','favs'].forEach(t => {
    document.getElementById('tab-' + t)?.classList.toggle('active', _activeTab === t);
  });
}

// ── Scale notes ────────────────────────────────────────────────────────────
function _getScaleNotes(keyStr) {
  if (!keyStr) return [];
  const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const MAJ = [0,2,4,5,7,9,11];
  const MIN = [0,2,3,5,7,8,10];
  const m = keyStr.match(/^([A-G][#b]?)\s*(major|minor|maj|min)?/i);
  if (!m) return [];
  const root = m[1];
  const isMinor = (m[2] || '').toLowerCase().startsWith('min');
  const intervals = isMinor ? MIN : MAJ;
  const names = root.includes('b') ? FLATS : SHARPS;
  const ri = names.indexOf(root);
  if (ri === -1) return [];
  return [...intervals.map(i => names[(ri + i) % 12]), root];
}

// ── Render detail ──────────────────────────────────────────────────────────
export function renderDetail(song) {
  const id       = song.id || song.i;
  const title    = song.title || song.t || song.name || song.e || '';
  const engTitle = song.name  || song.e || '';
  const num      = song.num   || song.n || '';
  const key      = song.key   || song.k || '';
  const hasChords = !!(song.chords && song.chord_lyrics);
  const isFav    = _favs.has(id);
  const inSet    = _setlist.includes(id);

  let chips = '';
  if (key)      chips += `<span class="chip key">🎵 ${escHtml(key)}</span>`;
  if (hasChords) chips += `<span class="chip chord-chip">🎸 Chords</span>`;

  const si = _setlist.indexOf(id);
  const navRow = (si !== -1 && _setlist.length > 1) ? `
    <div class="nav-row">
      <button class="nav-btn" onclick="setlistNav(-1)" ${si===0?'disabled':''}>‹ Prev</button>
      <button class="nav-btn" onclick="setlistNav(1)" ${si===_setlist.length-1?'disabled':''}>Next ›</button>
    </div>` : '';

  const detectedKey = hasChords ? _detectSongKey(song.chords) : '';
  const transposeHtml = hasChords ? `
    <div class="transpose-row">
      <button class="action-btn ${_showChords?'chord-on':''}" id="chords-vis-btn" onclick="toggleChordsVis()">🎸 ${_showChords?'ON':'OFF'}</button>
      <span class="tr-label">Key</span>
      <button class="tr-btn" onclick="changeTranspose(-1)">−</button>
      <div id="transpose-value">${_transpose>=0?'+'+_transpose:''+_transpose}</div>
      <button class="tr-btn" onclick="changeTranspose(+1)">+</button>
      <button class="tr-btn" onclick="changeTranspose(0,'reset')" style="font-size:13px">↺</button>
      <span id="key-display" class="chip key" style="margin-left:4px">${detectedKey||key||'?'}</span>
    </div>
    <div id="capo-suggestion" class="capo-hint"></div>` : '';

  const shareHtml = 'share' in navigator
    ? `<button class="action-btn" id="share-btn" onclick="shareSong()">↗ Share</button>` : '';

  const scaleNotes = _getScaleNotes(key);
  const scaleHtml  = scaleNotes.length
    ? `<div class="scale-row">${scaleNotes.map((n,i) =>
        `<span class="scale-note${(i===0||i===scaleNotes.length-1)?' root':''}">${n}</span>`
      ).join('')}</div>` : '';

  document.getElementById('detail-inner').innerHTML = `
    <button class="back-btn" onclick="goBack()">← Back</button>
    <div class="song-header">
      ${num ? `<div class="song-number">பாடல் — ${num}</div>` : ''}
      <div class="song-tamil-title">${escHtml(title)}</div>
      ${engTitle && engTitle !== title ? `<div class="song-eng-title">${escHtml(engTitle)}</div>` : ''}
      ${chips ? `<div class="music-chips">${chips}</div>` : ''}
      ${scaleHtml}
    </div>
    <div class="action-bar">
      <button class="action-btn ${isFav?'on':''}" id="fav-btn" onclick="toggleFav(${id})">${isFav?'★':'☆'} ${isFav?'Saved':'Favourite'}</button>
      <button class="action-btn ${inSet?'set-on':''}" id="set-btn" onclick="toggleSetlist(${id})">${inSet?'✓ In set':'＋ Set list'}</button>
      <button class="action-btn" onclick="changeFont(-1)">A−</button>
      <button class="action-btn" onclick="changeFont(1)">A+</button>
      ${shareHtml}
    </div>
    ${transposeHtml}
    ${navRow}
    <div id="lyrics-body"></div>`;

  if (song._fullLoaded) {
    renderLyrics();
  } else {
    // Skeleton while full data loads
    document.getElementById('lyrics-body').innerHTML =
      Array(6).fill('<div class="skel-line"></div>').join('') +
      `<div class="skel-line" style="width:60%"></div>`;
    const checkInterval = setInterval(() => {
      if (_detail[id]) {
        clearInterval(checkInterval);
        _activeSong = { ..._detail[id], _fullLoaded: true };
        renderDetail(_activeSong);
      }
    }, 200);
    setTimeout(() => clearInterval(checkInterval), 8000);
  }
}

// ── Lyrics rendering ───────────────────────────────────────────────────────
function _buildSlides(lyricsStr, chordsStr, steps) {
  if (!lyricsStr) return [];
  const L = lyricsStr.split('<slide>');
  const C = chordsStr ? chordsStr.split('<slide>') : [];
  return L.map((blk, si) => {
    const lines = blk.split('<BR>').filter(l => l.trim());
    const cl    = (C[si] || '').split(/<br>/i);
    return lines.map((lyric, li) => {
      let chord = (cl[li] || '').trimEnd();
      if (chord && steps) chord = transposeLine(chord, steps);
      return { lyric, chord };
    });
  });
}

export function renderLyrics() {
  const body = document.getElementById('lyrics-body');
  if (!body || !_activeSong) return;
  const hasChords = !!(_activeSong.chords && _activeSong.chord_lyrics);
  const slides    = _buildSlides(
    hasChords ? _activeSong.chord_lyrics : _activeSong.lyrics,
    hasChords ? _activeSong.chords : '',
    _transpose
  );

  if (!slides.length) {
    body.innerHTML = '<div class="no-chords-note">இந்த பாடலுக்கு lyrics இல்லை</div>';
    return;
  }

  if (!hasChords) {
    body.innerHTML = `<div class="no-chords-note" style="margin-bottom:10px">Chords இல்லை — lyrics மட்டுமே காட்டப்படுகிறது</div>
      <button class="find-chords-btn" id="find-chords-btn" onclick="findChordsOnline()">🔍 Find Chords Online</button>
      <div id="find-chords-result"></div>` +
      slides.map(lines => `<div class="slide">${lines.map(({ lyric }) =>
        `<div class="lyric-line no-chord"><div class="lyric-text">${escHtml(lyric)}</div></div>`
      ).join('')}</div>`).join('');
    return;
  }

  body.innerHTML = slides.map(lines => `<div class="slide">${
    lines.map(({ lyric, chord }) => {
      const dc = _showChords && chord;
      return `<div class="lyric-line ${dc ? 'has-chord' : 'no-chord'}">
        ${dc ? `<div class="chord-row">${escHtml(chord)}</div>` : ''}
        <div class="lyric-text">${escHtml(lyric)}</div>
      </div>`;
    }).join('')
  }</div>`).join('');

  const tv = document.getElementById('transpose-value');
  if (tv) tv.textContent = _transpose >= 0 ? '+' + _transpose : '' + _transpose;
}

// ── Transpose / key detection ──────────────────────────────────────────────
function _detectSongKey(chordsStr) {
  if (!chordsStr) return '';
  const matches = chordsStr.match(/[A-G][b#]?/g) || [];
  const freq = {};
  matches.forEach(n => { freq[n] = (freq[n] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function _getCapoSuggestion(originalKey, semitones) {
  if (!originalKey || !semitones) return '';
  const rootIdx = CHROMATIC.indexOf(ENHARMONIC[originalKey] || originalKey);
  if (rootIdx < 0) return '';
  const targetIdx = ((rootIdx + semitones) % 12 + 12) % 12;
  const targetKey = CHROMATIC[targetIdx];
  const suggestions = [];
  for (const gk of ['C','D','E','G','A']) {
    const gkIdx = CHROMATIC.indexOf(gk);
    const capo  = ((targetIdx - gkIdx) % 12 + 12) % 12;
    if (capo <= 7) suggestions.push({ key: gk, capo });
  }
  if (!suggestions.length) return `Key: ${targetKey}`;
  const best = suggestions.sort((a, b) => a.capo - b.capo)[0];
  if (best.capo === 0) return `Key: ${targetKey} (open chords)`;
  return `Key: ${targetKey} — Capo ${best.capo} → play as ${best.key}`;
}

export function changeTranspose(d, mode) {
  if (mode === 'reset') _transpose = 0; else _transpose += d;
  renderLyrics();
  const tv = document.getElementById('transpose-value');
  if (tv) tv.textContent = _transpose >= 0 ? '+' + _transpose : '' + _transpose;
  const kd = document.getElementById('key-display');
  const cs = document.getElementById('capo-suggestion');
  if (kd && _activeSong) {
    const origKey = _detectSongKey(_activeSong.chords) || _activeSong.key || '';
    if (origKey) {
      const rootIdx = CHROMATIC.indexOf(ENHARMONIC[origKey] || origKey);
      const newKey  = rootIdx >= 0 ? CHROMATIC[((rootIdx + _transpose) % 12 + 12) % 12] : origKey;
      kd.textContent = newKey;
      if (cs) cs.textContent = _getCapoSuggestion(origKey, _transpose);
    }
  }
}

export function toggleChordsVis() {
  _showChords = !_showChords;
  const b = document.getElementById('chords-vis-btn');
  if (b) { b.classList.toggle('chord-on', _showChords); b.textContent = '🎸 ' + (_showChords ? 'ON' : 'OFF'); }
  renderLyrics();
}

export function changeFont(d) {
  _fontSize = Math.max(13, Math.min(30, _fontSize + d));
  Storage.songs.saveFontSize(_fontSize);
  _applyFontSize();
}

// ── Favourites ─────────────────────────────────────────────────────────────
export function toggleFav(id) {
  if (_favs.has(id)) _favs.delete(id); else _favs.add(id);
  _saveFavs();
  const b = document.getElementById('fav-btn');
  if (b) { const on = _favs.has(id); b.classList.toggle('on', on); b.textContent = on ? '★ Saved' : '☆ Favourite'; }
  const li = document.querySelector(`.song-item[data-id="${id}"] .badge-fav`);
  const badges = document.querySelector(`.song-item[data-id="${id}"] .song-badges`);
  if (_favs.has(id) && !li && badges) badges.insertAdjacentHTML('beforeend', '<div class="badge-fav">★</div>');
  else if (!_favs.has(id) && li) li.remove();
  if (_favOnly) applyFilters();
}

// ── Set list ───────────────────────────────────────────────────────────────
export function toggleSetlist(id) {
  const i = _setlist.indexOf(id);
  if (i === -1) _setlist.push(id); else _setlist.splice(i, 1);
  _saveSetlist();
  if (_activeSong && (_activeSong.id === id || _activeSong.i === id)) renderDetail(_activeSong);
  renderSetlist();
  if (navigator.vibrate) navigator.vibrate(20);
}

export function renderSetlist() {
  const body = document.querySelector('#setlist-sheet .sheet-body');
  if (!body) return;
  const badge = document.getElementById('setlist-badge');
  if (badge) badge.textContent = _setlist.length ? '(' + _setlist.length + ')' : '';
  if (!_setlist.length) {
    body.innerHTML = '<div class="sheet-empty">Set list empty<br><small>Song detail view → ＋ Set list</small></div>';
    return;
  }
  body.innerHTML = _setlist.map((id, i) => {
    const s = _detail[id] || _index.find(x => x.i === id);
    const t = s ? (s.title || s.t || s.e || '') : ('Song ' + id);
    const n = s ? (s.num || s.n || '') : '';
    return `<div class="sl-item">
      <span class="sl-n">${n}</span>
      <span class="sl-title" onclick="openSong(${id})">${escHtml(t)}</span>
      <button class="sl-btn" onclick="moveSet(${i},-1)" ${i===0?'disabled':''}>↑</button>
      <button class="sl-btn" onclick="moveSet(${i},1)" ${i===_setlist.length-1?'disabled':''}>↓</button>
      <button class="sl-btn" onclick="removeSet(${id})" title="Remove">✕</button>
    </div>`;
  }).join('');
}

export function openSetlistSheet()  { document.getElementById('setlist-sheet')?.classList.add('open'); renderSetlist(); }
export function closeSetlistSheet() { document.getElementById('setlist-sheet')?.classList.remove('open'); }
export function clearSetlist()      {
  if (confirm('Set list அழிக்கவா?')) {
    _setlist = []; _saveSetlist(); renderSetlist();
    if (_activeSong) renderDetail(_activeSong);
  }
}
export function moveSet(i, d) {
  const j = i + d;
  if (j < 0 || j >= _setlist.length) return;
  [_setlist[i], _setlist[j]] = [_setlist[j], _setlist[i]];
  _saveSetlist(); renderSetlist();
}
export function removeSet(id) {
  _setlist = _setlist.filter(x => x !== id);
  _saveSetlist(); renderSetlist();
  if (_activeSong && (_activeSong.id === id || _activeSong.i === id)) renderDetail(_activeSong);
}
export function setlistNav(d) {
  if (!_activeSong) return;
  const id = _activeSong.id || _activeSong.i;
  const si = _setlist.indexOf(id);
  if (si === -1) return;
  const nid = _setlist[si + d];
  if (nid != null) openSong(nid);
}

// ── Share ──────────────────────────────────────────────────────────────────
export function shareSong() {
  if (!_activeSong) return;
  const title = _activeSong.title || _activeSong.t || _activeSong.name || _activeSong.e || 'Song';
  navigator.share && navigator.share({ title, text: title + ' — JHGPH Songbook' }).catch(() => {});
}

// ── Find Chords Online ─────────────────────────────────────────────────────
export async function findChordsOnline() {
  if (!_activeSong) return;
  const btn      = document.getElementById('find-chords-btn');
  const resultEl = document.getElementById('find-chords-result');
  if (!btn || !resultEl) return;

  const title = _activeSong.title || _activeSong.t || _activeSong.name || '';
  btn.disabled   = true;
  btn.textContent = '🔍 Searching...';
  resultEl.innerHTML = '';

  const PROXY     = 'https://corsproxy.io/?';
  const searchUrl = `https://churchspot.com/search-results/?skeyword=${encodeURIComponent(title)}&submit=SEARCH`;

  try {
    const r    = await fetch(PROXY + encodeURIComponent(searchUrl));
    const html = await r.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const links = [...doc.querySelectorAll('a[href]')]
      .map(a => a.href)
      .filter(h => h.match(/churchspot\.com\/\d{4}\/\d{2}\/\d{2}\//));

    if (!links.length) { await _findChordsFromChordsver(title, btn, resultEl); return; }

    const songR   = await fetch(PROXY + encodeURIComponent(links[0]));
    const songHtml = await songR.text();
    const songDoc  = new DOMParser().parseFromString(songHtml, 'text/html');
    const parsed   = _parseChurchspotDoc(songDoc);
    if (parsed) _showFoundChords(parsed, btn, resultEl);
    else await _findChordsFromChordsver(title, btn, resultEl);
  } catch {
    resultEl.innerHTML = `<div class="no-chords-note">⚠ Network error. Check internet connection.</div>`;
    btn.disabled = false; btn.textContent = '🔍 Find Chords Online';
  }
}

function _parseChurchspotDoc(doc) {
  const sp = doc.querySelector('.songpre');
  if (!sp) return null;
  const lines = []; let pendingChord = '';
  for (const child of sp.children) {
    const cls = child.className || '';
    if (cls.includes('chord')) { pendingChord = child.textContent.trim(); }
    else if (cls.includes('lyric') || cls.includes('word')) {
      lines.push({ lyric: child.textContent, chord: pendingChord }); pendingChord = '';
    } else if (child.tagName === 'BR') {
      if (pendingChord) { lines.push({ lyric: '', chord: pendingChord }); pendingChord = ''; }
    }
  }
  if (!lines.length) return null;
  const chordLines  = lines.map(l => l.chord || '');
  const lyricLines  = lines.map(l => l.lyric || '');
  return { chords: chordLines.join('<br>'), chord_lyrics: lyricLines.join('<BR>') };
}

async function _findChordsFromChordsver(title, btn, resultEl) {
  const PROXY = 'https://corsproxy.io/?';
  const url   = `https://chordsverse.com/?s=${encodeURIComponent(title)}`;
  try {
    const r   = await fetch(PROXY + encodeURIComponent(url));
    const html = await r.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const link = doc.querySelector('.entry-title a, h2 a, .post-title a');
    if (!link) { _showNotFound(btn, resultEl); return; }
    const songR   = await fetch(PROXY + encodeURIComponent(link.href));
    const songHtml = await songR.text();
    const songDoc  = new DOMParser().parseFromString(songHtml, 'text/html');
    const pre      = songDoc.querySelector('pre, .chord-sheet, .entry-content pre');
    if (!pre) { _showNotFound(btn, resultEl); return; }
    const text = pre.textContent;
    _showFoundChords({ rawText: text }, btn, resultEl);
  } catch { _showNotFound(btn, resultEl); }
}

function _showNotFound(btn, resultEl) {
  resultEl.innerHTML = `<div class="no-chords-note">⚠ Chords not found online for this song.</div>`;
  btn.disabled = false; btn.textContent = '🔍 Find Chords Online';
}

function _showFoundChords(data, btn, resultEl) {
  _foundChordsData = data;
  const preview = data.rawText
    ? data.rawText.substring(0, 400)
    : data.chord_lyrics?.split('<BR>').slice(0,8).join('\n') || '';
  resultEl.innerHTML = `
    <div class="find-chords-result-box">
      <div class="find-chords-result-title">✓ Chords found — preview:</div>
      <pre class="find-chords-preview">${escHtml(preview)}${preview.length>=400?'…':''}</pre>
      <div class="find-chords-actions">
        <button class="find-chords-save" onclick="saveFoundChords()">💾 Save to this song</button>
        <button class="find-chords-discard" onclick="discardFoundChords()">✕ Discard</button>
      </div>
    </div>`;
  btn.disabled = false; btn.textContent = '🔍 Find Chords Online';
}

export function saveFoundChords() {
  if (!_foundChordsData || !_activeSong) return;
  const id  = _activeSong.id || _activeSong.i;
  const extra = Storage.songs.getExtraChords();
  if (_foundChordsData.rawText) {
    const lines = _foundChordsData.rawText.split('\n');
    const chords = []; const lyrics = [];
    lines.forEach(line => {
      if (/^[A-G][b#]?/.test(line.trim())) { chords.push(line); lyrics.push(''); }
      else { lyrics.push(line); chords.push(''); }
    });
    extra[id] = { chords: chords.join('<br>'), chord_lyrics: lyrics.join('<BR>') };
  } else {
    extra[id] = { chords: _foundChordsData.chords, chord_lyrics: _foundChordsData.chord_lyrics };
  }
  Storage.songs.saveExtraChords(extra);
  if (_detail[id]) { _detail[id].chords = extra[id].chords; _detail[id].chord_lyrics = extra[id].chord_lyrics; }
  _activeSong = { ..._activeSong, ...extra[id], _fullLoaded: true };
  _foundChordsData = null;
  renderDetail(_activeSong);
  showToast('✓ Chords saved!');
}

export function discardFoundChords() {
  _foundChordsData = null;
  const r = document.getElementById('find-chords-result');
  if (r) r.innerHTML = '';
  const b = document.getElementById('find-chords-btn');
  if (b) { b.disabled = false; b.textContent = '🔍 Find Chords Online'; }
}

// ── Voice search ───────────────────────────────────────────────────────────
export function initVoiceSearch() {
  const voiceBtn  = document.getElementById('voice-btn');
  const searchbox = document.getElementById('searchbox');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { if (voiceBtn) voiceBtn.style.display = 'none'; return; }

  let listening = false;

  function toast(msg, dur = 2500) { showToast(msg, dur); }

  function start() {
    if (listening) return;
    const r = new SR();
    r.continuous = false; r.interimResults = true; r.maxAlternatives = 3; r.lang = 'ta-IN';

    r.onstart  = () => { listening = true; voiceBtn.classList.add('listening'); searchbox.placeholder = '🎤 கேட்கிறேன்...'; toast('🎤 தமிழில் பாடல் பெயர் சொல்லுங்கள்…', 8000); };
    r.onresult = e => { let best = ''; for (const res of e.results) for (const alt of res) if (alt.transcript.length > best.length) best = alt.transcript; searchbox.value = best; applyFilters(); };
    r.onend    = () => { listening = false; voiceBtn.classList.remove('listening'); searchbox.placeholder = 'பாடல் எண் அல்லது பெயர் தேடுங்கள்...'; };
    r.onerror  = e => {
      listening = false; voiceBtn.classList.remove('listening'); searchbox.placeholder = 'பாடல் எண் அல்லது பெயர் தேடுங்கள்...';
      if (e.error === 'not-allowed') toast('⚠ Microphone blocked', 4000);
      else if (e.error === 'no-speech') toast('No speech detected — try again', 2000);
      else if (e.error === 'network') toast('⚠ Internet needed for voice search', 3000);
    };
    try { r.start(); } catch (err) { toast('⚠ Could not start voice: ' + err.message, 3000); }
  }

  voiceBtn.addEventListener('click', () => {
    if (listening) { listening = false; voiceBtn.classList.remove('listening'); searchbox.placeholder = 'பாடல் எண் அல்லது பெயர் தேடுங்கள்...'; return; }
    start();
  });
}

// ── Accessors for app.js ───────────────────────────────────────────────────
export function getActiveSong()  { return _activeSong; }
export function getActiveTab()   { return _activeTab; }
