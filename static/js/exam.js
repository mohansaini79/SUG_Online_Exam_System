/* ═══════════════════════════════════════════════════════
   ExamPro — Exam logic  (fixed version)
   ═══════════════════════════════════════════════════════ */

'use strict';

let answers      = {};
let questions    = [];
let timerSecs    = 0;
let timerInt     = null;
let autoSaveInt  = null;
let heartbeatInt = null;
let submitted    = false;
let examStarted  = false;

// ── Fullscreen ────────────────────────────────────────────────────────────
function enterFullscreen() {
  document.documentElement.requestFullscreen()
    .then(() => {
      document.getElementById('fullscreen-overlay').style.display = 'none';
      if (!examStarted) startExamFlow();
    })
    .catch(err => {
      console.warn('[Fullscreen] denied:', err.message);
      document.getElementById('fullscreen-overlay').style.display = 'none';
      if (!examStarted) startExamFlow();
    });
}

function skipFullscreen() {
  document.getElementById('fullscreen-overlay').style.display = 'none';
  if (!examStarted) startExamFlow();
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && examStarted && !submitted) {
    document.getElementById('fullscreen-overlay').style.display = 'flex';
    logViolation('fullscreen_exit');
  }
});

// ── Main entry point ──────────────────────────────────────────────────────
// Called after user clicks "Enter Fullscreen" OR "Continue without"
async function startExamFlow() {
  if (examStarted) return;
  examStarted = true;

  setStatus('Starting exam session…');

  // 1. Start session on server
  const sessRes = await safeFetch('POST', `/api/exams/${EXAM_ID}/session`, {});

  if (!sessRes.ok) {
    const err = sessRes.data?.error || 'Failed to start exam session';

    if (sessRes.data?.submitted) {
      showAlreadySubmitted();
      return;
    }

    // Exam not live yet — show waiting screen
    if (sessRes.status === 400) {
      showNotLiveScreen(err);
      return;
    }

    showError(err);
    return;
  }

  answers   = sessRes.data.answers   || {};
  timerSecs = sessRes.data.remaining || 3600;

  setStatus('Loading exam details…');

  // 2. Load exam info
  const examRes = await safeFetch('GET', `/api/exams/${EXAM_ID}`);
  if (examRes.ok) {
    document.getElementById('exam-title').textContent =
      examRes.data.title || 'Exam';
  }

  setStatus('Loading questions…');

  // 3. Load questions
  const qRes = await safeFetch('GET', `/api/exams/${EXAM_ID}/questions`);
  if (!qRes.ok) {
    showError('Failed to load questions: ' + (qRes.data?.error || 'Unknown error'));
    return;
  }

  questions = Array.isArray(qRes.data) ? qRes.data : [];

  if (!questions.length) {
    showError('No questions found for this exam. Please contact your faculty.');
    return;
  }

  // 4. Render everything
  renderQuestions();
  updateProgress();
  startTimer();

  // 5. Auto-save every 10s
  autoSaveInt = setInterval(doAutoSave, 10000);

  // 6. Heartbeat every 20s
  heartbeatInt = setInterval(doHeartbeat, 20000);

  // 7. Socket events
  if (typeof socket !== 'undefined') {
    socket.emit('join_exam', { exam_id: EXAM_ID });
    socket.on('exam_ended', () => {
      showToast('warning', '⏰ Exam has ended. Auto-submitting…', 0);
      setTimeout(() => submitExam(true), 1500);
    });
  }

  console.log(`[Exam] Loaded ${questions.length} questions, timer=${timerSecs}s`);
}

// ── Status helper ─────────────────────────────────────────────────────────
function setStatus(msg) {
  const el = document.getElementById('load-status');
  if (el) el.textContent = msg;
  console.log('[Exam]', msg);
}

