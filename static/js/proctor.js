// ═══════════════════════════════════════════════════════════════════════
//  ExamPro — Proctoring & Anti-Cheat System
//  Team Believer © 2026
// ═══════════════════════════════════════════════════════════════════════

class ExamProctor {
  constructor(examId, violationLimit = 3, onForceSubmit = null) {
    this.examId         = examId;
    this.limit          = violationLimit;
    this.count          = 0;
    this.onForceSubmit  = onForceSubmit;
    this.active         = false;
    this.warned         = false;
    this._handlers      = {};   // keep refs for cleanup
    this._devInterval   = null;
    this._fsWarned      = false;
    console.log('[Proctor] Initialized — limit:', violationLimit);
  }

  // ── Start proctoring ────────────────────────────────────────────────
  start() {
    this.active = true;
    this._bindTabSwitch();
    this._bindKeyBlock();
    this._bindContextMenu();
    this._bindCopyPaste();
    this._bindFullscreenChange();
    this._bindDevTools();
    this._bindWindowBlur();
    this._bindVisibility();
    this._requestFullscreen();
    console.log('[Proctor] Active');
  }

  // ── Stop all listeners ──────────────────────────────────────────────
  stop() {
    this.active = false;
    Object.entries(this._handlers).forEach(([evt, fn]) => {
      document.removeEventListener(evt, fn);
      window.removeEventListener(evt, fn);
    });
    if (this._devInterval) clearInterval(this._devInterval);
    console.log('[Proctor] Stopped');
  }

  // ══════════════════════════════════════════════════════════════════
  // 1. TAB SWITCH — Page Visibility API
  // ══════════════════════════════════════════════════════════════════
  _bindVisibility() {
    const fn = () => {
      if (!this.active) return;
      if (document.hidden || document.visibilityState === 'hidden') {
        this._reportViolation('tab_switch',
          'Tab switch detected! Do not leave the exam tab.');
      }
    };
    this._handlers['visibilitychange'] = fn;
    document.addEventListener('visibilitychange', fn);
  }

  // ══════════════════════════════════════════════════════════════════
  // 2. WINDOW BLUR — Alt+Tab, clicking outside browser, etc.
  // ══════════════════════════════════════════════════════════════════
  _bindWindowBlur() {
    const fn = () => {
      if (!this.active) return;
      this._reportViolation('window_blur',
        'Focus lost! Do not switch windows.');
    };
    this._handlers['blur'] = fn;
    window.addEventListener('blur', fn);
  }

  // ══════════════════════════════════════════════════════════════════
  // 3. TAB SWITCH (extra — beforeunload guard)
  // ══════════════════════════════════════════════════════════════════
  _bindTabSwitch() {
    const fn = (e) => {
      if (!this.active) return;
      e.preventDefault();
      e.returnValue = 'Exam is in progress. Leaving will auto-submit!';
      return e.returnValue;
    };
    this._handlers['beforeunload'] = fn;
    window.addEventListener('beforeunload', fn);
  }

  // ══════════════════��═══════════════════════════════════════════════
  // 4. KEYBOARD BLOCKING
  // ══════════════════════════════════════════════════════════════════
  _bindKeyBlock() {
    const fn = (e) => {
      if (!this.active) return;

      // Block F12 — DevTools
      if (e.key === 'F12') {
        e.preventDefault();
        this._showWarning('Dev tools are not allowed during exam!');
        return;
      }

      // Block Ctrl/Cmd combos
      if (e.ctrlKey || e.metaKey) {
        const blocked = ['c','v','x','u','a','s','p',
                         'j','k','f','g','e','i'];
        if (blocked.includes(e.key.toLowerCase())) {
          e.preventDefault();
          if (['u','j','k','i'].includes(e.key.toLowerCase())) {
            this._reportViolation('devtools_key',
              'Dev tool shortcut blocked!');
          }
        }
      }

      // Block Alt+Tab (can't fully prevent OS, but log it)
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
      }

      // Block PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        this._showWarning('Screenshots are not allowed!');
      }

