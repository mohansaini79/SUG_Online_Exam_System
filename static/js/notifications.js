/* ═══════════════════════════════════════════════════════
   ExamPro — Notification polling
   ═══════════════════════════════════════════════════════ */

let _lastNotifCount = 0;

async function checkNotifications() {
  try {
    const { ok, data } = await apiGet('/api/notifications');
    if (!ok || !Array.isArray(data)) return;
    if (data.length > _lastNotifCount && _lastNotifCount > 0) {
      const newest = data[0];
      showToast('info', `🔔 ${newest.message || 'New notification'}`, 5000);
    }
    _lastNotifCount = data.length;
  } catch (e) { /* silent */ }
}

// Poll every 30 seconds
setInterval(checkNotifications, 30000);