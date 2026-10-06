// Unit tests for the pure helpers in shared.js  —  run with:  npm test
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// Load shared.js + i18n.js into a bare sandbox (no window / document), the
// same way the service worker sees them.
const sandbox = { self: null, console };
sandbox.self = sandbox;
vm.createContext(sandbox);
for (const f of ['shared.js', 'i18n.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
}
const C = sandbox.CUM;
const I18N = sandbox.CUM_I18N;

// ── provider detection ──────────────────────────────────────────────────────
test('detectProvider maps hosts', () => {
  assert.equal(C.detectProvider('claude.ai'), 'claude');
  assert.equal(C.detectProvider('www.claude.ai'), 'claude');
  assert.equal(C.detectProvider('chatgpt.com'), 'chatgpt');
  assert.equal(C.detectProvider('chat.openai.com'), 'chatgpt');
  assert.equal(C.detectProvider('example.com'), null);
  assert.equal(C.detectProvider(undefined), null);
});

// ── tiers / colours ─────────────────────────────────────────────────────────
test('tierOf uses the gradient mid point and an empty band', () => {
  assert.equal(C.tierOf(100, 0.4), 'hi');
  assert.equal(C.tierOf(61, 0.4), 'hi');
  assert.equal(C.tierOf(60, 0.4), 'mid');
  assert.equal(C.tierOf(31, 0.4), 'mid');
  assert.equal(C.tierOf(30, 0.4), 'lo');
  assert.equal(C.tierOf(9, 0.4), 'lo');
  assert.equal(C.tierOf(8, 0.4), 'empty');
  assert.equal(C.tierOf(0, 0.4), 'empty');
  assert.equal(C.tierOf(50, undefined), 'mid'); // default midPos
});
test('usageColor picks the matching colour slot', () => {
  const F = { colorHi: '#111111', colorMid: '#222222', colorLo: '#333333', colorMidPos: 0.4 };
  assert.equal(C.usageColor(F, 90), '#111111');
  assert.equal(C.usageColor(F, 50), '#222222');
  assert.equal(C.usageColor(F, 10), '#333333');
  assert.equal(C.usageColor(F, 0), '#333333');
});

// ── formatting ──────────────────────────────────────────────────────────────
test('fmtCountdown', () => {
  assert.equal(C.fmtCountdown(0), '00:00:00');
  assert.equal(C.fmtCountdown(-5), '00:00:00');
  assert.equal(C.fmtCountdown(3723000), '01:02:03');
  assert.equal(C.fmtCountdown(5 * 3600000), '05:00:00');
});
test('fmtClock never throws for any supported language', () => {
  for (const l of Object.keys(I18N)) {
    const s = C.fmtClock(Date.UTC(2026, 0, 1, 12, 34, 56), l, true);
    assert.ok(/\d/.test(s), `clock for ${l}: ${s}`);
  }
});
test('estimateTokens counts CJK text heavier than ASCII', () => {
  assert.equal(C.estimateTokens(''), 0);
  const ascii = C.estimateTokens('hello world this is a test');
  const cjk   = C.estimateTokens('これはテストです。日本語の文章を入力しています');
  const zh    = C.estimateTokens('这是一个测试，用来估算中文的 token 数量');
  assert.ok(ascii > 0 && cjk > 0 && zh > 0);
  // 26 ASCII chars ≈ 8 tokens; 23 JP chars must not be estimated as ~7
  assert.ok(cjk >= 23, `cjk estimate too low: ${cjk}`);
});

// ── locale / fonts ──────────────────────────────────────────────────────────
test('guessLang falls back to en and understands region tags', () => {
  assert.equal(C.guessLang(['ja-JP', 'en-US']), 'ja');
  assert.equal(C.guessLang(['zh-TW']), 'zh');
  assert.equal(C.guessLang(['pt-BR']), 'en');
  assert.equal(C.guessLang(undefined), 'en');
  assert.equal(C.guessLang('ko'), 'ko');
});
test('dirOf / localeOf', () => {
  assert.equal(C.dirOf('ar'), 'rtl');
  assert.equal(C.dirOf('ja'), 'ltr');
  assert.equal(C.localeOf('ja'), 'ja-JP');
  assert.equal(C.localeOf('xx'), 'en-US');
});
test('fontStack puts the UI language\'s CJK family first', () => {
  const ja = C.fontStack('ja'), zh = C.fontStack('zh'), ko = C.fontStack('ko');
  assert.ok(ja.indexOf('Yu Gothic UI') < ja.indexOf('Microsoft YaHei UI'));
  assert.ok(zh.indexOf('Microsoft YaHei UI') < zh.indexOf('Yu Gothic UI'));
  assert.ok(ko.indexOf('Malgun Gothic') < ko.indexOf('Yu Gothic UI'));
  assert.ok(/sans-serif$/.test(ja));
});

// ── i18n completeness ───────────────────────────────────────────────────────
test('every language has every key of the English dictionary', () => {
  const keys = Object.keys(I18N.en);
  for (const [l, dict] of Object.entries(I18N)) {
    for (const k of keys) assert.ok(typeof dict[k] === 'string' && dict[k].length, `${l}.${k} missing`);
  }
  for (const l of sandbox.CUM_LANGS) assert.ok(I18N[l.code], `CUM_LANGS lists unknown language ${l.code}`);
});
test('makeT falls back lang → en → key', () => {
  let lang = 'ja';
  const t = C.makeT(() => lang);
  assert.equal(t('remaining'), '残り');
  lang = 'xx';
  assert.equal(t('remaining'), 'left');
  assert.equal(t('nope'), 'nope');
});

// ── Claude payload ──────────────────────────────────────────────────────────
test('parseClaudeUsage: legacy five_hour / seven_day (0-100 percent used)', () => {
  const r = C.parseClaudeUsage({
    five_hour: { utilization: 42, resets_at: '2026-10-07T10:00:00+00:00' },
    seven_day: { utilization: 15.4, resets_at: '2026-10-12T10:00:00Z' },
    seven_day_opus: null,
    limits: [{ kind: 'five_hour', percent: 42 }],
  });
  assert.equal(r.error, undefined);
  assert.equal(r.provider, 'claude');
  assert.equal(r.remainPct, 58);
  assert.equal(r.session.remainPct, 58);
  assert.equal(r.session.resetMs, Date.parse('2026-10-07T10:00:00Z'));
  assert.equal(r.weekly.remainPct, 85);
  assert.equal(r.resetMs, r.session.resetMs);
});
test('parseClaudeUsage: utilization 0 is a legitimate value (100% left)', () => {
  const r = C.parseClaudeUsage({ five_hour: { utilization: 0, resets_at: null } });
  assert.equal(r.remainPct, 100);
  assert.equal(r.session.resetMs, 0);
  assert.equal(r.weekly, null);
});
test('parseClaudeUsage: newer limits[] shape', () => {
  const r = C.parseClaudeUsage({ limits: [
    { kind: 'seven_day_opus', percent: 70, resets_at: '2026-10-12T00:00:00Z', scope: 'model' },
    { kind: 'five_hour',     percent: 25, resets_at: '2026-10-07T05:00:00Z', scope: 'all' },
    { kind: 'seven_day',     percent: 10, resets_at: '2026-10-12T00:00:00Z', scope: 'all' },
  ] });
  assert.equal(r.remainPct, 75);
  assert.equal(r.weekly.remainPct, 90);
});
test('parseClaudeUsage: clamps and rejects garbage', () => {
  assert.equal(C.parseClaudeUsage({ five_hour: { utilization: 130 } }).remainPct, 0);
  assert.equal(C.parseClaudeUsage({ hello: 1 }).error, 'unknown_shape');
  assert.equal(C.parseClaudeUsage(null).error, 'unknown_shape');
  assert.equal(C.parseClaudeUsage('x').error, 'unknown_shape');
});

// ── ChatGPT payload ─────────────────────────────────────────────────────────
test('parseChatgptUsage: wham/usage windows (reset_at in seconds)', () => {
  const r = C.parseChatgptUsage({
    plan_type: 'plus',
    rate_limit: {
      allowed: true, limit_reached: false,
      primary_window:   { used_percent: 37, limit_window_seconds: 18000,  reset_after_seconds: 1200,   reset_at: 1791000000 },
      secondary_window: { used_percent: 12, limit_window_seconds: 604800, reset_after_seconds: 400000, reset_at: 1791400000 },
    },
  });
  assert.equal(r.error, undefined);
  assert.equal(r.provider, 'chatgpt');
  assert.equal(r.remainPct, 63);
  assert.equal(r.session.resetMs, 1791000000 * 1000);
  assert.equal(r.session.windowSec, 18000);
  assert.equal(r.weekly.remainPct, 88);
  assert.equal(r.weekly.windowSec, 604800);
  assert.equal(r.plan, 'plus');
});
test('parseChatgptUsage: camelCase variant and reset_after fallback', () => {
  const before = Date.now();
  const r = C.parseChatgptUsage({ rateLimit: { primaryWindow: { usedPercent: 50, resetAfterSeconds: 60 } } });
  assert.equal(r.remainPct, 50);
  assert.ok(r.session.resetMs >= before + 60000 - 5 && r.session.resetMs <= Date.now() + 60000 + 5);
  assert.equal(r.weekly, null);
});
test('parseChatgptUsage: rejects unknown shapes', () => {
  assert.equal(C.parseChatgptUsage({ detail: 'Unauthorized' }).error, 'unknown_shape');
  assert.equal(C.parseChatgptUsage(null).error, 'unknown_shape');
});

// ── misc ────────────────────────────────────────────────────────────────────
test('isUsable', () => {
  assert.equal(C.isUsable({ remainPct: 10 }), true);
  assert.equal(C.isUsable({ error: 'x', remainPct: 10 }), false);
  assert.equal(C.isUsable({ remainPct: '10' }), false);
  assert.equal(C.isUsable(null), false);
});
test('escapeHtml', () => {
  assert.equal(C.escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});
test('USAGE_KEY keeps the legacy Claude storage key', () => {
  assert.equal(C.USAGE_KEY.claude, 'usageData');
  assert.notEqual(C.USAGE_KEY.chatgpt, 'usageData');
});
