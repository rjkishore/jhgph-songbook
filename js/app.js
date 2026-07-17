// app.js — bootstrapper: imports all modules, wires navigation, exposes window globals.

import { Storage }                                        from './storage.js';
import { applyTheme, toggleTheme, initInstallPrompt,
         initServiceWorker, applyUpdate }                 from './ui.js';
import { Nav }                                            from './navigation.js';
import {
  init           as songsInit,
  applyFilters, setActiveTab, toggleFilter,
  openSong, closeDetailView, renderDetail,
  renderLyrics, changeTranspose, toggleChordsVis, changeFont,
  toggleFav, toggleSetlist,
  openSetlistSheet, closeSetlistSheet, clearSetlist,
  renderSetlist, moveSet, removeSet, setlistNav,
  shareSong,
  findChordsOnline, saveFoundChords, discardFoundChords,
  initVoiceSearch,
  getActiveSong,
} from './songs.js';
import {
  init           as bibleInit,
  initBible,
  setBibleLang, changeBibleFont,
  renderBibleBooks, renderBibleChapters, renderBibleReader,
  toggleBibleFav, openBibleFavs,
  openVersePicker, closeVersePicker, jumpToVerse,
  openNoteModal, closeAddTopicSheet, addVerseToTopic, createTopicAndAdd,
  openBibleNotes, openTopicDetail, gotoNoteVerse,
  removeVerseFromTopic, deleteTopicNote, shareTopicNote,
  openBibleSearch, closeBibleSearch, onBibleSearchInput,
} from './bible.js';
import { initTracker } from './tracker.js';
import { initPiano }   from './piano.js';

// ── Expose all functions needed by inline HTML onclick="" ──────────────────
Object.assign(window, {
  // songs
  applyFilters, setActiveTab, toggleFilter,
  openSong, renderLyrics, changeTranspose, toggleChordsVis, changeFont,
  toggleFav, toggleSetlist,
  openSetlistSheet, closeSetlistSheet, clearSetlist,
  renderSetlist, moveSet, removeSet, setlistNav,
  shareSong,
  findChordsOnline, saveFoundChords, discardFoundChords,
  // navigation helpers
  goBack:         () => { Nav.back(); },
  goHome:         showHomeScreen,
  showHomeScreen,
  switchMode,
  // bible
  setBibleLang, changeBibleFont,
  renderBibleBooks, renderBibleChapters, renderBibleReader,
  toggleBibleFav, openBibleFavs,
  openVersePicker, closeVersePicker, jumpToVerse,
  openNoteModal, closeAddTopicSheet, addVerseToTopic, createTopicAndAdd,
  openBibleNotes, openTopicDetail, gotoNoteVerse,
  removeVerseFromTopic, deleteTopicNote, shareTopicNote,
  openBibleSearch, closeBibleSearch, onBibleSearchInput,
  // theme / ui
  toggleTheme,
  applyUpdate,
  // tracker
  trackerSeek: (t) => window.trackerSeek?.(t), // wired by tracker.js itself
  // piano — wired by piano.js as window globals
});

// ── Mode helpers ───────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'இரவு வணக்கம்!';
  if (h < 12) return 'காலை வணக்கம்!';
  if (h < 17) return 'மதிய வணக்கம்!';
  if (h < 21) return 'மாலை வணக்கம்!';
  return 'இரவு வணக்கம்!';
}

function showHomeScreen() {
  document.getElementById('home-screen')?.classList.remove('hidden');
  document.getElementById('bible-view')?.classList.remove('show');
  closeDetailView();
  const greet = document.getElementById('home-greeting');
  if (greet) greet.textContent = getGreeting();
  Nav.go('home');
}

function switchMode(mode) {
  Storage.settings.saveMode(mode);
  document.getElementById('home-screen')?.classList.add('hidden');
  if (mode === 'bible') {
    document.getElementById('bible-view')?.classList.add('show');
    initBible();
  } else {
    document.getElementById('bible-view')?.classList.remove('show');
  }
  Nav.go(mode);
}

// ── Navigation wiring ──────────────────────────────────────────────────────
Nav.on('home', ({ fromPopstate } = {}) => {
  if (!fromPopstate) return; // showHomeScreen already ran
  document.getElementById('home-screen')?.classList.remove('hidden');
  document.getElementById('bible-view')?.classList.remove('show');
  closeDetailView();
  const greet = document.getElementById('home-greeting');
  if (greet) greet.textContent = getGreeting();
});

Nav.on('songs', ({ closing } = {}) => {
  if (closing) closeDetailView();
});

Nav.on('bible', ({ fromPopstate } = {}) => {
  if (fromPopstate) {
    document.getElementById('home-screen')?.classList.add('hidden');
    document.getElementById('bible-view')?.classList.add('show');
    initBible();
  }
});

// ── Boot sequence ──────────────────────────────────────────────────────────
(function boot() {
  // Theme (synchronous — prevents FOUC; tiny inline script in HTML sets data-theme first)
  const theme = Storage.settings.getTheme();
  applyTheme(theme);

  // Bible init (lang buttons, notes btn visibility)
  bibleInit();

  // Song data + list
  songsInit(() => {
    // After songs ready: push initial history state
    history.replaceState({ screen: 'home' }, '', location.pathname);
    const greet = document.getElementById('home-greeting');
    if (greet) greet.textContent = getGreeting();
  });

  // Voice search
  initVoiceSearch();

  // Tracker
  initTracker();

  // Piano lazy — exposed so songs.js setActiveTab can call it
  window._initPiano = initPiano;

  // Service worker + install prompt
  initServiceWorker();
  initInstallPrompt();

  // Bible theme toggle button
  document.getElementById('bible-theme-btn')?.addEventListener('click', toggleTheme);

  // Search input live filter
  document.getElementById('searchbox')?.addEventListener('input', e => applyFilters());
  document.getElementById('search-clear')?.addEventListener('click', () => {
    const sb = document.getElementById('searchbox');
    if (sb) { sb.value = ''; applyFilters(); sb.focus(); }
  });
})();
