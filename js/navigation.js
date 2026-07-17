// navigation.js — single state machine for all screen transitions.
// All history.pushState / replaceState lives here. No other module touches history.

import { Storage } from './storage.js';

// Registered screen handlers: { screen: (params) => void }
const _handlers = {};

// Current logical screen
let _current = 'home';

export const Nav = {
  /** Register a handler for a screen. Call from app.js during wiring. */
  on(screen, fn) {
    _handlers[screen] = fn;
  },

  /** Navigate to a screen. Drives the history stack and calls the handler. */
  go(screen, params = {}) {
    _current = screen;
    if (screen === 'home') {
      history.replaceState({ screen: 'home' }, '', location.pathname);
    } else if (screen === 'detail') {
      history.pushState({ screen: 'detail', ...params }, '', location.pathname);
    } else {
      // songs, bible — remember last content screen
      if (screen !== 'detail') Storage.settings.saveMode(screen);
      history.pushState({ screen }, '', location.pathname);
    }
    _handlers[screen]?.(params);
  },

  /**
   * Close the current detail/overlay and return to the previous content screen.
   * Does NOT call history.back() — that prevents the popstate cascade bug
   * where going back could accidentally show the home screen.
   */
  back() {
    const mode = Storage.settings.getMode() || 'songs';
    _current = mode;
    history.replaceState({ screen: mode }, '', location.pathname);
    _handlers[mode]?.({ closing: true });
  },

  current() { return _current; },
};

// Hardware / browser back button
window.addEventListener('popstate', e => {
  const s = e.state?.screen;
  if (s === 'home') {
    _current = 'home';
    _handlers['home']?.({ fromPopstate: true });
  } else if (s === 'songs' || s === 'chords' || (!s && !e.state?.songId)) {
    _current = 'songs';
    _handlers['songs']?.({ fromPopstate: true, closing: true });
  } else if (s === 'bible') {
    _current = 'bible';
    _handlers['bible']?.({ fromPopstate: true });
  }
  // s === 'detail' or songId — do nothing; detail close is handled by back()
});
