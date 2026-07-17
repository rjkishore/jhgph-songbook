// piano.js — Piano tutorial: key layout, chord library, audio synthesis.

const KEYS = [
  ['C',4,false,0],   ['C#',4,true,30],  ['D',4,false,44],  ['D#',4,true,74],
  ['E',4,false,88],  ['F',4,false,132], ['F#',4,true,162], ['G',4,false,176],
  ['G#',4,true,206], ['A',4,false,220], ['A#',4,true,250], ['B',4,false,264],
  ['C',5,false,308], ['C#',5,true,338], ['D',5,false,352], ['D#',5,true,382],
  ['E',5,false,396], ['F',5,false,440], ['F#',5,true,470], ['G',5,false,484],
  ['G#',5,true,514], ['A',5,false,528], ['A#',5,true,558], ['B',5,false,572],
];

const NOTE_SEMI = {
  C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11,
  Db:1,Eb:3,Gb:6,Ab:8,Bb:10
};

const SOLFEGE = {
  C:'Do',D:'Re',E:'Mi',F:'Fa',G:'Sol',A:'La',B:'Ti',
  'C#':'Do♯','D#':'Re♯','F#':'Fa♯','G#':'Sol♯','A#':'La♯'
};

const CHORD_SECTIONS = [
  {title:'Major Chords', chords:[
    {k:'C',  n:['C4','E4','G4'],       l:'C Major'},
    {k:'Db', n:['C#4','F4','G#4'],     l:'D♭ Major'},
    {k:'D',  n:['D4','F#4','A4'],      l:'D Major'},
    {k:'Eb', n:['D#4','G4','A#4'],     l:'E♭ Major'},
    {k:'E',  n:['E4','G#4','B4'],      l:'E Major'},
    {k:'F',  n:['F4','A4','C5'],       l:'F Major'},
    {k:'F#', n:['F#4','A#4','C#5'],    l:'F# Major'},
    {k:'G',  n:['G4','B4','D5'],       l:'G Major'},
    {k:'Ab', n:['G#4','C5','D#5'],     l:'A♭ Major'},
    {k:'A',  n:['A4','C#5','E5'],      l:'A Major'},
    {k:'Bb', n:['A#4','D5','F5'],      l:'B♭ Major'},
    {k:'B',  n:['B4','D#5','F#5'],     l:'B Major'},
  ]},
  {title:'Minor Chords', chords:[
    {k:'Cm',  n:['C4','D#4','G4'],     l:'C Minor'},
    {k:'C#m', n:['C#4','E4','G#4'],    l:'C# Minor'},
    {k:'Dm',  n:['D4','F4','A4'],      l:'D Minor'},
    {k:'D#m', n:['D#4','F#4','A#4'],   l:'D# Minor'},
    {k:'Em',  n:['E4','G4','B4'],      l:'E Minor'},
    {k:'Fm',  n:['F4','G#4','C5'],     l:'F Minor'},
    {k:'F#m', n:['F#4','A4','C#5'],    l:'F# Minor'},
    {k:'Gm',  n:['G4','A#4','D5'],     l:'G Minor'},
    {k:'G#m', n:['G#4','B4','D#5'],    l:'G# Minor'},
    {k:'Am',  n:['A4','C5','E5'],      l:'A Minor'},
    {k:'A#m', n:['A#4','C#5','F5'],    l:'A# Minor'},
    {k:'Bm',  n:['B4','D5','F#5'],     l:'B Minor'},
  ]},
  {title:'Dominant 7th Chords', chords:[
    {k:'C7', n:['C4','E4','G4','A#4'], l:'C7'},
    {k:'D7', n:['D4','F#4','A4','C5'], l:'D7'},
    {k:'E7', n:['E4','G#4','B4','D5'], l:'E7'},
    {k:'F7', n:['F4','A4','C5','D#5'], l:'F7'},
    {k:'G7', n:['G4','B4','D5','F5'],  l:'G7'},
    {k:'A7', n:['A4','C#5','E5','G5'], l:'A7'},
    {k:'B7', n:['B4','D#5','F#5','A5'],l:'B7'},
  ]},
  {title:'Minor 7th Chords', chords:[
    {k:'Am7',n:['A4','C5','E5','G5'],  l:'Am7'},
    {k:'Dm7',n:['D4','F4','A4','C5'],  l:'Dm7'},
    {k:'Em7',n:['E4','G4','B4','D5'],  l:'Em7'},
    {k:'Bm7',n:['B4','D5','F#5','A5'], l:'Bm7'},
  ]},
];

const CHORDS = {};
CHORD_SECTIONS.forEach(s => s.chords.forEach(c => { CHORDS[c.k] = c; }));

