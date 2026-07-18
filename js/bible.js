// bible.js — Bible reader, search, verse favourites, topic notes, verse picker.

import { Storage } from './storage.js';
import { escHtml, showToast } from './ui.js';

// ── Book data ──────────────────────────────────────────────────────────────
export const BIBLE_BOOKS = [
  {t:'ஆதியாகமம்',    e:'Genesis',         c:50,  s:'OT'},
  {t:'யாத்திராகமம்', e:'Exodus',          c:40,  s:'OT'},
  {t:'லேவியராகமம்',  e:'Leviticus',       c:27,  s:'OT'},
  {t:'எண்ணாகமம்',    e:'Numbers',         c:36,  s:'OT'},
  {t:'உபாகமம்',      e:'Deuteronomy',     c:34,  s:'OT'},
  {t:'யோசுவா',       e:'Joshua',          c:24,  s:'OT'},
  {t:'நியாயாதிபதிகள்',e:'Judges',         c:21,  s:'OT'},
  {t:'ரூத்',         e:'Ruth',            c:4,   s:'OT'},
  {t:'1 சாமுவேல்',   e:'1 Samuel',        c:31,  s:'OT'},
  {t:'2 சாமுவேல்',   e:'2 Samuel',        c:24,  s:'OT'},
  {t:'1 இராஜாக்கள்', e:'1 Kings',         c:22,  s:'OT'},
  {t:'2 இராஜாக்கள்', e:'2 Kings',         c:25,  s:'OT'},
  {t:'1 நாளாகமம்',   e:'1 Chronicles',    c:29,  s:'OT'},
  {t:'2 நாளாகமம்',   e:'2 Chronicles',    c:36,  s:'OT'},
  {t:'எஸ்றா',        e:'Ezra',            c:10,  s:'OT'},
  {t:'நெகேமியா',     e:'Nehemiah',        c:13,  s:'OT'},
  {t:'எஸ்தர்',       e:'Esther',          c:10,  s:'OT'},
  {t:'யோபு',         e:'Job',             c:42,  s:'OT'},
  {t:'சங்கீதம்',     e:'Psalms',          c:150, s:'OT'},
  {t:'நீதிமொழிகள்',  e:'Proverbs',        c:31,  s:'OT'},
  {t:'பிரசங்கி',     e:'Ecclesiastes',    c:12,  s:'OT'},
  {t:'உன்னதப்பாட்டு',e:'Song of Solomon', c:8,   s:'OT'},
  {t:'ஏசாயா',        e:'Isaiah',          c:66,  s:'OT'},
  {t:'எரேமியா',      e:'Jeremiah',        c:52,  s:'OT'},
  {t:'புலம்பல்',     e:'Lamentations',    c:5,   s:'OT'},
  {t:'எசேக்கியேல்',  e:'Ezekiel',         c:48,  s:'OT'},
  {t:'தானியேல்',     e:'Daniel',          c:12,  s:'OT'},
  {t:'ஓசியா',        e:'Hosea',           c:14,  s:'OT'},
  {t:'யோவேல்',       e:'Joel',            c:3,   s:'OT'},
  {t:'ஆமோஸ்',        e:'Amos',            c:9,   s:'OT'},
  {t:'ஒபதியா',       e:'Obadiah',         c:1,   s:'OT'},
  {t:'யோனா',         e:'Jonah',           c:4,   s:'OT'},
  {t:'மீகா',         e:'Micah',           c:7,   s:'OT'},
  {t:'நாகூம்',       e:'Nahum',           c:3,   s:'OT'},
  {t:'ஆபகூக்',       e:'Habakkuk',        c:3,   s:'OT'},
  {t:'செப்பனியா',    e:'Zephaniah',       c:3,   s:'OT'},
  {t:'ஆகாய்',        e:'Haggai',          c:2,   s:'OT'},
  {t:'சகரியா',       e:'Zechariah',       c:14,  s:'OT'},
  {t:'மலாக்கி',      e:'Malachi',         c:4,   s:'OT'},
  {t:'மத்தேயு',      e:'Matthew',         c:28,  s:'NT'},
  {t:'மாற்கு',       e:'Mark',            c:16,  s:'NT'},
  {t:'லூக்கா',       e:'Luke',            c:24,  s:'NT'},
  {t:'யோவான்',       e:'John',            c:21,  s:'NT'},
  {t:'அப்போஸ்தலர்',  e:'Acts',            c:28,  s:'NT'},
  {t:'ரோமர்',        e:'Romans',          c:16,  s:'NT'},
  {t:'1 கொரிந்தியர்',e:'1 Corinthians',   c:16,  s:'NT'},
  {t:'2 கொரிந்தியர்',e:'2 Corinthians',   c:13,  s:'NT'},
  {t:'கலாத்தியர்',   e:'Galatians',       c:6,   s:'NT'},
  {t:'எபேசியர்',     e:'Ephesians',       c:6,   s:'NT'},
  {t:'பிலிப்பியர்',  e:'Philippians',     c:4,   s:'NT'},
  {t:'கொலோசெயர்',   e:'Colossians',      c:4,   s:'NT'},
  {t:'1 தெசலோனிக்கேயர்',e:'1 Thessalonians',c:5, s:'NT'},
  {t:'2 தெசலோனிக்கேயர்',e:'2 Thessalonians',c:3, s:'NT'},
  {t:'1 தீமோத்தேயு', e:'1 Timothy',       c:6,   s:'NT'},
  {t:'2 தீமோத்தேயு', e:'2 Timothy',       c:4,   s:'NT'},
  {t:'தீத்து',       e:'Titus',           c:3,   s:'NT'},
  {t:'பிலேமோன்',     e:'Philemon',        c:1,   s:'NT'},
  {t:'எபிரெயர்',     e:'Hebrews',         c:13,  s:'NT'},
  {t:'யாக்கோபு',     e:'James',           c:5,   s:'NT'},
  {t:'1 பேதுரு',     e:'1 Peter',         c:5,   s:'NT'},
  {t:'2 பேதுரு',     e:'2 Peter',         c:3,   s:'NT'},
  {t:'1 யோவான்',     e:'1 John',          c:5,   s:'NT'},
  {t:'2 யோவான்',     e:'2 John',          c:1,   s:'NT'},
  {t:'3 யோவான்',     e:'3 John',          c:1,   s:'NT'},
  {t:'யூதா',         e:'Jude',            c:1,   s:'NT'},
  {t:'வெளிப்படுத்தல்',e:'Revelation',     c:22,  s:'NT'},
];