// ── Render Questions ──────────────────────────────────────────────────────
function renderQuestions() {
  const c = document.getElementById('questions-container');
  document.getElementById('q-total').textContent = questions.length;

  c.innerHTML = questions.map((q, i) => `
    <div class="q-card rounded-2xl p-6" id="qcard-${i}">
      <!-- Header -->
      <div class="flex items-start gap-3 mb-4">
        <div class="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
          <span class="w-7 h-7 rounded-xl text-sm font-black flex items-center justify-center
            ${q.type === 'mcq'
              ? 'bg-indigo-600/30 text-indigo-300'
              : 'bg-purple-600/30 text-purple-300'}">
            ${i + 1}
          </span>
          <span class="text-[10px] px-1.5 py-0.5 rounded-lg font-semibold uppercase
            ${q.type === 'mcq'
              ? 'bg-indigo-500/15 text-indigo-400'
              : 'bg-purple-500/15 text-purple-400'}">
            ${q.type === 'mcq' ? 'MCQ' : 'Written'}
          </span>
        </div>
        <p class="text-gray-100 text-sm leading-relaxed flex-1">${escHtml(q.text)}</p>
        <span class="text-xs text-gray-600 flex-shrink-0 font-mono
          bg-gray-800/60 px-2 py-0.5 rounded-lg whitespace-nowrap">
          ${q.marks} mark${q.marks !== 1 ? 's' : ''}
        </span>
      </div>

      <!-- MCQ options -->
      ${q.type === 'mcq' ? renderMCQ(q, i) : renderSubjective(q, i)}
    </div>`).join('');

  // Restore saved answers
  questions.forEach((q, i) => {
    const saved = answers[q._id];
    if (!saved) return;

    if (q.type === 'mcq') {
      document.querySelectorAll(`input[name="mcq-${i}"]`).forEach(radio => {
        if (radio.value === saved) {
          radio.checked = true;
          radio.nextElementSibling?.classList.add('opt-selected');
        }
      });
    } else {
      const ta = document.getElementById(`subj-${i}`);
      if (ta) ta.value = saved;
    }
  });
}

function renderMCQ(q, i) {
  if (!q.options || !q.options.length) {
    return '<p class="text-gray-600 text-xs italic">No options available.</p>';
  }
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      ${q.options.map((opt, j) => `
        <label class="flex cursor-pointer select-none">
          <input type="radio"
            name="mcq-${i}"
            value="${escHtml(opt)}"
            class="sr-only"
            onchange="onMCQChange(${i}, '${escJs(q._id)}', '${escJs(opt)}', this)"/>
          <div class="opt-label w-full px-4 py-3 flex items-center gap-3">
            <span class="w-6 h-6 rounded-full border-2 border-gray-600 flex-shrink-0
              flex items-center justify-center text-xs font-bold text-gray-400">
              ${letters[j] || j + 1}
            </span>
            <span class="text-sm text-gray-200 leading-snug">${escHtml(opt)}</span>
          </div>
        </label>`).join('')}
    </div>`;
}

function renderSubjective(q, i) {
  return `
    <textarea
      id="subj-${i}"
      rows="5"
      placeholder="Write your answer here…"
      oninput="onSubjectiveChange(${i}, '${escJs(q._id)}', this.value)"
      class="textarea-ans w-full rounded-xl px-4 py-3 text-sm
        resize-y min-h-[120px] max-h-[500px] leading-relaxed w-full block">
    </textarea>`;
}

// ── Answer handlers ───────────────────────────────────────────────────────
function onMCQChange(qIndex, qId, value, inputEl) {
  const card = document.getElementById(`qcard-${qIndex}`);
  if (card) {
    card.querySelectorAll('.opt-label').forEach(l => l.classList.remove('opt-selected'));
  }
  inputEl.nextElementSibling?.classList.add('opt-selected');
  answers[qId] = value;
  updateProgress();
  flashSaveIndicator();
}

function onSubjectiveChange(qIndex, qId, value) {
  answers[qId] = value;
  updateProgress();
}

// ── Progress bar ──────────────────────────────────────────────────────────
function updateProgress() {
  const answered = questions.filter(q => {
    const a = answers[q._id];
    return a !== undefined && a !== null && String(a).trim() !== '';
  }).length;

  document.getElementById('q-answered').textContent = answered;
  document.getElementById('q-total').textContent    = questions.length;

  const pct = questions.length ? Math.round(answered / questions.length * 100) : 0;
  document.getElementById('progress-bar').style.width = pct + '%';
}

// ── Timer ─────────────────────────────────────────────────────────────────
function startTimer() {
  renderTimer();
  timerInt = setInterval(() => {
    if (submitted) { clearInterval(timerInt); return; }
    timerSecs = Math.max(0, timerSecs - 1);
    renderTimer();
    if (timerSecs === 0) {
      clearInterval(timerInt);
      showToast('warning', '⏰ Time is up! Auto-submitting…', 0);
      submitExam(true);
    }
  }, 1000);
}

function renderTimer() {
  const h   = Math.floor(timerSecs / 3600);
  const m   = Math.floor((timerSecs % 3600) / 60);
  const s   = timerSecs % 60;
  const fmt = h > 0
    ? `${h}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`;

  const el  = document.getElementById('timer-display');
  const box = document.getElementById('timer-box');
  if (!el) return;

  el.textContent = fmt;
  el.classList.remove('timer-urgent');

  if (timerSecs <= 60) {
    el.classList.add('timer-urgent');
    if (box) box.style.borderColor = 'rgba(239,68,68,0.5)';
  } else if (timerSecs <= 300) {
    el.style.color = '#f59e0b';
    if (box) box.style.borderColor = 'rgba(245,158,11,0.3)';
  } else {
    el.style.color = '#34d399';
    if (box) box.style.borderColor = '';
  }
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── Auto-save ─────────────────────────────────────────────────────────────
async function doAutoSave() {
  if (submitted || !examStarted) return;
  try {
    await fetch(`/api/exams/${EXAM_ID}/autosave`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body:    JSON.stringify({ answers })
    });
    flashSaveIndicator();
  } catch (e) {
    console.warn('[AutoSave] failed:', e);
  }
}

function flashSaveIndicator() {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

// ── Heartbeat ─────────────────────────────────────────────────────────────
async function doHeartbeat() {
  if (submitted || !examStarted) return;
  try {
    const r = await fetch(`/api/exams/${EXAM_ID}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({})
    });
    if (r.ok) {
      const d = await r.json();
      if (d.remaining !== undefined) timerSecs = d.remaining;
      if (d.status === 'ended') submitExam(true);
    }
  } catch (e) {
    console.warn('[Heartbeat] failed:', e);
  }
}

