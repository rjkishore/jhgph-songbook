// ui.js — shared UI utilities used across modules.
// Theme, wakelock, toast, install prompt, update banner, escHtml.

import { Storage } from './storage.js';

// ── HTML escaping ──────────────────────────────────────────────────────────
export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Theme ──────────────────────────────────────────────────────────────────
const THEME_VARS = {
  dark: {
    '--bg': '#0a0918', '--surface': '#13112b', '--surface2': '#1c1940',
    '--border': '#2a2660', '--text': '#f0eeff', '--text2': '#9b96cc',
    '--accent': '#818cf8', '--chord': '#fb923c', '--key-bg': '#0d2e1f',
    '--key-text': '#34d399', '--fav': '#fbbf24',
  },
  light: {
    '--bg': '#f5f3ff', '--surface': '#ffffff', '--surface2': '#ede9fe',
    '--border': '#c4b5fd', '--text': '#1e1b4b', '--text2': '#6d5ac4',
    '--accent': '#4f46e5', '--chord': '#ea580c', '--key-bg': '#d1fae5',
    '--key-text': '#059669', '--fav': '#d97706',
  },
};

export function applyTheme(t) {
  const root = document.documentElement;
  root.setAttribute('data-theme', t);
  const vars = THEME_VARS[t] || THEME_VARS.dark;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  const themeBtn = document.getElementById('theme-btn');
  if (themeBtn) themeBtn.textContent = t === 'light' ? '☀️' : '🌙';
  const bibleThemeBtn = document.getElementById('bible-theme-btn');
  if (bibleThemeBtn) bibleThemeBtn.textContent = t === 'light' ? '☀️' : '🌙';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'light' ? '#7c3aed' : '#1a1a2e';
  Storage.settings.saveTheme(t);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ── Wake Lock ──────────────────────────────────────────────────────────────
let _wakeLock = null;

export async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try { _wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}

export function releaseWakeLock() {
  if (_wakeLock) { _wakeLock.release(); _wakeLock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseWakeLock();
  else acquireWakeLock();
});

// ── Toast ──────────────────────────────────────────────────────────────────
export function showToast(msg, duration = 2000) {
  let t = document.getElementById('ui-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'ui-toast';
    t.style.cssText = [
      'position:fixed', 'bottom:calc(80px + env(safe-area-inset-bottom,0px))',
      'left:50%', 'transform:translateX(-50%)',
      'background:rgba(30,27,75,.95)', 'color:#fff',
      'font-size:13px', 'padding:9px 20px', 'border-radius:20px',
      'z-index:600', 'white-space:nowrap', 'pointer-events:none',
      'box-shadow:0 4px 16px rgba(0,0,0,.35)',
      'transition:opacity .3s', 'opacity:0',
    ].join(';');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, duration);
}

// ── Install prompt ─────────────────────────────────────────────────────────
let _deferredPrompt = null;

export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredPrompt = e;
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = 'flex';
  });
  const btn = document.getElementById('install-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      if (!_deferredPrompt) return;
      _deferredPrompt.prompt();
      await _deferredPrompt.userChoice;
      _deferredPrompt = null;
      btn.style.display = 'none';
    });
  }
  window.addEventListener('appinstalled', () => {
    const b = document.getElementById('install-btn');
    if (b) b.style.display = 'none';
  });
}

// ── Update banner ──────────────────────────────────────────────────────────
export function showUpdateBanner(newSW) {
  let banner = document.getElementById('update-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style.cssText = [
      'position:fixed', 'bottom:calc(var(--nav-h) + var(--safe-b) + 8px)',
      'left:12px', 'right:12px', 'z-index:400',
      'background:linear-gradient(135deg,#7c3aed,#4f46e5)',
      'color:#fff', 'border-radius:14px', 'padding:12px 16px',
      'display:flex', 'align-items:center', 'gap:12px',
      'box-shadow:0 4px 20px rgba(124,58,237,.5)',
      'font-size:13px',
    ].join(';');
    banner.innerHTML = `
      <span style="flex:1">புதிய பதிப்பு கிடைக்கிறது / New version available</span>
      <button onclick="applyUpdate()" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;font-family:inherit">
        Update
      </button>`;
    document.body.appendChild(banner);
  }
  window._pendingUpdate = newSW;
}

export function applyUpdate() {
  if (window._pendingUpdate) {
    window._pendingUpdate.postMessage({ type: 'SKIP_WAITING' });
  }
  document.getElementById('update-banner')?.remove();
}

// ── Service Worker registration ────────────────────────────────────────────
export function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(newSW);
        }
      });
    });
  });
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) { refreshing = true; location.reload(); }
  });
}