// ── State ──────────────────────────────────────────────────────────────────
let _bookIdx     = -1;
let _chapter     = -1;
let _verseCount  = 0;
let _lang        = Storage.bible.getLang();
let _fontSize    = Storage.bible.getFontSize();
let _favs        = Storage.bible.getFavs();
let _notes       = Storage.bible.getNotes();
let _inited      = false;

// context for add-to-topic sheet
let _atsCtx = null;

// in-memory book cache for search
const _tamBookCache = {};
let _bsearchAbort = false;
let _bsearchTimer = null;

// ── Helpers ────────────────────────────────────────────────────────────────
function _saveNotes()  { Storage.bible.saveNotes(_notes); }
function _saveFavs()   { Storage.bible.saveFavs(_favs); }

function _isCached(bookIdx, ch) {
  return !!localStorage.getItem(`njp-bc-tam-${bookIdx}-${ch}`) ||
         !!localStorage.getItem(`njp-bc-kjv-${bookIdx}-${ch}`) ||
         !!localStorage.getItem(`njp-bc-${bookIdx}-${ch}`);
}

function _setTitle(txt) {
  const el = document.getElementById('bible-hdr-title');
  if (el) el.textContent = '📖 ' + txt;
}

function _verseInAnyTopic(key) {
  return Object.values(_notes).some(t => t.verses?.some(v => v.key === key));
}

function _refreshNotesBtnVisibility() {
  const btn = document.getElementById('bible-notes-btn');
  if (btn) btn.style.display = Object.keys(_notes).length ? 'flex' : 'none';
}

// ── Init ───────────────────────────────────────────────────────────────────
export function init() {
  document.documentElement.style.setProperty('--bible-fs', _fontSize + 'px');
  document.getElementById('blb-' + _lang)?.classList.add('active');
  document.querySelectorAll('.bible-lang-btn').forEach(b => {
    if (b.id !== 'blb-' + _lang) b.classList.remove('active');
  });
  if (Object.keys(_notes).length) setTimeout(_refreshNotesBtnVisibility, 500);
}

