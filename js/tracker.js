// tracker.js — Audio chord tracker: file load, chromagram analysis, playback.

export function initTracker() {
  const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const CHORD_TEMPLATES = [
    {name:'',    intervals:[0,4,7]},
    {name:'m',   intervals:[0,3,7]},
    {name:'7',   intervals:[0,4,7,10]},
    {name:'m7',  intervals:[0,3,7,10]},
    {name:'maj7',intervals:[0,4,7,11]},
    {name:'sus2',intervals:[0,2,7]},
    {name:'sus4',intervals:[0,5,7]},
    {name:'dim', intervals:[0,3,6]},
    {name:'aug', intervals:[0,4,8]},
  ];

  let audioBuffer = null, audioCtx = null, sourceNode = null;
  let chordMap = [], isPlaying = false, startTime = 0, pauseOffset = 0;
  let animFrame = null, currentFile = null;

  const fileInput  = document.getElementById('tracker-file-input');
  const drop       = document.getElementById('tracker-drop');
  const fileInfo   = document.getElementById('tracker-file-info');
  const fileName   = document.getElementById('tracker-file-name');
  const clearBtn   = document.getElementById('tracker-clear-btn');
  const analyzeBtn = document.getElementById('tracker-analyze-btn');
  const progWrap   = document.getElementById('tracker-progress-wrap');
  const progFill   = document.getElementById('tracker-progress-fill');
  const progLabel  = document.getElementById('tracker-progress-label');
  const player     = document.getElementById('tracker-player');
  const playBtn    = document.getElementById('tracker-play-btn');
  const rewBtn     = document.getElementById('tracker-rew-btn');
  const fwdBtn     = document.getElementById('tracker-fwd-btn');
  const timeBar    = document.getElementById('tracker-timeline-bar');
  const timeFill   = document.getElementById('tracker-timeline-fill');
  const timeCur    = document.getElementById('tracker-time-cur');
  const timeTot    = document.getElementById('tracker-time-tot');
  const curChordEl = document.getElementById('tracker-current-chord');
  const chordName  = document.getElementById('tracker-chord-name');
  const chordNext  = document.getElementById('tracker-chord-next');
  const listWrap   = document.getElementById('tracker-list');
  const chordList  = document.getElementById('tracker-chord-list');

  function fmt(s) { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  function chromaFromBuffer(buf, startSample, endSample) {
    const ch = new Float32Array(12);
    const hop = 128;
    for (let i = startSample; i < endSample - 512; i += hop) {
      for (let k = 0; k < 12; k++) {
        const f0 = 130.81 * Math.pow(2, k / 12);
        const sr = buf.sampleRate;
        let val = 0;
        for (let h = 1; h <= 6; h++) {
          const period = sr / (f0 * h);
          if (i + Math.round(period) < endSample)
            val += Math.abs(buf.getChannelData(0)[i] * buf.getChannelData(0)[Math.min(endSample - 1, i + Math.round(period))]);
        }
        ch[k] += val;
      }
    }
    const mx = Math.max(...ch, 1e-9);
    return ch.map(v => v / mx);
  }

  function detectChord(chroma) {
    let best = null, bestScore = -1;
    for (let root = 0; root < 12; root++) {
      for (const tmpl of CHORD_TEMPLATES) {
        let score = 0;
        for (const iv of tmpl.intervals) score += chroma[(root + iv) % 12];
        let penalty = 0;
        for (let n = 0; n < 12; n++)
          if (!tmpl.intervals.includes((n - root + 12) % 12)) penalty += chroma[n] * 0.4;
        score -= penalty;
        if (score > bestScore) { bestScore = score; best = NOTES[root] + tmpl.name; }
      }
    }
    return best || '—';
  }

  async function analyzeFile(file) {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuf = await file.arrayBuffer();
    progLabel.textContent = 'Decoding audio...';
    progFill.style.width  = '10%';
    progWrap.style.display = 'block';
    analyzeBtn.disabled   = true;

    audioBuffer = await new Promise((res, rej) => audioCtx.decodeAudioData(arrayBuf, res, rej));
    const WINDOW = 0.5, HOP = 0.25;
    const steps  = Math.floor((audioBuffer.duration - WINDOW) / HOP);
    chordMap     = [];

    for (let i = 0; i < steps; i++) {
      const t = i * HOP;
      const ch = chromaFromBuffer(audioBuffer, Math.floor(t * audioBuffer.sampleRate), Math.floor((t + WINDOW) * audioBuffer.sampleRate));
      chordMap.push({ t, chord: detectChord(ch) });
      if (i % 10 === 0) {
        progFill.style.width  = (10 + 80 * (i / steps)) + '%';
        progLabel.textContent = `Analyzing... ${Math.round(100 * i / steps)}%`;
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // Merge consecutive same chords
    const compressed = [];
    chordMap.forEach(({ t, chord }) => {
      if (!compressed.length || compressed[compressed.length - 1].chord !== chord)
        compressed.push({ t, chord, duration: HOP });
      else
        compressed[compressed.length - 1].duration += HOP;
    });
    chordMap = compressed;

    progFill.style.width  = '100%';
    progLabel.textContent = 'Done!';
    setTimeout(() => { progWrap.style.display = 'none'; }, 800);

    timeTot.textContent       = fmt(audioBuffer.duration);
    player.style.display      = 'block';
    curChordEl.style.display  = 'block';
    listWrap.style.display    = 'block';
    _renderChordList();
    analyzeBtn.disabled   = false;
    analyzeBtn.textContent = 'Re-analyze';
  }

  function _renderChordList() {
    const maxDur = Math.max(...chordMap.map(c => c.duration), 1);
    chordList.innerHTML = chordMap.map((c, i) => `
      <div class="tracker-chord-row" id="tcr-${i}" onclick="trackerSeek(${c.t})">
        <span class="tracker-chord-time">${fmt(c.t)}</span>
        <span class="tracker-chord-val">${c.chord}</span>
        <div class="tracker-chord-bar"><div class="tracker-chord-bar-fill" style="width:${Math.round(100 * c.duration / maxDur)}%"></div></div>
      </div>`).join('');
  }

  function _currentIdx(t) {
    let idx = 0;
    for (let i = 0; i < chordMap.length; i++) if (chordMap[i].t <= t) idx = i;
    return idx;
  }

  function tick() {
    if (!isPlaying || !audioBuffer) return;
    const elapsed = audioCtx.currentTime - startTime + pauseOffset;
    if (elapsed >= audioBuffer.duration) { stopAudio(); return; }
    timeFill.style.width = (elapsed / audioBuffer.duration * 100) + '%';
    timeCur.textContent  = fmt(elapsed);
    const idx = _currentIdx(elapsed);
    const c   = chordMap[idx];
    if (c) {
      chordName.textContent = c.chord;
      const next = chordMap[idx + 1];
      chordNext.textContent = next ? `Next: ${next.chord} @ ${fmt(next.t)}` : '';
      document.querySelectorAll('.tracker-chord-row').forEach((el, i) => {
        el.classList.toggle('active-chord', i === idx);
        if (i === idx) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
    animFrame = requestAnimationFrame(tick);
  }

  function playAudio() {
    if (!audioBuffer) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioCtx.destination);
    startTime = audioCtx.currentTime;
    sourceNode.start(0, pauseOffset);
    isPlaying = true;
    playBtn.textContent = '⏸';
    animFrame = requestAnimationFrame(tick);
    sourceNode.onended = () => { if (isPlaying) stopAudio(); };
  }

  function pauseAudio() {
    if (!isPlaying) return;
    pauseOffset += audioCtx.currentTime - startTime;
    sourceNode.stop();
    isPlaying = false;
    playBtn.textContent = '▶';
    cancelAnimationFrame(animFrame);
  }

  function stopAudio() {
    if (sourceNode) { try { sourceNode.stop(); } catch {} }
    isPlaying = false; pauseOffset = 0;
    playBtn.textContent   = '▶';
    cancelAnimationFrame(animFrame);
    timeFill.style.width  = '0%';
    timeCur.textContent   = '0:00';
  }

  function getCurrentPlayTime() {
    return isPlaying && audioCtx ? pauseOffset + (audioCtx.currentTime - startTime) : pauseOffset;
  }

  window.trackerSeek = function (t) {
    pauseOffset = Math.max(0, Math.min(t, audioBuffer.duration - 0.1));
    if (isPlaying) { sourceNode.stop(); isPlaying = false; playAudio(); }
    else {
      timeFill.style.width = (pauseOffset / audioBuffer.duration * 100) + '%';
      timeCur.textContent  = fmt(pauseOffset);
      const idx = _currentIdx(pauseOffset);
      if (chordMap[idx]) chordName.textContent = chordMap[idx].chord;
    }
  };

  function loadFile(file) {
    if (!file) return;
    currentFile = file;
    drop.style.display   = 'none';
    fileName.textContent = file.name;
    fileInfo.style.display = 'flex';
    analyzeBtn.disabled  = false;
    stopAudio(); chordMap = [];
    player.style.display     = 'none';
    curChordEl.style.display = 'none';
    listWrap.style.display   = 'none';
    chordName.textContent    = '—';
  }

  fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
  drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); loadFile(e.dataTransfer.files[0]); });
  clearBtn.addEventListener('click', () => {
    stopAudio(); currentFile = null; chordMap = []; audioBuffer = null;
    drop.style.display = ''; fileInfo.style.display = 'none';
    analyzeBtn.disabled = true; analyzeBtn.textContent = 'Analyze Chords';
    player.style.display = 'none'; curChordEl.style.display = 'none'; listWrap.style.display = 'none';
    fileInput.value = '';
  });
  analyzeBtn.addEventListener('click', () => { if (currentFile) analyzeFile(currentFile); });
  playBtn.addEventListener('click', () => { isPlaying ? pauseAudio() : playAudio(); });
  rewBtn.addEventListener('click', () => trackerSeek(Math.max(0, getCurrentPlayTime() - 10)));
  fwdBtn.addEventListener('click', () => trackerSeek(Math.min(audioBuffer ? audioBuffer.duration - 0.1 : 0, getCurrentPlayTime() + 10)));
  timeBar.addEventListener('click', e => {
    if (!audioBuffer) return;
    trackerSeek((e.offsetX / timeBar.offsetWidth) * audioBuffer.duration);
  });
}
