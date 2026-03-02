// ═══════════════════════════════════════════════════════════════════════
//  ExamPro — Camera Proctoring System
//  Team Believer © 2026
// ═══════════════════════════════════════════════════════════════════════

class CameraProctor {
  constructor(options = {}) {
    this.examId        = options.examId   || '';
    this.onViolation   = options.onViolation || null;
    this.stream        = null;
    this.video         = null;
    this.canvas        = null;
    this.ctx           = null;
    this.container     = null;
    this.active        = false;
    this.faceOk        = true;
    this._detectLoop   = null;
    this._snapInterval = null;
    this._noFaceCount  = 0;
    this._noFaceLimit  = 5;   // 5 consecutive no-face = violation
    this._snapCount    = 0;
  }

  // ── Start camera ──────────────────────────────────────────────────
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:       { ideal: 320 },
          height:      { ideal: 240 },
          facingMode:  'user'
        },
        audio: false
      });
      this._buildUI();
      this._attachStream();
      this.active = true;
      this._startDetection();
      console.log('[Camera] Started');
      return true;
    } catch (err) {
      console.warn('[Camera] Access denied:', err);
      this._showDenied();
      return false;
    }
  }

  // ── Stop camera ───────────────────────────────────────────────────
  stop() {
    this.active = false;
    if (this._detectLoop)   clearInterval(this._detectLoop);
    if (this._snapInterval) clearInterval(this._snapInterval);
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    console.log('[Camera] Stopped');
  }

  // ── Build camera UI frame ─────────────────────────────────────────
  _buildUI() {
    // Remove existing
    document.getElementById('cam-proctor-box')?.remove();

    const box = document.createElement('div');
    box.id    = 'cam-proctor-box';
    box.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      z-index: 9000;
      width: 200px;
      background: rgba(8,12,38,0.95);
      border: 2px solid rgba(59,130,246,0.5);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.7),
                  0 0 0 1px rgba(255,255,255,0.05) inset;
      font-family: Inter, sans-serif;
      transition: border-color 0.3s;
    `;

    box.innerHTML = `
      <!-- Header bar -->
      <div id="cam-header" style="
        display: flex; align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        background: rgba(30,58,138,0.8);
        border-bottom: 1px solid rgba(255,255,255,0.08);">

        <div style="display:flex;align-items:center;gap:6px;">
          <!-- Live dot -->
          <span id="cam-dot" style="
            width:8px; height:8px; border-radius:50%;
            background:#10b981;
            box-shadow: 0 0 6px #10b981;
            display:inline-block;
            animation: pulse-green 1.5s infinite;">
          </span>
          <span style="
            color:white; font-size:10px;
            font-weight:700; letter-spacing:.05em;
            text-transform:uppercase;">
            Live Camera
          </span>
        </div>

        <!-- Status badge -->
        <span id="cam-status-badge" style="
          font-size:9px; font-weight:700;
          padding:2px 7px; border-radius:20px;
          background:rgba(16,185,129,0.2);
          border:1px solid rgba(16,185,129,0.4);
          color:#10b981; letter-spacing:.04em;
          text-transform:uppercase;">
          OK
        </span>
      </div>

      <!-- Video frame -->
      <div style="position:relative; background:#000;">
        <video id="cam-video" autoplay muted playsinline
          style="
            width:100%; height:150px;
            object-fit:cover; display:block;
            transform: scaleX(-1);">
        </video>

        <!-- Face detection overlay canvas -->
        <canvas id="cam-canvas" style="
          position:absolute; inset:0;
          width:100%; height:100%;
          pointer-events:none;">
        </canvas>

        <!-- Corner brackets (decorative) -->
        <div style="position:absolute;top:6px;left:6px;
          width:16px;height:16px;
          border-top:2px solid rgba(16,185,129,0.8);
          border-left:2px solid rgba(16,185,129,0.8);
          border-radius:2px 0 0 0;"></div>
        <div style="position:absolute;top:6px;right:6px;
          width:16px;height:16px;
          border-top:2px solid rgba(16,185,129,0.8);
          border-right:2px solid rgba(16,185,129,0.8);
          border-radius:0 2px 0 0;"></div>
        <div style="position:absolute;bottom:6px;left:6px;
          width:16px;height:16px;
          border-bottom:2px solid rgba(16,185,129,0.8);
          border-left:2px solid rgba(16,185,129,0.8);
          border-radius:0 0 0 2px;"></div>
        <div style="position:absolute;bottom:6px;right:6px;
          width:16px;height:16px;
          border-bottom:2px solid rgba(16,185,129,0.8);
          border-right:2px solid rgba(16,185,129,0.8);
          border-radius:0 0 2px 0;"></div>

        <!-- No face warning overlay -->
        <div id="cam-no-face" style="
          position:absolute; inset:0;
          background:rgba(239,68,68,0.15);
          display:none;
          align-items:center; justify-content:center;
          flex-direction:column; gap:4px;">
          <svg width="28" height="28" viewBox="0 0 24 24"
            fill="none" stroke="#ef4444" stroke-width="2"
            stroke-linecap="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M6 20v-2a6 6 0 0 1 12 0v2"/>
            <line x1="2" y1="2" x2="22" y2="22"
              stroke="#ef4444" stroke-width="2.5"/>
          </svg>
          <span style="color:#ef4444;font-size:9px;
            font-weight:700;text-transform:uppercase;
            letter-spacing:.05em;">
            Face Not Detected
          </span>
        </div>
      </div>

      <!-- Footer info -->
      <div id="cam-footer" style="
        padding: 7px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: 1px solid rgba(255,255,255,0.06);">

        <span id="cam-face-txt" style="
          color:#10b981; font-size:10px;
          font-weight:600; display:flex;
          align-items:center; gap:5px;">
          <svg width="10" height="10" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          Face Detected
        </span>

        <span id="cam-snap-txt" style="
          color:#6b7280; font-size:9px;
          font-weight:600;">
          Snap: 0
        </span>
      </div>

      <!-- Minimize button -->
      <button id="cam-minimize" onclick="window._camMinimize()"
        style="
          position:absolute; top:6px; right:44px;
          background:none; border:none; cursor:pointer;
          color:rgba(255,255,255,0.4); font-size:10px;
          padding:2px 4px; z-index:1;">
        &#x2015;
      </button>

      <style>
        @keyframes pulse-green {
          0%,100%{ box-shadow:0 0 4px #10b981; opacity:1; }
          50%    { box-shadow:0 0 10px #10b981; opacity:0.7; }
        }
        @keyframes pulse-red {
          0%,100%{ box-shadow:0 0 4px #ef4444; opacity:1; }
          50%    { box-shadow:0 0 10px #ef4444; opacity:0.6; }
        }
      </style>
    `;

    document.body.appendChild(box);
    this.container = box;

    // Minimize toggle
    let minimized = false;
    window._camMinimize = () => {
      minimized = !minimized;
      const vid = box.querySelector('#cam-video').parentElement;
      const ftr = box.querySelector('#cam-footer');
      vid.style.display = minimized ? 'none' : 'block';
      ftr.style.display = minimized ? 'none' : 'flex';
      box.style.width   = minimized ? '130px' : '200px';
    };
  }

  // ── Attach stream to video ────────────────────────────────────────
  _attachStream() {
    this.video  = document.getElementById('cam-video');
    this.canvas = document.getElementById('cam-canvas');
    if (this.video && this.stream) {
      this.video.srcObject = this.stream;
      this.video.onloadedmetadata = () => {
        this.canvas.width  = this.video.videoWidth  || 320;
        this.canvas.height = this.video.videoHeight || 240;
        this.ctx = this.canvas.getContext('2d');
      };
    }
  }

  // ── Face detection loop (lightweight pixel analysis) ─────────────
  _startDetection() {
    // Snapshot every 30 seconds
    this._snapInterval = setInterval(() => {
      this._takeSnapshot();
    }, 30000);

    // Detection every 2 seconds
    this._detectLoop = setInterval(() => {
      if (!this.active || !this.video) return;
      this._detectFace();
    }, 2000);
  }

  // ── Lightweight brightness-based face detection ───────────────────
  _detectFace() {
    if (!this.ctx || !this.video ||
        this.video.readyState < 2) return;

    try {
      const w = this.canvas.width  || 320;
      const h = this.canvas.height || 240;

      // Draw current frame
      this.ctx.drawImage(this.video, 0, 0, w, h);

      // Sample pixels in face region (center-top area)
      const faceX = Math.floor(w * 0.25);
      const faceY = Math.floor(h * 0.1);
      const faceW = Math.floor(w * 0.5);
      const faceH = Math.floor(h * 0.6);

      const data   = this.ctx.getImageData(
        faceX, faceY, faceW, faceH).data;
      let   bright = 0;
      let   skinPx = 0;
      const total  = data.length / 4;

      for (let i = 0; i < data.length; i += 16) {
        const r = data[i], g = data[i+1], b = data[i+2];
        bright += (r + g + b) / 3;

        // Rough skin tone detection
        if (r > 60 && r < 250 &&
            g > 40 && g < 200 &&
            b > 20 && b < 180 &&
            r > g && r > b &&
            (r - g) > 15) {
          skinPx++;
        }
      }

      const avgBright = bright / (data.length / 16);
      const skinRatio = skinPx / (data.length / 16);

      // Face present if: enough brightness + some skin tone
      const faceDetected = avgBright > 25 && skinRatio > 0.08;

      this._updateFaceStatus(faceDetected);

    } catch (err) {
      // Canvas tainted or video not ready
      this._updateFaceStatus(true); // assume OK on error
    }
  }

  // ── Update UI based on face status ───────────────────────────────
  _updateFaceStatus(detected) {
    const box      = document.getElementById('cam-proctor-box');
    const dot      = document.getElementById('cam-dot');
    const badge    = document.getElementById('cam-status-badge');
    const noFace   = document.getElementById('cam-no-face');
    const faceTxt  = document.getElementById('cam-face-txt');

    if (!box) return;

    if (detected) {
      // Face OK
      this._noFaceCount = 0;
      this.faceOk = true;

      box.style.borderColor = 'rgba(59,130,246,0.5)';
      if (dot) {
        dot.style.background  = '#10b981';
        dot.style.boxShadow   = '0 0 6px #10b981';
        dot.style.animation   = 'pulse-green 1.5s infinite';
      }
      if (badge) {
        badge.style.background   = 'rgba(16,185,129,0.2)';
        badge.style.borderColor  = 'rgba(16,185,129,0.4)';
        badge.style.color        = '#10b981';
        badge.textContent        = 'OK';
      }
      if (noFace)  noFace.style.display  = 'none';
      if (faceTxt) {
        faceTxt.style.color = '#10b981';
        faceTxt.innerHTML   = `
          <svg width="10" height="10" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M20 6L9 17l-5-5"/>
          </svg> Face Detected`;
      }

    } else {
      // No face
      this._noFaceCount++;
      this.faceOk = false;

      box.style.borderColor = 'rgba(239,68,68,0.7)';
      if (dot) {
        dot.style.background  = '#ef4444';
        dot.style.boxShadow   = '0 0 6px #ef4444';
        dot.style.animation   = 'pulse-red 1s infinite';
      }
      if (badge) {
        badge.style.background  = 'rgba(239,68,68,0.2)';
        badge.style.borderColor = 'rgba(239,68,68,0.4)';
        badge.style.color       = '#ef4444';
        badge.textContent       = 'WARN';
      }
      if (noFace)  noFace.style.display  = 'flex';
      if (faceTxt) {
        faceTxt.style.color = '#ef4444';
        faceTxt.innerHTML   = `
          <svg width="10" height="10" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg> No Face`;
      }

      // Report violation after consecutive misses
      if (this._noFaceCount >= this._noFaceLimit) {
        this._noFaceCount = 0;
        if (typeof this.onViolation === 'function') {
          this.onViolation('no_face',
            'Face not detected in camera! Please stay visible.');
        }
      }
    }
  }

  // ── Take snapshot ─────────────────────────────────────────────────
  _takeSnapshot() {
    if (!this.video || !this.active) return;
    try {
      const snap   = document.createElement('canvas');
      snap.width   = 320;
      snap.height  = 240;
      const sCtx   = snap.getContext('2d');
      sCtx.drawImage(this.video, 0, 0, 320, 240);
      this._snapCount++;

      // Update snap counter
      const txt = document.getElementById('cam-snap-txt');
      if (txt) txt.textContent = `Snap: ${this._snapCount}`;

      // Flash effect
      const box = document.getElementById('cam-proctor-box');
      if (box) {
        box.style.borderColor = 'rgba(255,255,255,0.8)';
        setTimeout(() => {
          box.style.borderColor = this.faceOk
            ? 'rgba(59,130,246,0.5)'
            : 'rgba(239,68,68,0.7)';
        }, 200);
      }

      console.log(`[Camera] Snapshot #${this._snapCount} taken`);
    } catch (e) {
      console.warn('[Camera] Snapshot failed:', e);
    }
  }

  // ── Camera denied UI ─────────────────────────────────────────────
  _showDenied() {
    document.getElementById('cam-proctor-box')?.remove();

    const box = document.createElement('div');
    box.id    = 'cam-proctor-box';
    box.style.cssText = `
      position:fixed; bottom:80px; right:20px; z-index:9000;
      width:200px;
      background:rgba(8,12,38,0.95);
      border:2px solid rgba(239,68,68,0.5);
      border-radius:16px; overflow:hidden;
      box-shadow:0 8px 32px rgba(0,0,0,0.7);
      font-family:Inter,sans-serif;`;

    box.innerHTML = `
      <div style="padding:14px;text-align:center;">
        <div style="
          width:44px;height:44px;border-radius:50%;
          background:rgba(239,68,68,0.15);
          border:1px solid rgba(239,68,68,0.4);
          display:flex;align-items:center;
          justify-content:center;margin:0 auto 10px;">
          <svg width="20" height="20" viewBox="0 0 24 24"
            fill="none" stroke="#ef4444" stroke-width="2"
            stroke-linecap="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8
              a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <line x1="2" y1="2" x2="22" y2="22"/>
          </svg>
        </div>
        <p style="color:#ef4444;font-size:11px;
          font-weight:700;margin-bottom:4px;">
          Camera Denied
        </p>
        <p style="color:#6b7280;font-size:10px;
          line-height:1.4;">
          Please allow camera access<br/>
          and reload the page.
        </p>
        <button onclick="location.reload()"
          style="
            margin-top:10px;
            background:rgba(239,68,68,0.2);
            border:1px solid rgba(239,68,68,0.4);
            border-radius:8px;color:#ef4444;
            padding:6px 14px;font-size:11px;
            font-weight:700;cursor:pointer;
            width:100%;">
          Reload & Allow
        </button>
      </div>`;

    document.body.appendChild(box);
  }
}

// ── Export ────────────────────────────────────────────────────────────
window.CameraProctor = CameraProctor;