export function initBible() {
  if (_inited) return;
  _inited = true;
  renderBibleBooks();
}

// ── Language / font ────────────────────────────────────────────────────────
export function setBibleLang(lang) {
  _lang = lang;
  Storage.bible.saveLang(lang);
  document.querySelectorAll('.bible-lang-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('blb-' + lang)?.classList.add('active');
  if (_bookIdx >= 0 && _chapter > 0) renderBibleReader(_bookIdx, _chapter);
}

export function changeBibleFont(d) {
  _fontSize = Math.min(26, Math.max(13, _fontSize + d));
  Storage.bible.saveFontSize(_fontSize);
  document.documentElement.style.setProperty('--bible-fs', _fontSize + 'px');
}

// ── Data fetching ──────────────────────────────────────────────────────────
async function _fetchChapter(translation, bookIdx, ch) {
  const key    = `njp-bc-${translation}-${bookIdx}-${ch}`;
  const oldKey = `njp-bc-${bookIdx}-${ch}`;
  const cached = localStorage.getItem(key) || (translation === 'tam' ? localStorage.getItem(oldKey) : null);
  if (cached) return JSON.parse(cached);

  if (translation === 'tam') {
    const bookKey    = `njp-tb-${bookIdx}`;
    const bookCached = localStorage.getItem(bookKey);
    let bookData     = bookCached ? JSON.parse(bookCached) : null;
    if (!bookData) {
      const r = await fetch(`./bible-tam/${bookIdx + 1}.json`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      bookData = await r.json();
      try { localStorage.setItem(bookKey, JSON.stringify(bookData)); } catch {}
    }
    const verseArr = bookData[String(ch)];
    if (!verseArr) throw new Error('Chapter not found');
    const data = { verses: verseArr };
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
    return data;
  }

  const url = `https://api.getbible.net/v2/${translation}/${bookIdx + 1}/${ch}.json`;
  const r   = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
  return data;
}

// ── Book list ──────────────────────────────────────────────────────────────
export function renderBibleBooks() {
  _bookIdx = -1; _chapter = -1;
  _setTitle('பரிசுத்த வேதாகமம்');
  const btn = document.getElementById('bible-fav-btn');
  if (btn) btn.style.display = _favs.size ? 'flex' : 'none';

  const el  = document.getElementById('bible-content');
  const ot  = BIBLE_BOOKS.filter(b => b.s === 'OT');
  const nt  = BIBLE_BOOKS.filter(b => b.s === 'NT');

  function grid(books, offset) {
    return books.map((b, i) => {
      const idx = offset + i;
      return `<div class="bible-book-btn" onclick="renderBibleChapters(${idx})">
        <div class="bible-book-name">${b.t}</div>
        <div class="bible-book-meta">${b.e} · ${b.c} ch</div>
      </div>`;
    }).join('');
  }

  el.innerHTML = `
    <div class="bible-section-lbl">பழைய ஏற்பாடு — Old Testament (39 books)</div>
    <div class="bible-book-grid">${grid(ot, 0)}</div>
    <div class="bible-section-lbl">புதிய ஏற்பாடு — New Testament (27 books)</div>
    <div class="bible-book-grid">${grid(nt, 39)}</div>`;
  el.scrollTop = 0;
}

// ── Chapter grid ───────────────────────────────────────────────────────────
export function renderBibleChapters(bookIdx) {
  _bookIdx = bookIdx;
  const book = BIBLE_BOOKS[bookIdx];
  _setTitle(book.t);
  const el = document.getElementById('bible-content');
  el.innerHTML = `
    <button class="bible-back" onclick="renderBibleBooks()">← புத்தகங்கள்</button>
    <div class="bible-section-lbl">${book.t} (${book.e}) — ${book.c} chapters</div>
    <div class="bible-ch-grid">
      ${Array.from({ length: book.c }, (_, i) => i + 1).map(ch =>
        `<div class="bible-ch-btn ${_isCached(bookIdx, ch) ? 'cached' : ''}"
              onclick="renderBibleReader(${bookIdx},${ch})">${ch}</div>`
      ).join('')}
    </div>`;
  el.scrollTop = 0;
}

// ── Verse reader ───────────────────────────────────────────────────────────
export async function renderBibleReader(bookIdx, ch, highlightVerse) {
  _bookIdx = bookIdx; _chapter = ch;
  const book = BIBLE_BOOKS[bookIdx];
  _setTitle(book.t + ' ' + ch);
  const el = document.getElementById('bible-content');

  const backBtn = `<button class="bible-back" onclick="renderBibleChapters(${bookIdx})">← ${book.t}</button>`;
  const vjBtn   = `<button class="vj-btn" onclick="openVersePicker()">↓ Verse</button>`;
  const title   = _lang === 'english'
    ? `<div class="bible-reader-title">${book.e} — Chapter ${ch} ${vjBtn}</div>`
    : `<div class="bible-reader-title">${book.t} — அதிகாரம் ${ch} ${vjBtn}</div>`;

  // Check if already cached — render instantly, skip spinner
  const tamCacheKey = `njp-bc-tam-${bookIdx}-${ch}`;
  const kjvCacheKey = `njp-bc-kjv-${bookIdx}-${ch}`;
  const hasTamCache = !!localStorage.getItem(tamCacheKey) || !!localStorage.getItem(`njp-bc-${bookIdx}-${ch}`);
  const hasKjvCache = !!localStorage.getItem(kjvCacheKey);
  const needTamil   = _lang === 'tamil'   || _lang === 'both';
  const needEnglish = _lang === 'english'  || _lang === 'both';
  const isFullyCached = (needTamil ? hasTamCache : true) && (needEnglish ? hasKjvCache : true);

  if (!isFullyCached) {
    el.innerHTML = `${backBtn}${title}
      <div class="bible-loader"><div class="bible-spinner"></div>வசனங்கள் ஏற்றுகிறது...</div>`;
    el.scrollTop = 0;
  }

  try {
    const [tamData, kjvData] = await Promise.all([
      needTamil   ? _fetchChapter('tam', bookIdx, ch).catch(() => null) : Promise.resolve(null),
      needEnglish ? _fetchChapter('kjv', bookIdx, ch).catch(() => null) : Promise.resolve(null),
    ]);

    if (needTamil && needEnglish && !tamData && !kjvData) throw new Error('offline');
    if (_lang === 'tamil'   && !tamData) throw new Error('offline');
    if (_lang === 'english' && !kjvData) throw new Error('offline');

    const tamVerses  = tamData?.verses || [];
    const kjvVerses  = kjvData?.verses || [];
    const kjvMap     = {};
    kjvVerses.forEach(v => { kjvMap[v.verse] = v.text || ''; });

    const baseVerses = needTamil ? tamVerses : kjvVerses;
    const prevCh     = ch > 1       ? ch - 1 : null;
    const nextCh     = ch < book.c  ? ch + 1 : null;

    el.innerHTML = `${backBtn}${title}
      ${baseVerses.map(v => {
        const favKey    = `${bookIdx}-${ch}-${v.verse}`;
        const isFav     = _favs.has(favKey);
        const tamTxt    = escHtml(v.text || '');
        const kjvTxt    = escHtml(kjvMap[v.verse] || '');
        const hasNote   = _verseInAnyTopic(favKey);
        const noteTxt   = _lang === 'english' ? kjvTxt : tamTxt;

        let content = '';
        if (_lang === 'tamil')        content = `<span class="bible-vtext">${tamTxt}</span>`;
        else if (_lang === 'english') content = `<span class="bible-vtext">${kjvTxt}</span>`;
        else                          content = `<span class="bible-vtext">${tamTxt}<span class="bible-vtext-en">${kjvTxt}</span></span>`;

        return `<div class="bible-verse ${isFav ? 'highlighted' : ''}" id="bv-${v.verse}">
          <span class="bible-vnum" onclick="toggleBibleFav('${favKey}',${v.verse})">${v.verse}</span>
          ${content}
          <button class="vn-note-btn ${hasNote ? 'has-note' : ''}" id="nb-${v.verse}"
            onclick="openNoteModal(${bookIdx},${ch},${v.verse},\`${noteTxt.replace(/`/g, "'")}\`)" title="Note">✏️</button>
        </div>`;
      }).join('')}
      <div class="bible-ch-nav">
        <button class="bible-ch-nav-btn" onclick="renderBibleReader(${bookIdx},${prevCh})" ${!prevCh ? 'disabled' : ''}>‹ ${prevCh || ''}</button>
        <button class="bible-ch-nav-btn" onclick="renderBibleChapters(${bookIdx})" style="flex:0.6;font-size:18px">☰</button>
        <button class="bible-ch-nav-btn" onclick="renderBibleReader(${bookIdx},${nextCh})" ${!nextCh ? 'disabled' : ''}>${nextCh || ''} ›</button>
      </div>`;

    _verseCount = baseVerses.length;
    document.querySelectorAll('.bible-ch-btn').forEach(b => {
      if (+b.textContent === ch) b.classList.add('cached');
    });
    if (highlightVerse) {
      setTimeout(() => {
        const vEl = document.getElementById('bv-' + highlightVerse);
        if (vEl) { vEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); vEl.classList.add('highlighted'); }
      }, 200);
    }
  } catch {
    el.innerHTML = `${backBtn}
      <div class="bible-loader" style="color:var(--chord)">
        ⚠ இணையம் இல்லை / No internet<br>
        <span style="font-size:13px;color:var(--text2);text-align:center;line-height:1.6">
          இந்த அதிகாரம் முன்பு படிக்கவில்லை.<br>
          This chapter hasn't been read before.<br><br>
          <b>📖 Online-ல் ஒருமுறை படித்தால் Offline-லும் கிடைக்கும்.</b>
        </span>
      </div>`;
  }
  el.scrollTop = 0;
}

// ── Verse favourites ───────────────────────────────────────────────────────
export function toggleBibleFav(key, vNum) {
  if (_favs.has(key)) _favs.delete(key); else _favs.add(key);
  _saveFavs();
  const el = document.getElementById('bv-' + vNum);
  if (el) el.classList.toggle('highlighted', _favs.has(key));
  const btn = document.getElementById('bible-fav-btn');
  if (btn) btn.style.display = _favs.size ? 'flex' : 'none';
}

export function openBibleFavs() {
  _setTitle('Saved Verses');
  const el = document.getElementById('bible-content');
  if (!_favs.size) {
    el.innerHTML = `<button class="bible-back" onclick="renderBibleBooks()">← Books</button>
      <div class="bible-section-lbl">No saved verses yet</div>
      <p style="color:var(--text2);font-size:13px">Tap the verse number while reading to save it.</p>`;
    return;
  }
  el.innerHTML = `<button class="bible-back" onclick="renderBibleBooks()">← Books</button>
    <div class="bible-section-lbl">★ Saved Verses (${_favs.size})</div>` +
    [..._favs].map(key => {
      const [bi, ch, v] = key.split('-').map(Number);
      const book   = BIBLE_BOOKS[bi];
      const cached = localStorage.getItem(`njp-bc-${bi}-${ch}`);
      let text = '';
      if (cached) { const d = JSON.parse(cached); text = d.verses?.find(x => x.verse === v)?.text || ''; }
      return `<div class="bible-verse" onclick="renderBibleReader(${bi},${ch})">
        <span class="bible-vnum" style="min-width:auto;white-space:nowrap">${book?.t} ${ch}:${v}</span>
        <span class="bible-vtext" style="font-size:14px">${text ? escHtml(text) : '(tap to read)'}</span>
      </div>`;
    }).join('');
  el.scrollTop = 0;
}

// ── Verse picker ───────────────────────────────────────────────────────────
export function openVersePicker() {
  if (_verseCount < 1) return;
  const grid = document.getElementById('vp-grid');
  grid.innerHTML = '';
  for (let i = 1; i <= _verseCount; i++) {
    const key = `${_bookIdx}-${_chapter}-${i}`;
    const btn = document.createElement('button');
    btn.className = 'vp-btn' + (_verseInAnyTopic(key) ? ' has-note' : '');
    btn.textContent = i;
    btn.onclick = () => { jumpToVerse(i); closeVersePicker(); };
    grid.appendChild(btn);
  }
  document.getElementById('verse-picker')?.classList.add('open');
  document.getElementById('verse-picker-backdrop')?.classList.add('open');
}

export function closeVersePicker() {
  document.getElementById('verse-picker')?.classList.remove('open');
  document.getElementById('verse-picker-backdrop')?.classList.remove('open');
}

export function jumpToVerse(n) {
  const el = document.getElementById('bv-' + n);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.style.transition = 'background .2s';
  el.style.background = 'rgba(129,140,248,.22)';
  setTimeout(() => { el.style.background = ''; }, 1200);
}

// ── Notes — topic-collection model ────────────────────────────────────────
export function openNoteModal(bookIdx, ch, verse, verseText) {
  const verseKey = `${bookIdx}-${ch}-${verse}`;
  const book     = BIBLE_BOOKS[bookIdx];
  const ref      = book ? book.t + ' ' + ch + ':' + verse : ch + ':' + verse;
  const plain    = verseText.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
  _atsCtx = { verseKey, ref, text: plain };

  document.getElementById('ats-ref').textContent = ref;
  document.getElementById('ats-new-inp').value   = '';

  const topics  = Object.entries(_notes);
  const listEl  = document.getElementById('ats-topic-list');
  if (!topics.length) {
    listEl.innerHTML = `<p style="color:var(--text2);font-size:13px;margin:4px 0 8px">இன்னும் topics இல்லை. கீழே புதியதை உருவாக்கவும்.</p>`;
  } else {
    listEl.innerHTML = topics.map(([id, t]) => {
      const already = t.verses?.some(v => v.key === verseKey);
      return `<button class="ats-topic-btn${already ? ' already' : ''}" onclick="addVerseToTopic('${id}')">
        <span class="ats-topic-name">${escHtml(t.title)}</span>
        <span class="ats-topic-count">${t.verses?.length || 0} வசனங்கள்${already ? ' · ✓' : ''}</span>
      </button>`;
    }).join('');
  }

  document.getElementById('add-topic-backdrop')?.classList.add('open');
  document.getElementById('add-topic-sheet')?.classList.add('open');
}

export function closeAddTopicSheet() {
  document.getElementById('add-topic-sheet')?.classList.remove('open');
  document.getElementById('add-topic-backdrop')?.classList.remove('open');
  _atsCtx = null;
}

export function addVerseToTopic(topicId) {
  if (!_atsCtx) return;
  const t = _notes[topicId];
  if (!t) return;
  if (!t.verses) t.verses = [];
  const idx = t.verses.findIndex(v => v.key === _atsCtx.verseKey);
  if (idx !== -1) t.verses.splice(idx, 1);
  else t.verses.push({ key: _atsCtx.verseKey, ref: _atsCtx.ref, text: _atsCtx.text });
  _saveNotes();
  _syncVerseNoteBtn(_atsCtx.verseKey);
  closeAddTopicSheet();
}

export function createTopicAndAdd() {
  const inp   = document.getElementById('ats-new-inp');
  const title = inp.value.trim();
  if (!title) { inp.focus(); return; }
  const id     = 'nt-' + Date.now();
  const verses = _atsCtx ? [{ key: _atsCtx.verseKey, ref: _atsCtx.ref, text: _atsCtx.text }] : [];
  _notes[id]   = { title, created: Date.now(), verses };
  _saveNotes();
  if (_atsCtx) _syncVerseNoteBtn(_atsCtx.verseKey);
  _refreshNotesBtnVisibility();
  closeAddTopicSheet();
}

function _syncVerseNoteBtn(verseKey) {
  const verse  = verseKey.split('-')[2];
  const hasNote = _verseInAnyTopic(verseKey);
  const btn    = document.getElementById('nb-' + verse);
  if (btn) btn.classList.toggle('has-note', hasNote);
  _refreshNotesBtnVisibility();
  // refresh verse-picker grid if open
  const vBtn = document.querySelector(`#vp-grid .vp-btn:nth-child(${verse})`);
  if (vBtn) vBtn.classList.toggle('has-note', hasNote);
}

// ── Notes views ────────────────────────────────────────────────────────────
export function openBibleNotes() {
  _setTitle('📝 என் குறிப்புகள்');
  const el     = document.getElementById('bible-content');
  const topics = Object.entries(_notes);
  if (!topics.length) {
    el.innerHTML = `<button class="bible-back" onclick="renderBibleBooks()">← Books</button>
      <div class="bible-section-lbl">குறிப்புகள் இல்லை / No notes yet</div>
      <p style="color:var(--text2);font-size:13px;line-height:1.75">
        வசனம் படிக்கும்போது ✏️ icon-ஐ தட்டி,<br>
        topic-ஐ தேர்ந்தெடுத்து வசனத்தை சேர்க்கலாம்.
      </p>`;
    el.scrollTop = 0;
    return;
  }
  el.innerHTML = `<button class="bible-back" onclick="renderBibleBooks()">← Books</button>
    <div class="bible-section-lbl">📝 என் குறிப்புகள் (${topics.length})</div>
    ${topics.map(([id, t]) => {
      const count   = t.verses?.length || 0;
      const preview = t.verses?.[0]?.ref || '';
      return `<div class="topic-item" onclick="openTopicDetail('${id}')">
        <span class="topic-icon">📖</span>
        <div class="topic-meta">
          <div class="topic-title">${escHtml(t.title)}</div>
          <div class="topic-sub">${count} வசனங்கள்${preview ? ' · ' + escHtml(preview) : ''}</div>
        </div>
        <span class="topic-arrow">›</span>
      </div>`;
    }).join('')}`;
  el.scrollTop = 0;
}

export function openTopicDetail(topicId) {
  const t = _notes[topicId];
  if (!t) return;
  _setTitle(t.title);
  const el     = document.getElementById('bible-content');
  const verses = t.verses || [];
  const html   = verses.length
    ? verses.map((v, i) => `<div class="tnote-verse">
        <span class="tnote-ref" onclick="gotoNoteVerse('${v.key}')" style="cursor:pointer">${escHtml(v.ref)}</span>
        <span class="tnote-text">${escHtml(v.text)}</span>
        <button class="tnote-remove" onclick="removeVerseFromTopic('${topicId}',${i})" title="Remove">✕</button>
      </div>`).join('')
    : `<p style="color:var(--text2);font-size:13px">வசனங்கள் இல்லை.</p>`;

  el.innerHTML = `<button class="bible-back" onclick="openBibleNotes()">← குறிப்புகள்</button>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px">
      <div class="bible-reader-title" style="margin:0;flex:1">${escHtml(t.title)}</div>
      <button onclick="shareTopicNote('${topicId}')" class="tnote-share-btn">↗ Share</button>
      <button onclick="deleteTopicNote('${topicId}')" style="background:none;border:none;color:#f87171;font-size:13px;cursor:pointer;flex-shrink:0">🗑</button>
    </div>
    ${html}`;
  el.scrollTop = 0;
}

export function gotoNoteVerse(verseKey) {
  const [bi, ch, v] = verseKey.split('-').map(Number);
  renderBibleReader(bi, ch, v);
}

export function removeVerseFromTopic(topicId, idx) {
  const t = _notes[topicId];
  if (!t) return;
  const removed = t.verses.splice(idx, 1)[0];
  _saveNotes();
  if (removed) _syncVerseNoteBtn(removed.key);
  openTopicDetail(topicId);
}

export function deleteTopicNote(topicId) {
  const t = _notes[topicId];
  if (!t) return;
  if (!confirm(`"${t.title}" குறிப்பை அழிக்கவா?`)) return;
  (t.verses || []).forEach(v => _syncVerseNoteBtn(v.key));
  delete _notes[topicId];
  _saveNotes();
  _refreshNotesBtnVisibility();
  openBibleNotes();
}

export function shareTopicNote(topicId) {
  const t = _notes[topicId];
  if (!t) return;
  const divider = '─────────────────────';
  let text = `📖 *${t.title}*\n${divider}\n\n`;
  (t.verses || []).forEach((v, i) => {
    text += `${i + 1}. *${v.ref}*\n   ${v.text}\n\n`;
  });
  text += `${divider}\n🎵 JHGPH Songbook`;

  if (navigator.share) {
    navigator.share({ title: t.title, text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => {
      const btn = document.querySelector('.tnote-share-btn');
      if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = orig, 2000); }
    }).catch(() => { prompt('Copy this text:', text); });
  }
}

