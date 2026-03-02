/**
 * ExamPro – Global utilities
 * Team Believer © 2026
 */

// ── API helpers ────────────────────────────────────────────

async function apiGet(url) {
  try {
    const r    = await fetch(url, { credentials:'same-origin' });
    const data = await r.json().catch(() => ({}));
    return { ok:r.ok, status:r.status, data };
  } catch(e) {
    console.error('[apiGet]', url, e);
    return { ok:false, status:0, data:{ error:'Network error' } };
  }
}

async function apiPost(url, body = {}) {
  try {
    const r = await fetch(url, {
      method:      'POST',
      headers:     { 'Content-Type':'application/json' },
      credentials: 'same-origin',
      body:        JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    return { ok:r.ok, status:r.status, data };
  } catch(e) {
    console.error('[apiPost]', url, e);
    return { ok:false, status:0, data:{ error:'Network error' } };
  }
}

async function apiPut(url, body = {}) {
  try {
    const r = await fetch(url, {
      method:      'PUT',
      headers:     { 'Content-Type':'application/json' },
      credentials: 'same-origin',
      body:        JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    return { ok:r.ok, status:r.status, data };
  } catch(e) {
    console.error('[apiPut]', url, e);
    return { ok:false, status:0, data:{ error:'Network error' } };
  }
}

// ── Auth ───────────────────────────────────────────────────

// ★ FIX: logout → /login?msg=logout ★
async function logout() {
  try {
    await apiPost('/api/auth/logout', {});
  } catch(_) { /* ignore */ }
  window.location.href = '/login?msg=logout';
}

async function getMe() {
  const { ok, status, data } = await apiGet('/api/auth/me');
  if (!ok) {
    if (status === 401) {
      window.location.href = '/login?msg=session_expired';
    } else {
      window.location.href = '/login?msg=unauthorized';
    }
    return null;
  }
  return data;
}

// ── Formatting ─────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); }
  catch { return iso; }
}

function fmtDuration(mins) {
  if (!mins) return '—';
  return mins < 60
    ? `${mins}m`
    : `${Math.floor(mins/60)}h ${mins%60}m`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// ── Utilities ──────────────────────────────────────────────

function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function throttle(fn, ms = 1000) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...args); }
  };
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text)
    .then(()  => toast('Copied to clipboard!', 'success', 2000))
    .catch(()  => toast('Copy failed', 'error'));
}

// ── showToast alias — toast.js ke saath compatible ─────────
// ★ FIX: showToast(type, msg) → toast(msg, type) ★
function showToast(type, msg, duration) {
  if (typeof window.toast === 'function') {
    window.toast(msg, type, duration === 0 ? 99999 : duration);
  }
}

// ── Network status ──────────────────────────────────────────
let _wasOffline = false;

window.addEventListener('online', () => {
  if (_wasOffline) {
    toast('Back online! Connection restored.', 'success', 3000);
    _wasOffline = false;
  }
});

window.addEventListener('offline', () => {
  toast(
    'You are offline. Answers may not save.',
    'error',
    99999   // stay until back online
  );
  _wasOffline = true;
});

// ── URL param toast — login page pe dikhao ──────────────────
// ★ Login/Register page load hone par check karo ★
(function checkUrlMsg() {
  // Sirf login page pe kaam kare
  if (!window.location.pathname.includes('/login') &&
      !window.location.pathname.includes('/register')) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const msg    = params.get('msg');
  if (!msg) return;

  // URL clean karo — back button pe ?msg na aaye
  window.history.replaceState(
    {}, document.title,
    window.location.pathname
  );

  // Toast dikhao — page load ke baad
  const MSGS = {
    logout: {
      text: 'Logged out successfully.',
      type: 'success'
    },
    session_expired: {
      text: 'Session expired. Please login again.',
      type: 'warning'
    },
    unauthorized: {
      text: 'Please login to continue.',
      type: 'info'
    },
    registered: {
      text: 'Account created! Please login.',
      type: 'success'
    }
  };

  const cfg = MSGS[msg];
  if (!cfg) return;

  // ★ Wait for toast.js to load ★
  function tryToast(attempts) {
    if (typeof window.toast === 'function') {
      window.toast(cfg.text, cfg.type, 5000);
    } else if (attempts > 0) {
      setTimeout(() => tryToast(attempts - 1), 100);
    }
  }

  // DOM ready hone ke baad dikhao
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',
      () => setTimeout(() => tryToast(10), 300)
    );
  } else {
    setTimeout(() => tryToast(10), 300);
  }
})();