function _toMidi(note, oct) { return 12 * (oct + 1) + (NOTE_SEMI[note] || 0); }
function _midiFreq(m)       { return 440 * Math.pow(2, (m - 69) / 12); }
function _parseNO(s)        { const m = s.match(/^([A-G][#]?)(\d)$/); return m ? { note: m[1], oct: +m[2] } : null; }

let _pCtx = null;
function _getCtx() {
  if (!_pCtx) _pCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_pCtx.state === 'suspended') _pCtx.resume();
  return _pCtx;
}

function _playMidi(midi, vol = 0.45, dur = 1.2) {
  const ctx = _getCtx(), freq = _midiFreq(midi), now = ctx.currentTime;
  const osc = ctx.createOscillator(), osc2 = ctx.createOscillator();
  const g   = ctx.createGain(), g2 = ctx.createGain();
  osc.type  = 'triangle'; osc.frequency.value  = freq;
  osc2.type = 'sine';     osc2.frequency.value = freq * 2;
  g2.gain.value = 0.2;
  osc2.connect(g2); g2.connect(g); osc.connect(g); g.connect(ctx.destination);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(vol, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.start(now); osc.stop(now + dur);
  osc2.start(now); osc2.stop(now + dur);
}

function _litKeys(noteOcts) {
  document.querySelectorAll('#piano-keys .lit').forEach(k => k.classList.remove('lit'));
  (noteOcts || []).forEach(no => {
    const p  = _parseNO(no); if (!p) return;
    const el = document.querySelector(`#piano-keys [data-note="${p.note}"][data-oct="${p.oct}"]`);
    if (el) el.classList.add('lit');
  });
}

function _setNoteLabel(text) {
  const lbl = document.getElementById('piano-note-label');
  if (!lbl) return;
  lbl.textContent = text;
  clearTimeout(lbl._t);
  lbl._t = setTimeout(() => { lbl.textContent = '↑ Tap a key to hear it play'; }, 2500);
}

function _buildPiano() {
  const wrap = document.getElementById('piano-keys');
  if (!wrap) return;
  wrap.innerHTML = '';
  KEYS.forEach(([note, oct, isBlack, left]) => {
    const el = document.createElement('div');
    el.className    = isBlack ? 'piano-bkey' : 'piano-wkey';
    el.style.left   = left + 'px';
    el.dataset.note = note; el.dataset.oct = oct;
    el.textContent  = note === 'C' ? 'C' + oct : (isBlack ? note.replace('#', '♯') : note);
    el.addEventListener('click', () => {
      _playMidi(_toMidi(note, oct));
      _setNoteLabel(note + oct + ' — ' + (SOLFEGE[note] || ''));
      el.classList.add('pressed');
      setTimeout(() => el.classList.remove('pressed'), 180);
    });
    wrap.appendChild(el);
  });
}

function _buildChordGrid() {
  const grid = document.getElementById('piano-chord-grid');
  if (!grid) return;
  grid.innerHTML = CHORD_SECTIONS.map(sec => `
    <div style="grid-column:1/-1;font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.7px;text-transform:uppercase;margin-top:6px;padding-bottom:2px;border-bottom:1px solid var(--border)">${sec.title}</div>
    ${sec.chords.map(c => `
      <div class="pcbtn" data-chord="${c.k}" onclick="selectPianoChord('${c.k}')">
        <div class="pcbtn-name">${c.k}</div>
        <div class="pcbtn-sub">${c.l.replace(' Major','Maj').replace(' Minor','Min').replace('Dominant ','')}</div>
      </div>`).join('')}
  `).join('');
}

// ── Public API (window globals used by HTML onclick handlers) ──────────────
window.selectPianoChord = function (chord) {
  const info = CHORDS[chord]; if (!info) return;
  document.querySelectorAll('.pcbtn').forEach(b => b.classList.toggle('sel', b.dataset.chord === chord));
  _litKeys(info.n);
  _setNoteLabel('🎵 ' + info.l + ': ' + info.n.join(' · '));
  const btn = document.getElementById('piano-play-chord-btn');
  if (btn) { btn.disabled = false; btn.textContent = '▶ Play ' + chord + ' (' + info.l + ')'; }
  const first = _parseNO(info.n[0]);
  if (first) {
    const el = document.querySelector(`#piano-keys [data-note="${first.note}"][data-oct="${first.oct}"]`);
    if (el) el.scrollIntoView({ inline: 'center', behavior: 'smooth' });
  }
};

window.pianoPlayName = function (note, oct) {
  _playMidi(_toMidi(note, oct));
  _setNoteLabel(note + oct + ' — ' + (SOLFEGE[note] || ''));
  _litKeys([note + oct]);
  setTimeout(() => _litKeys([]), 600);
};

window.showPianoLesson = function (id) {
  document.querySelectorAll('.plesso-pane').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.plesso-tab').forEach(t => t.classList.remove('on'));
  document.getElementById('piano-lesson-' + id)?.classList.add('on');
  document.querySelector(`.plesso-tab[data-lesson="${id}"]`)?.classList.add('on');
};

// ── Lazy init (called by songs.js setActiveTab when Piano tab opens) ───────
let _ready = false;
export function initPiano() {
  if (_ready) return; _ready = true;
  _buildPiano();
  _buildChordGrid();
  const playBtn = document.getElementById('piano-play-chord-btn');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const sel = document.querySelector('.pcbtn.sel');
      if (sel) {
        const info = CHORDS[sel.dataset.chord]; if (!info) return;
        info.n.forEach((no, i) => {
          const p = _parseNO(no); if (!p) return;
          setTimeout(() => _playMidi(_toMidi(p.note, p.oct), 0.35, 1.6), i * 40);
        });
      }
    });
  }
}
