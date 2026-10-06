// background.js — MV3 service worker
// Fetches usage data for each provider (Claude, ChatGPT), normalises it with
// the parsers in shared.js, caches it in chrome.storage.local and pushes it to
// open tabs. State never lives in memory only: the worker may be suspended.

importScripts('shared.js');

const ALARM_NAME   = 'fetchUsage';
const PERIOD_MIN   = 1;
const USAGE_KEY    = CUM.USAGE_KEY;          // { claude: 'usageData', chatgpt: 'usageData_chatgpt' }
const CLAUDE_HOST  = 'https://claude.ai';
const CHATGPT_HOST = 'https://chatgpt.com';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => { scheduleAlarm(); fetchAll(); });
chrome.runtime.onStartup.addListener(  () => { scheduleAlarm(); fetchAll(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM_NAME) fetchAll(); });

function scheduleAlarm() {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: PERIOD_MIN });
}

function fetchAll() { fetchClaude(); fetchChatgpt(); }

// ── Re-fetch shortly after an assistant reply completes ──────────────────────
// Observation-only webRequest listener (allowed in MV3).

const debounced = {};
function refetchSoon(provider, delay) {
  clearTimeout(debounced[provider]);
  debounced[provider] = setTimeout(() => (provider === 'claude' ? fetchClaude() : fetchChatgpt()), delay);
}

chrome.webRequest.onCompleted.addListener(
  () => refetchSoon('claude', 1500),
  { urls: [
      '*://claude.ai/api/organizations/*/chat_conversations/*/completion*',
      '*://claude.ai/api/organizations/*/chat_conversations/*/retry_completion*',
    ] }
);
chrome.webRequest.onCompleted.addListener(
  (d) => { if (d.method === 'POST') refetchSoon('chatgpt', 2500); },
  { urls: [
      '*://chatgpt.com/backend-api/conversation',
      '*://chatgpt.com/backend-api/f/conversation',
      '*://chatgpt.com/backend-api/conversation/*',
      '*://chatgpt.com/backend-api/f/conversation/*',
    ] }
);

// ═════════════════════════════════════════════════════════════════════════════
//  CLAUDE
// ═════════════════════════════════════════════════════════════════════════════

function getCookie(url, name) {
  return new Promise((resolve) => {
    try { chrome.cookies.get({ url, name }, (c) => resolve(c ? c.value : null)); }
    catch (e) { resolve(null); }
  });
}

async function getClaudeOrgId() {
  const fromCookie = await getCookie(CLAUDE_HOST, 'lastActiveOrg');
  if (fromCookie) return fromCookie;
  // Fallback: ask the API which organisations the session belongs to.
  try {
    const r = await fetch(`${CLAUDE_HOST}/api/organizations`, { credentials: 'include' });
    if (!r.ok) return null;
    const orgs = await r.json();
    if (Array.isArray(orgs) && orgs.length) {
      const pick = orgs.find(o => Array.isArray(o.capabilities) && o.capabilities.includes('chat')) || orgs[0];
      return pick.uuid || pick.id || null;
    }
  } catch (e) {}
  return null;
}

// One request per provider at a time: alarm, webRequest trigger and popup
// FORCE_FETCH can fire together, and the quota endpoint needs no duplicates.
const inFlight = { claude: false, chatgpt: false };

