// storage.js — single source of truth for all localStorage I/O
// Every read/write goes through here. No other module touches localStorage directly.

const _get = (k, fallback = null) => {
  try { const v = localStorage.getItem(k); return v === null ? fallback : v; }
  catch { return fallback; }
};
const _set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const _getJson = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const _setJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const Storage = {
  settings: {
    getTheme:    ()  => _get('njp-theme', 'dark'),
    saveTheme:   (t) => _set('njp-theme', t),
    getMode:     ()  => _get('njp-mode', 'songs'),
    saveMode:    (m) => _set('njp-mode', m),
    getActiveTab:()  => _get('njp-active-tab', 'songs'),
    saveActiveTab:(t)=> _set('njp-active-tab', t),
  },

  songs: {
    getFavs:      ()  => new Set(_getJson('njp-favs', [])),
    saveFavs:     (s) => _setJson('njp-favs', [...s]),
    getSetlist:   ()  => _getJson('njp-setlist', []),
    saveSetlist:  (a) => _setJson('njp-setlist', a),
    getFontSize:  ()  => parseInt(_get('njp-fontsize', '17'), 10),
    saveFontSize: (n) => _set('njp-fontsize', String(n)),
    getExtraChords: () => _getJson('njp-extra-chords', {}),
    saveExtraChords:(o)=> _setJson('njp-extra-chords', o),
  },

  bible: {
    getFavs:     ()  => new Set(_getJson('njp-bible-favs', [])),
    saveFavs:    (s) => _setJson('njp-bible-favs', [...s]),
    getNotes:    ()  => _getJson('njp-bible-notes', {}),
    saveNotes:   (n) => _setJson('njp-bible-notes', n),
    getLang:     ()  => _get('njp-bible-lang', 'tamil'),
    saveLang:    (l) => _set('njp-bible-lang', l),
    getFontSize: ()  => parseInt(_get('njp-bfs', '17'), 10),
    saveFontSize:(n) => _set('njp-bfs', String(n)),
    getChapter:  (key)      => _get(key, null),
    saveChapter: (key, val) => _set(key, val),
    getBook:     (idx)      => _get('njp-tb-' + idx, null),
    saveBook:    (idx, val) => _set('njp-tb-' + idx, val),
  },
};