// ── Submit ────────────────────────────────────────────────────────────────
async function submitExam(auto = false) {
  if (submitted) return;

  if (!auto) {
    const answered   = questions.filter(q =>
      answers[q._id] !== undefined && String(answers[q._id]).trim() !== '').length;
    const unanswered = questions.length - answered;

    if (unanswered > 0) {
      if (!confirm(
        `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}.\n` +
        `Submit anyway?`)) return;
    } else {
      if (!confirm('Submit your exam now? This cannot be undone.')) return;
    }
  }

  submitted = true;
  clearInterval(timerInt);
  clearInterval(autoSaveInt);
  clearInterval(heartbeatInt);

  const btn = document.getElementById('submit-btn');
  if (btn) {
    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Submitting…';
  }

  // Final save
  await doAutoSave();

  const res = await safeFetch('POST', `/api/exams/${EXAM_ID}/submit`, { answers });

  if (res.ok) {
    showSubmittedScreen();
  } else {
    showToast('error', '❌ ' + (res.data?.error || 'Submission failed. Try again.'), 6000);
    submitted = false;
    if (btn) {
      btn.disabled  = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i><span class="hidden sm:inline ml-1.5">Submit Exam</span>';
    }
  }
}

// ── Result screens ────────────────────────────────────────────────────────
function showSubmittedScreen() {
  try { document.exitFullscreen(); } catch (e) { /* ignore */ }
  document.body.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4"
      style="background:#020208;font-family:Inter,sans-serif">
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)"
        class="rounded-3xl p-10 text-center max-w-md w-full shadow-2xl">
        <div class="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
          style="background:rgba(16,185,129,0.12);border:2px solid rgba(16,185,129,0.3)">
          <i class="fas fa-check-circle" style="color:#34d399;font-size:2.5rem"></i>
        </div>
        <h1 style="color:white;font-size:2rem;font-weight:900;margin-bottom:.5rem">
          Exam Submitted!
        </h1>
        <p style="color:#9ca3af;margin-bottom:1.5rem;line-height:1.6">
          Your answers have been saved successfully.<br/>
          Results will be available after your faculty publishes them.
        </p>
        <a href="/student/dashboard"
          style="display:block;width:100%;padding:.875rem;border-radius:.75rem;
            font-weight:700;color:white;text-decoration:none;
            background:linear-gradient(135deg,#6366f1,#8b5cf6)">
          ← Back to Dashboard
        </a>
      </div>
    </div>`;
}

function showAlreadySubmitted() {
  document.getElementById('questions-container').innerHTML = `
    <div class="text-center py-20">
      <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2)">
        <i class="fas fa-exclamation-triangle text-2xl text-yellow-400"></i>
      </div>
      <p class="text-white font-bold text-xl mb-2">Already Submitted</p>
      <p class="text-gray-400 mb-5 text-sm">You have already submitted this exam.</p>
      <a href="/student/dashboard"
        class="px-6 py-2.5 rounded-xl font-bold text-white text-sm inline-block
          bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90">
        ← Back to Dashboard
      </a>
    </div>`;
  document.getElementById('fullscreen-overlay').style.display = 'none';
}

function showNotLiveScreen(msg) {
  document.getElementById('questions-container').innerHTML = `
    <div class="glass rounded-2xl p-10 text-center">
      <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2)">
        <i class="fas fa-clock text-3xl text-yellow-400"></i>
      </div>
      <p class="text-white font-bold text-xl mb-2">Exam Not Started</p>
      <p class="text-gray-400 text-sm mb-5">${escHtml(msg)}</p>
      <p class="text-gray-500 text-xs mb-5">
        Wait for your faculty to start the exam, then refresh this page.
      </p>
      <div class="flex gap-3 justify-center flex-wrap">
        <button onclick="location.reload()"
          class="px-5 py-2 rounded-xl text-sm font-bold text-white
            bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90">
          <i class="fas fa-sync-alt mr-1.5"></i>Refresh
        </button>
        <a href="/student/dashboard"
          class="px-5 py-2 rounded-xl text-sm font-semibold text-gray-400
            border border-gray-700 hover:text-white transition-colors">
          ← Dashboard
        </a>
      </div>
    </div>`;
  document.getElementById('fullscreen-overlay').style.display = 'none';

  // Auto-refresh every 15s
  setTimeout(() => {
    if (!examStarted || !submitted) location.reload();
  }, 15000);
}

function showError(msg) {
  console.error('[Exam] Error:', msg);
  document.getElementById('questions-container').innerHTML = `
    <div class="glass rounded-2xl p-10 text-center">
      <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2)">
        <i class="fas fa-times-circle text-3xl text-red-400"></i>
      </div>
      <p class="text-white font-bold text-xl mb-2">Error Loading Exam</p>
      <p class="text-red-400 text-sm mb-5 font-mono">${escHtml(msg)}</p>
      <div class="flex gap-3 justify-center flex-wrap">
        <button onclick="location.reload()"
          class="px-5 py-2 rounded-xl text-sm font-bold text-white
            bg-red-600 hover:bg-red-500 transition-colors">
          <i class="fas fa-sync-alt mr-1.5"></i>Try Again
        </button>
        <a href="/student/dashboard"
          class="px-5 py-2 rounded-xl text-sm font-semibold text-gray-400
            border border-gray-700 hover:text-white transition-colors">
          ← Dashboard
        </a>
      </div>
    </div>`;
  document.getElementById('fullscreen-overlay').style.display = 'none';
  examStarted = false;
}

// ── Safe fetch ────────────────────────────────────────────────────────────
async function safeFetch(method, url, body) {
  try {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    };
    if (method !== 'GET') opts.body = JSON.stringify(body || {});
    const r = await fetch(url, opts);
    let d;
    try { d = await r.json(); } catch { d = {}; }
    return { ok: r.ok, status: r.status, data: d };
  } catch (e) {
    console.error('[Fetch]', method, url, e);
    return { ok: false, status: 0, data: { error: e.message } };
  }
}

// ── Escape helpers ────────────────────────────────────────────────────────
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escJs(s) {
  if (s == null) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ── Boot: show fullscreen prompt first, exam loads after user clicks ──────
// (No DOMContentLoaded needed — scripts are at bottom of body)
console.log('[Exam] Page ready. EXAM_ID =', EXAM_ID);