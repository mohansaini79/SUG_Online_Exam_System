// ═══════════════════════════��═══════════════════════════════
//  ExamPro — Professional Toast System
//  Design: Exact match to screenshot
//  Team Believer © 2026
// ═══════════════════════════════════════════════════════════
(function () {

  // ── Inject CSS ────────────────────────────────────────────
  if (!document.getElementById('ep-toast-style')) {
    const s = document.createElement('style');
    s.id = 'ep-toast-style';
    s.textContent = `
      #ep-toast-root {
        position      : fixed;
        top           : 18px;
        right         : 18px;
        z-index       : 999999;
        display       : flex;
        flex-direction: column;
        gap           : 10px;
        pointer-events: none;
        width         : 320px;
        font-family   : 'Inter', -apple-system, sans-serif;
      }

      /* ── Card ─────────────────────────────────────────── */
      .ep-t {
        pointer-events : all;
        width          : 100%;
        background     : rgba(10, 14, 42, 0.97);
        border-radius  : 12px;
        overflow       : hidden;
        border         : 1px solid rgba(255,255,255,0.09);
        box-shadow     : 0 4px 24px rgba(0,0,0,0.55),
                         0 1px 0 rgba(255,255,255,0.04) inset;
        display        : flex;
        align-items    : stretch;
        position       : relative;
        animation      : epSlideIn 0.28s cubic-bezier(.22,1,.36,1) forwards;
      }
      .ep-t.ep-out {
        animation: epSlideOut 0.22s ease forwards;
      }

      @keyframes epSlideIn {
        from { opacity:0; transform:translateX(110%) scale(0.92); }
        to   { opacity:1; transform:translateX(0)   scale(1);     }
      }
      @keyframes epSlideOut {
        from { opacity:1; transform:translateX(0)   scale(1);     }
        to   { opacity:0; transform:translateX(110%) scale(0.94); }
      }

      /* ── Left accent bar — exactly like screenshot ─────── */
      .ep-t .ep-bar {
        width        : 5px;
        flex-shrink  : 0;
      }
      .ep-t.ep-success .ep-bar { background:#10b981; }
      .ep-t.ep-error   .ep-bar { background:#ef4444; }
      .ep-t.ep-warning .ep-bar { background:#f59e0b; }
      .ep-t.ep-info    .ep-bar { background:#6366f1; }

      /* ── Icon ─────────────────────────────────────────── */
      .ep-t .ep-ico {
        width           : 42px;
        flex-shrink     : 0;
        display         : flex;
        align-items     : center;
        justify-content : center;
        font-size       : 15px;
      }
      .ep-t.ep-success .ep-ico { color:#10b981; }
      .ep-t.ep-error   .ep-ico { color:#ef4444; }
      .ep-t.ep-warning .ep-ico { color:#f59e0b; }
      .ep-t.ep-info    .ep-ico { color:#6366f1; }

      /* ── Body ─────────────────────────────────────────── */
      .ep-t .ep-body {
        flex    : 1;
        padding : 11px 2px 11px 0;
        min-width: 0;
      }

      /* Title — exactly like screenshot: ERROR / SUCCESS */
      .ep-t .ep-title {
        font-size      : 11px;
        font-weight    : 800;
        text-transform : uppercase;
        letter-spacing : .09em;
        margin-bottom  : 2px;
        line-height    : 1;
      }
      .ep-t.ep-success .ep-title { color:#10b981; }
      .ep-t.ep-error   .ep-title { color:#ef4444; }
      .ep-t.ep-warning .ep-title { color:#f59e0b; }
      .ep-t.ep-info    .ep-title { color:#6366f1; }

      /* Message — exactly like screenshot */
      .ep-t .ep-msg {
        font-size  : 13px;
        font-weight: 500;
        color      : #cbd5e1;
        line-height: 1.4;
        word-break : break-word;
      }

      /* ── Close X button — top right ──────────────────── */
      .ep-t .ep-x {
        width      : 36px;
        flex-shrink: 0;
        display    : flex;
        align-items: center;
        justify-content: center;
        background : none;
        border     : none;
        cursor     : pointer;
        color      : rgba(255,255,255,0.35);
        font-size  : 13px;
        transition : color 0.15s;
        padding    : 0;
        align-self : flex-start;
        padding-top: 10px;
      }
      .ep-t .ep-x:hover { color:rgba(255,255,255,0.9); }

      /* ── Bottom progress bar ─────────────────────────── */
      .ep-t .ep-prog {
        position     : absolute;
        bottom       : 0;
        left         : 0;
        height       : 2px;
        border-radius: 0 0 12px 12px;
        animation    : epProg linear forwards;
      }
      .ep-t.ep-success .ep-prog { background:#10b981; }
      .ep-t.ep-error   .ep-prog { background:#ef4444; }
      .ep-t.ep-warning .ep-prog { background:#f59e0b; }
      .ep-t.ep-info    .ep-prog { background:#6366f1; }

      @keyframes epProg {
        from { width:100%; }
        to   { width:0%;   }
      }
    `;
    document.head.appendChild(s);
  }

  // ── Config ────────────────────────────────────────────────
  const CFG = {
    success : {
      icon : 'fas fa-check-circle',
      title: 'Success'
    },
    error : {
      icon : 'fas fa-times-circle',
      title: 'Error'
    },
    warning : {
      icon : 'fas fa-exclamation-triangle',
      title: 'Warning'
    },
    info : {
      icon : 'fas fa-info-circle',
      title: 'Info'
    }
  };

  // ── Root container ────────────────────────────────────────
  function getRoot() {
    let r = document.getElementById('ep-toast-root');
    if (!r) {
      r    = document.createElement('div');
      r.id = 'ep-toast-root';
      document.body.appendChild(r);
    }
    return r;
  }

  // ── Dismiss ───────────────────────────────────────────────
  function dismiss(el) {
    if (!el || el.classList.contains('ep-out')) return;
    el.classList.add('ep-out');
    setTimeout(function () {
      if (el.parentElement) el.remove();
    }, 240);
  }

  // ── Toast function ────────────────────────────────────────
  function toast(msg, type, duration) {
    type     = (type && CFG[type]) ? type : 'info';
    duration = duration || 4000;
    msg      = msg || '';

    const cfg = CFG[type];
    const el  = document.createElement('div');
    el.className = 'ep-t ep-' + type;

    el.innerHTML =
      '<div class="ep-bar"></div>' +

      '<div class="ep-ico">' +
        '<i class="' + cfg.icon + '"></i>' +
      '</div>' +

      '<div class="ep-body">' +
        '<div class="ep-title">' + cfg.title + '</div>' +
        '<div class="ep-msg">'   + msg       + '</div>' +
      '</div>' +

      '<button class="ep-x" aria-label="Close">' +
        '&#x2715;' +
      '</button>' +

      '<div class="ep-prog" ' +
        'style="animation-duration:' + duration + 'ms">' +
      '</div>';

    el.querySelector('.ep-x')
      .addEventListener('click', function () {
        dismiss(el);
      });

    getRoot().appendChild(el);
    setTimeout(function () { dismiss(el); }, duration);
  }

  // ── Load Font Awesome if missing ──────────────────────────
  if (!document.querySelector('link[href*="font-awesome"]')) {
    const fa = document.createElement('link');
    fa.rel   = 'stylesheet';
    fa.href  =
      'https://cdnjs.cloudflare.com/ajax/libs/' +
      'font-awesome/6.5.1/css/all.min.css';
    document.head.appendChild(fa);
  }

  // ── Global aliases ────────────────────────────────────────
  window.toast     = toast;   // universal
  window.examToast = toast;   // exam.html
  window.showToast = toast;   // dashboards

})();