async function fetchClaude() {
  if (inFlight.claude) return;
  inFlight.claude = true;
  try {
    const orgId = await getClaudeOrgId();
    if (!orgId) { await saveData('claude', { error: 'no_org' }); return; }
    const r = await fetch(`${CLAUDE_HOST}/api/organizations/${orgId}/usage`, {
      credentials: 'include', headers: { 'Accept': 'application/json' },
    });
    if (!r.ok) { await saveData('claude', { error: `http_${r.status}` }); return; }
    const parsed = CUM.parseClaudeUsage(await r.json());
    await saveData('claude', parsed);
  } catch (e) {
    await saveData('claude', { error: String(e && e.message || e) });
  } finally {
    inFlight.claude = false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHATGPT
// ═════════════════════════════════════════════════════════════════════════════
// chatgpt.com exposes the same kind of windows (primary ≈ 5 h, secondary ≈ 7 d)
// through GET /backend-api/wham/usage, authorised with the web session's
// access token (GET /api/auth/session). The request is preferably made from a
// content script inside an open chatgpt.com tab (same cookies / headers as the
// page itself); when no tab is open we try from the worker directly.

async function fetchChatgpt() {
  if (inFlight.chatgpt) return;
  inFlight.chatgpt = true;
  try {
    const tabs = await queryTabs(['*://chatgpt.com/*', '*://*.chatgpt.com/*']);
    for (const tab of tabs) {
      const resp = await sendToTab(tab.id, { type: 'CHATGPT_FETCH' });
      if (resp && resp.raw) { await saveData('chatgpt', CUM.parseChatgptUsage(resp.raw)); return; }
      if (resp && resp.error === 'not_logged_in') { await saveData('chatgpt', { error: 'not_logged_in' }); return; }
    }
    // No tab (or tab could not answer) → direct attempt from the worker.
    const s = await fetch(`${CHATGPT_HOST}/api/auth/session`, { credentials: 'include' });
    if (!s.ok) { await saveData('chatgpt', { error: `http_${s.status}` }); return; }
    const session = await s.json().catch(() => null);
    const token = session && session.accessToken;
    if (!token) { await saveData('chatgpt', { error: 'not_logged_in' }); return; }
    const r = await fetch(`${CHATGPT_HOST}/backend-api/wham/usage`, {
      credentials: 'include',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!r.ok) { await saveData('chatgpt', { error: `http_${r.status}` }); return; }
    await saveData('chatgpt', CUM.parseChatgptUsage(await r.json()));
  } catch (e) {
    await saveData('chatgpt', { error: String(e && e.message || e) });
  } finally {
    inFlight.chatgpt = false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function queryTabs(url) {
  return new Promise((resolve) => {
    try { chrome.tabs.query({ url }, (tabs) => resolve(tabs || [])); } catch (e) { resolve([]); }
  });
}
function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, (resp) => { void chrome.runtime.lastError; resolve(resp || null); });
    } catch (e) { resolve(null); }
  });
}

// ── Storage + broadcast ──────────────────────────────────────────────────────
// A failed fetch must not wipe the last good snapshot: keep it, mark it stale.

function saveData(provider, data) {
  const key = USAGE_KEY[provider];
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (res) => {
      const prev = res[key];
      let next;
      if (data.error && CUM.isUsable(prev)) {
        next = Object.assign({}, prev, { stale: true, lastError: data.error, errorTs: Date.now() });
      } else {
        next = Object.assign({ provider }, data, { ts: Date.now(), stale: false });
        delete next.lastError; delete next.errorTs;
      }
      chrome.storage.local.set({ [key]: next }, () => { notifyTabs(provider, next); resolve(); });
    });
  });
}

function notifyTabs(provider, data) {
  const urls = provider === 'claude' ? ['*://claude.ai/*'] : ['*://chatgpt.com/*', '*://*.chatgpt.com/*'];
  chrome.tabs.query({ url: urls }, (tabs) => {
    for (const tab of tabs || []) {
      chrome.tabs.sendMessage(tab.id, { type: 'USAGE_UPDATE', provider, data }, () => {
        void chrome.runtime.lastError; // no receiver on this tab — fine
      });
    }
  });
}

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'GET_USAGE') {
    const provider = USAGE_KEY[msg.provider] ? msg.provider : 'claude';
    chrome.storage.local.get(USAGE_KEY[provider], (res) => {
      sendResponse(res[USAGE_KEY[provider]] || { error: 'no_data', provider });
    });
    return true;
  }
  if (msg.type === 'FORCE_FETCH') {
    if (msg.provider === 'chatgpt') fetchChatgpt(); else if (msg.provider === 'claude') fetchClaude(); else fetchAll();
    sendResponse({ ok: true });
  }
  if (msg.type === 'CHATGPT_REPORT' && msg.raw) {
    // A chatgpt.com tab fetched usage on its own (page load / focus) — store it.
    saveData('chatgpt', CUM.parseChatgptUsage(msg.raw)).then(() => sendResponse({ ok: true }));
    return true;
  }
});