      // Block Escape in fullscreen
      if (e.key === 'Escape') {
        // Don't prevent — but warn
        setTimeout(() => {
          if (!document.fullscreenElement) {
            this._reportViolation('fullscreen_exit',
              'Fullscreen exited! Please stay in fullscreen mode.');
          }
        }, 300);
      }
    };
    this._handlers['keydown'] = fn;
    document.addEventListener('keydown', fn);
  }

  // ══════════════════════════════════════════════════════════════════
  // 5. RIGHT CLICK DISABLE
  // ══════════════════════════════════════════════════════════════════
  _bindContextMenu() {
    const fn = (e) => {
      if (!this.active) return;
      e.preventDefault();
      this._showWarning('Right-click is disabled during exam.');
    };
    this._handlers['contextmenu'] = fn;
    document.addEventListener('contextmenu', fn);
  }

  // ══════════════════════════════════════════════════════════════════
  // 6. COPY / PASTE / CUT DISABLE
  // ══════════════════════════════════════════════════════════════════
  _bindCopyPaste() {
    const block = (e) => {
      if (!this.active) return;
      // Allow paste inside answer textareas
      if (e.target && e.target.tagName === 'TEXTAREA') return;
      if (e.type !== 'paste') {
        e.preventDefault();
        this._showWarning('Copy/Cut is disabled during exam.');
      }
    };
    ['copy','cut'].forEach(evt => {
      const fn = block;
      this._handlers[evt] = fn;
      document.addEventListener(evt, fn);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 7. FULLSCREEN CHANGE
  // ══════════════════════════════════════════════════════════════════
  _bindFullscreenChange() {
    const fn = () => {
      if (!this.active) return;
      if (!document.fullscreenElement &&
          !document.webkitFullscreenElement) {
        if (!this._fsWarned) {
          this._fsWarned = true;
          this._reportViolation('fullscreen_exit',
            'Fullscreen mode exited! Please re-enter fullscreen.');
          // Auto re-request after 3s
          setTimeout(() => {
            this._requestFullscreen();
            this._fsWarned = false;
          }, 3000);
        }
      }
    };
    this._handlers['fullscreenchange'] = fn;
    document.addEventListener('fullscreenchange', fn);
    document.addEventListener('webkitfullscreenchange', fn);
  }

  // ── Request fullscreen ──────────────────────────────────────────
  _requestFullscreen() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) {
      console.warn('[Proctor] Fullscreen failed:', e);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 8. DEV TOOLS DETECTION
  // ══════════════════════════════════════════════════════════════════
  _bindDevTools() {
    let prev = { w: window.outerWidth, h: window.outerHeight };

    this._devInterval = setInterval(() => {
      if (!this.active) return;

      // Method 1: window size change (DevTools opened as panel)
      const dw = Math.abs(window.outerWidth  - window.innerWidth);
      const dh = Math.abs(window.outerHeight - window.innerHeight);

      if (dw > 160 || dh > 160) {
        this._reportViolation('devtools_open',
          'Developer tools detected! Exam will be submitted.');
      }

      // Method 2: debugger trap (freezes if DevTools open)
      const t0 = performance.now();
      // eslint-disable-next-line no-debugger
      debugger; // This line takes time if DevTools is open
      const dt = performance.now() - t0;
      if (dt > 100) {
        this._reportViolation('devtools_debugger',
          'Debugging detected!');
      }

    }, 2000);
  }

  // ══════════════════════════════════════════════════════════════════
  // VIOLATION REPORT — sends to backend
  // ══════════════════════════════════════════════════════════════════
  async _reportViolation(type, msg) {
    if (!this.active) return;

    this.count++;
    const remaining = this.limit - this.count;

    console.warn(`[Proctor] Violation #${this.count}: ${type}`);

    // Show warning overlay
    this._showViolationOverlay(type, msg, this.count, this.limit);

    // Send to backend
    try {
      const r = await fetch(
        `/api/exams/${this.examId}/violation`,
        {
          method:      'POST',
          headers:     { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body:        JSON.stringify({ type, count: this.count })
        }
      );
      const d = await r.json();

      // Backend says force submit
      if (d.auto_submit) {
        this._forceSubmit();
        return;
      }

      // Local limit reached
      if (this.count >= this.limit) {
        this._forceSubmit();
      }

    } catch (err) {
      console.error('[Proctor] API error:', err);
      // Still enforce locally
      if (this.count >= this.limit) {
        this._forceSubmit();
      }
    }
  }

  // ── Force submit ────────────────────────────────────────────────
  _forceSubmit() {
    this.active = false;
    this.stop();

    // Show final overlay
    this._showForceSubmitOverlay();

    // Call the provided callback
    if (typeof this.onForceSubmit === 'function') {
      setTimeout(() => this.onForceSubmit(), 2500);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // UI OVERLAYS
  // ══════════════════════════════════════════════════════════════════

  // Simple non-blocking warning toast
  _showWarning(msg) {
    // Use existing toast system if available
    if (typeof window.examToast === 'function') {
      window.examToast(msg, 'warning');
      return;
    }
    // Fallback
    let el = document.getElementById('proctor-warn');
    if (!el) {
      el = document.createElement('div');
      el.id = 'proctor-warn';
      el.style.cssText = `
        position:fixed; top:80px; left:50%; transform:translateX(-50%);
        z-index:99999; background:rgba(245,158,11,0.95);
        color:white; padding:10px 24px; border-radius:12px;
        font-family:Inter,sans-serif; font-size:13px; font-weight:700;
        box-shadow:0 8px 24px rgba(0,0,0,0.5);
        pointer-events:none; transition:opacity 0.3s;`;
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(this._warnTimer);
    this._warnTimer = setTimeout(() => {
      el.style.opacity = '0';
    }, 2500);
  }

  // Blocking violation overlay
  _showViolationOverlay(type, msg, count, limit) {
    // Remove existing
    document.getElementById('proctor-overlay')?.remove();

    const remaining = limit - count;
    const isLast    = remaining <= 0;

    const ov = document.createElement('div');
    ov.id    = 'proctor-overlay';
    ov.style.cssText = `
      position:fixed; inset:0; z-index:999999;
      background:rgba(0,0,0,0.88);
      display:flex; align-items:center; justify-content:center;
      font-family:Inter,sans-serif;
      animation:fadeIn 0.2s ease;`;

    ov.innerHTML = `
      <style>
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%,60%{transform:translateX(-8px)}
          40%,80%{transform:translateX(8px)}
        }
        .shake { animation:shake 0.5s ease; }
      </style>
      <div style="
        background:rgba(10,14,40,0.98);
        border:2px solid rgba(239,68,68,0.6);
        border-radius:20px;
        padding:36px 40px;
        max-width:440px; width:90%;
        text-align:center;
        box-shadow:0 24px 64px rgba(239,68,68,0.25);"
        class="shake">

        <!-- Icon -->
        <div style="
          width:64px;height:64px;border-radius:50%;
          background:rgba(239,68,68,0.15);
          border:2px solid rgba(239,68,68,0.4);
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 20px;">
          <svg width="28" height="28" viewBox="0 0 24 24"
            fill="none" stroke="#ef4444" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94
              a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>

        <!-- Title -->
        <h3 style="color:#ef4444;font-size:18px;
          font-weight:900;margin-bottom:10px;
          text-transform:uppercase;letter-spacing:.05em;">
          Violation Detected
        </h3>

        <!-- Message -->
        <p style="color:#e2e8f0;font-size:14px;
          line-height:1.6;margin-bottom:20px;">
          ${msg}
        </p>

        <!-- Counter -->
        <div style="
          background:rgba(239,68,68,0.1);
          border:1px solid rgba(239,68,68,0.3);
          border-radius:12px;padding:12px 20px;
          margin-bottom:20px;">
          <p style="color:#9ca3af;font-size:11px;
            font-weight:700;text-transform:uppercase;
            letter-spacing:.08em;margin-bottom:4px;">
            Violation Count
          </p>
          <p style="font-size:28px;font-weight:900;
            color:${isLast ? '#ef4444' : '#f59e0b'};">
            ${count} / ${limit}
          </p>
          <p style="color:${isLast ? '#ef4444' : '#fbbf24'};
            font-size:12px;font-weight:600;margin-top:4px;">
            ${isLast
              ? 'Exam will be auto-submitted now!'
              : `${remaining} warning(s) remaining before auto-submit`}
          </p>
        </div>

        <!-- Auto-dismiss -->
        ${!isLast ? `
        <button onclick="document.getElementById('proctor-overlay').remove()"
          style="
            background:linear-gradient(135deg,#1e3a8a,#1d4ed8);
            border:none;border-radius:10px;
            color:white;padding:10px 28px;
            font-weight:700;font-size:13px;cursor:pointer;">
          <i style="margin-right:6px">&#xf0e2;</i>
          I Understand — Return to Exam
        </button>` : `
        <p style="color:#ef4444;font-size:13px;font-weight:700;">
          Submitting your exam...
        </p>`}
      </div>`;

    document.body.appendChild(ov);

    // Auto close after 4s if not last
    if (!isLast) {
      setTimeout(() => ov.remove(), 5000);
    }
  }

  // Final force-submit overlay
  _showForceSubmitOverlay() {
    document.getElementById('proctor-overlay')?.remove();

    const ov = document.createElement('div');
    ov.style.cssText = `
      position:fixed; inset:0; z-index:999999;
      background:rgba(0,0,0,0.95);
      display:flex; align-items:center; justify-content:center;
      font-family:Inter,sans-serif;`;

    ov.innerHTML = `
      <div style="
        background:rgba(10,14,40,0.99);
        border:2px solid rgba(239,68,68,0.8);
        border-radius:20px; padding:40px;
        max-width:420px; width:90%; text-align:center;
        box-shadow:0 32px 80px rgba(239,68,68,0.3);">

        <div style="
          width:72px;height:72px;border-radius:50%;
          background:rgba(239,68,68,0.2);
          border:2px solid rgba(239,68,68,0.6);
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 24px;">
          <svg width="32" height="32" viewBox="0 0 24 24"
            fill="none" stroke="#ef4444" stroke-width="2.5"
            stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        </div>

        <h3 style="color:#ef4444;font-size:20px;
          font-weight:900;margin-bottom:10px;
          text-transform:uppercase;letter-spacing:.05em;">
          Exam Auto-Submitted
        </h3>

        <p style="color:#9ca3af;font-size:14px;
          line-height:1.6;margin-bottom:24px;">
          You exceeded the violation limit.<br/>
          Your exam has been submitted automatically.
        </p>

        <div style="
          background:rgba(239,68,68,0.1);
          border:1px solid rgba(239,68,68,0.3);
          border-radius:12px;padding:14px;margin-bottom:24px;">
          <p style="color:#fca5a5;font-size:12px;font-weight:600;">
            Violations: ${this.count} / ${this.limit}
          </p>
        </div>

        <div style="
          width:100%;height:4px;background:rgba(255,255,255,0.1);
          border-radius:4px;overflow:hidden;">
          <div style="
            height:100%;background:#ef4444;
            animation:progress 2.5s linear forwards;">
          </div>
        </div>
        <p style="color:#6b7280;font-size:11px;margin-top:8px;">
          Redirecting to dashboard...
        </p>
      </div>
      <style>
        @keyframes progress{from{width:0}to{width:100%}}
      </style>`;

    document.body.appendChild(ov);
  }
}

// Export globally
window.ExamProctor = ExamProctor;