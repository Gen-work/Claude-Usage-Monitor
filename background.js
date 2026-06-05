// background.js — Service Worker
// Fetches Claude usage data and caches it for the content script.

const ALARM_NAME = 'fetchUsage';
const CACHE_KEY  = 'usageData';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => { scheduleAlarm(); doFetch(); });
chrome.runtime.onStartup.addListener(  () => { scheduleAlarm(); doFetch(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM_NAME) doFetch(); });

function scheduleAlarm() {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

// ── Trigger re-fetch after each assistant reply ───────────────────────────────

chrome.webRequest.onCompleted.addListener(
  () => { setTimeout(doFetch, 1500); },
  { urls: ['*://claude.ai/api/organizations/*/chat_conversations/*/completion*'] }
);

// ── Org ID from cookie ────────────────────────────────────────────────────────

function getOrgId(callback) {
  chrome.cookies.get({ url: 'https://claude.ai', name: 'lastActiveOrg' }, (cookie) => {
    callback(cookie ? cookie.value : null);
  });
}

// ── Core fetch ────────────────────────────────────────────────────────────────

function doFetch() {
  getOrgId((orgId) => {
    if (!orgId) { saveData({ error: 'no_org', ts: Date.now() }); return; }

    fetch(`https://claude.ai/api/organizations/${orgId}/usage`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) { saveData({ error: `http_${r.status}`, ts: Date.now() }); return; }
        return r.json();
      })
      .then((raw) => {
        if (!raw) return;
        const parsed = parseUsage(raw);
        parsed.ts = Date.now();
        saveData(parsed);
        notifyContentScripts(parsed);
      })
      .catch((e) => { saveData({ error: e.message, ts: Date.now() }); });
  });
}

// ── Parse API response ────────────────────────────────────────────────────────
// Real response shape (confirmed from lugia19/Claude-Usage-Extension):
//   { five_hour: { utilization: 0.42, resets_at: "ISO-string" },
//     seven_day:  { utilization: 0.15, resets_at: "ISO-string" } }
// utilization is 0-1 fraction USED; remainPct = (1 - utilization) * 100.

function parseUsage(raw) {
  function parseEntry(obj) {
    if (!obj) return null;
    // utilization is already 0-100 (percent used), not 0-1 fraction
    return {
      remainPct: Math.round(100 - (obj.utilization || 0)),
      resetMs:   obj.resets_at ? new Date(obj.resets_at).getTime() : 0,
    };
  }

  const session = parseEntry(raw.five_hour);
  const weekly  = parseEntry(raw.seven_day);

  if (!session && !weekly) {
    return { error: 'unknown_shape', raw: JSON.stringify(raw).slice(0, 300) };
  }

  const primary = session || weekly;
  return {
    remainPct: primary.remainPct,
    resetMs:   primary.resetMs,
    session:   session,
    weekly:    weekly,
  };
}

// ── Storage ───────────────────────────────────────────────────────────────────

function saveData(data) {
  chrome.storage.local.set({ [CACHE_KEY]: data });
}

// ── Notify content scripts (callback-based — no Promise, no crash) ────────────

function notifyContentScripts(data) {
  chrome.tabs.query({ url: '*://claude.ai/*' }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'USAGE_UPDATE', data }, () => {
        void chrome.runtime.lastError; // suppress "no receiver" error
      });
    }
  });
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_USAGE') {
    chrome.storage.local.get(CACHE_KEY, (res) => {
      sendResponse(res[CACHE_KEY] || { error: 'no_data' });
    });
    return true; // keep channel open for async response
  }
  if (msg.type === 'FORCE_FETCH') {
    doFetch();
    sendResponse({ ok: true });
  }
});