// ── Word search ────────────────────────────────────────────────────────────
export function openBibleSearch() {
  document.getElementById('bible-search-panel')?.classList.add('open');
  setTimeout(() => document.getElementById('bsearch-input')?.focus(), 320);
}

export function closeBibleSearch() {
  _bsearchAbort = true;
  document.getElementById('bible-search-panel')?.classList.remove('open');
  const inp = document.getElementById('bsearch-input');
  if (inp) inp.value = '';
}

export function onBibleSearchInput(val) {
  clearTimeout(_bsearchTimer);
  _bsearchAbort = true;
  if (!val.trim()) {
    const r = document.getElementById('bsearch-results');
    if (r) r.innerHTML = '<div class="bsearch-empty">வார்த்தை உள்ளிடவும்<br><small>Type a word to search all 31,102 verses</small></div>';
    const pb = document.getElementById('bsearch-progress-bar');
    if (pb) pb.style.width = '0%';
    return;
  }
  _bsearchTimer = setTimeout(() => _runBibleSearch(val.trim()), 350);
}

async function _runBibleSearch(query) {
  _bsearchAbort = false;
  const resultsEl  = document.getElementById('bsearch-results');
  const progressBar = document.getElementById('bsearch-progress-bar');
  const q   = query.toLowerCase();
  let count = 0;

  resultsEl.innerHTML = `<div class="bsearch-status"><div class="bsearch-spinner"></div><span id="bsearch-status-txt">தேடுகிறது... 0 / 66</span></div>`;
  progressBar.style.width = '0%';

  for (let b = 0; b < 66; b++) {
    if (_bsearchAbort) return;

    let bookData = _tamBookCache[b];
    if (!bookData) {
      const lsKey    = `njp-tb-${b}`;
      const lsCached = localStorage.getItem(lsKey);
      if (lsCached) {
        bookData = JSON.parse(lsCached);
      } else {
        try {
          const r = await fetch(`./bible-tam/${b + 1}.json`);
          bookData = await r.json();
          try { localStorage.setItem(lsKey, JSON.stringify(bookData)); } catch {}
        } catch { continue; }
      }
      _tamBookCache[b] = bookData;
    }

    if (_bsearchAbort) return;

    for (const [chStr, verses] of Object.entries(bookData)) {
      for (const v of verses) {
        if (v.text.toLowerCase().includes(q)) {
          const book   = BIBLE_BOOKS[b];
          const ref    = `${book.t} ${chStr}:${v.verse}`;
          const engRef = `${book.e} ${chStr}:${v.verse}`;
          const hl     = v.text.replace(
            new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
            m => `<mark>${m}</mark>`
          );
          const div = document.createElement('div');
          div.className = 'bsearch-result';
          div.innerHTML = `<div class="bsearch-ref">${ref} <span style="color:var(--text2);font-weight:400">· ${engRef}</span></div><div class="bsearch-text">${hl}</div>`;
          const bi2 = b, ch2 = parseInt(chStr), vn = v.verse;
          div.onclick = () => { closeBibleSearch(); window.switchMode?.('bible'); renderBibleReader(bi2, ch2, vn); };
          resultsEl.appendChild(div);
          count++;
        }
      }
    }

    const pct = Math.round((b + 1) / 66 * 100);
    progressBar.style.width = pct + '%';
    const st = document.getElementById('bsearch-status-txt');
    if (st) st.textContent = `தேடுகிறது... ${b + 1} / 66 (${count} முடிவு)`;
    if (b % 3 === 2) await new Promise(r => setTimeout(r, 0));
  }

  if (_bsearchAbort) return;

  const statusRow = resultsEl.querySelector('.bsearch-status');
  if (statusRow) statusRow.remove();

  if (count === 0) {
    resultsEl.innerHTML = `<div class="bsearch-empty">"${query}" — எந்த வசனத்திலும் கிடைக்கவில்லை</div>`;
  } else {
    const summary = document.createElement('div');
    summary.className   = 'bsearch-status';
    summary.style.cssText = 'color:var(--accent);font-weight:600;border-top:1px solid var(--border)';
    summary.textContent   = `${count} வசனங்கள் கிடைத்தன`;
    resultsEl.insertBefore(summary, resultsEl.firstChild);
  }
  progressBar.style.width = '100%';
}
