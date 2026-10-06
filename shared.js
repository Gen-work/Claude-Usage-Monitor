// shared.js — Claude Usage Monitor: shared constants + pure helpers
//
// Loaded by content scripts, popup and (via importScripts) the service worker.
// Must NOT touch `window` / `document` at load time — it has to run inside a
// service worker and inside Node for the unit tests.

(function (root) {
  'use strict';

  // ── Petal geometry for the 12-petal Claude mark ──────────────────────────
  const PETALS = [
    { d:'M96.0000 40.0000 L99.5002 42.0000 L99.5002 43.5000 L98.5000 47.0000 L56.0000 57.0000 L52.0040 47.0708 L96.0000 40.0000',           sy:1.21842, r:330 },
    { d:'M80.1032 10.5903 L84.9968 11.6171 L86.2958 13.2179 L87.5346 17.0540 L87.0213 19.5007 L58.5000 58.5000 L49.0000 49.0000 L75.3008 14.4873 L80.1032 10.5903', sy:1.12175, r:300 },
    { d:'M55.5002 4.5000 L58.5005 2.5000 L61.0002 3.5000 L63.5002 7.0000 L56.6511 48.1620 L52.0005 45.0000 L50.0005 39.5000 L53.5003 8.5000 L55.5002 4.5000',         sy:1.10008, r:270 },
    { d:'M23.4253 5.1588 L26.5075 1.2217 L28.5175 0.7632 L32.5063 1.3458 L34.4748 2.8868 L48.8202 34.6902 L54.0089 49.8008 L47.9378 53.1760 L24.8009 11.1886 L23.4253 5.1588', sy:1.06,    r:240 },
    { d:'M8.4990 27.0019 L7.4999 23.0001 L10.5003 19.5001 L14.0003 20.0001 L15.0003 20.0001 L36.0000 35.5000 L42.5000 40.5000 L51.5000 47.5000 L46.5000 56.0000 L42.0002 52.5000 L39.0001 49.5000 L10.0000 29.0001 L8.4990 27.0019', sy:0.985,  r:210 },
    { d:'M2.5003 53.0000 L0.2370 50.5000 L0.2373 48.2759 L2.5003 47.5000 L28.0000 49.0000 L53.0000 51.0000 L52.1885 55.9782 L4.5000 53.5000 L2.5003 53.0000',       sy:0.997,  r:180 },
    { d:'M17.5002 79.0264 L12.5005 79.0264 L10.5124 76.7369 L10.5124 74.0000 L19.0005 68.0000 L53.5082 46.0337 L57.0005 52.0000 L17.5002 79.0264',                    sy:1.03,   r:150 },
    { d:'M27.0004 92.9999 L25.0003 93.4999 L22.0003 91.9999 L22.5004 89.4999 L52.0003 50.5000 L56.0004 55.9999 L34.0003 85.0000 L27.0004 92.9999',                    sy:0.925,  r:120 },
    { d:'M51.9998 98.0000 L50.5002 100.0000 L47.5002 101.0000 L45.0001 99.0000 L43.5000 96.0000 L51.0003 55.4999 L55.5001 55.9999 L51.9998 98.0000',                  sy:0.97,   r:90  },
    { d:'M77.5007 86.9997 L77.5007 90.9997 L77.0006 92.4997 L75.0004 93.4997 L71.5006 93.0339 L47.4669 57.2642 L56.9998 50.0002 L64.9994 64.5004 L65.7507 69.7497 L77.5007 86.9997', sy:1.01158,r:60  },
    { d:'M89.0008 80.9991 L89.5008 83.4991 L88.0008 85.4991 L86.5007 84.9991 L78.0007 78.9991 L65.0007 67.4991 L55.0007 60.4991 L58.0000 51.0000 L62.9999 54.0001 L66.0007 59.4991 L89.0008 80.9991', sy:1.13825,r:30  },
    { d:'M82.5003 55.5000 L95.0003 56.5000 L98.0003 58.5000 L100.0000 61.5000 L100.0000 63.6587 L94.5003 66.0000 L66.5005 59.0000 L55.0003 58.5000 L58.0000 48.0000 L66.0005 54.0000 L82.5003 55.5000', sy:1.12992,r:0   },
  ];
  // Clockwise fill order of the petals (index into PETALS)
  const CW = [2, 1, 0, 11, 10, 9, 8, 7, 6, 5, 4, 3];
  const EMPTY_PETAL = '#c5c1bb';

  const DEFAULT_COLORS = { hi: '#d97757', mid: '#c96442', lo: '#e05252', midPos: 0.4 };

  // ── Providers ────────────────────────────────────────────────────────────
  const PROVIDERS = ['claude', 'chatgpt'];
  const PROVIDER_LABEL = { claude: 'Claude', chatgpt: 'ChatGPT' };
  // storage key that holds the normalised usage snapshot for each provider.
  // 'claude' keeps the legacy key so existing installs upgrade in place.
  const USAGE_KEY = { claude: 'usageData', chatgpt: 'usageData_chatgpt' };

  function detectProvider(hostname) {
    const h = String(hostname || '').toLowerCase();
    if (h === 'claude.ai' || h.endsWith('.claude.ai')) return 'claude';
    if (h === 'chatgpt.com' || h.endsWith('.chatgpt.com') || h === 'chat.openai.com') return 'chatgpt';
    return null;
  }

  // ── Locale / text direction ──────────────────────────────────────────────
  const LOCALE = { zh: 'zh-CN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', fr: 'fr-FR', ru: 'ru-RU', es: 'es-ES', ar: 'ar' };
  const RTL = { ar: true };
  function localeOf(lang) { return LOCALE[lang] || 'en-US'; }
  function dirOf(lang)    { return RTL[lang] ? 'rtl' : 'ltr'; }

  // Pick a UI language from the browser when the user has not chosen one.
  function guessLang(navLangs) {
    const list = Array.isArray(navLangs) ? navLangs : [navLangs];
    for (const l of list) {
      const code = String(l || '').toLowerCase().split(/[-_]/)[0];
      if (LOCALE[code]) return code;
    }
    return 'en';
  }

  // Font stack with explicit CJK fallbacks. The order of the CJK families
  // follows the UI language so that shared Han glyphs render with the right
  // regional shapes (e.g. Japanese Windows / Edge on a CP932 system would
  // otherwise fall back to MS Gothic for every CJK label).
  const LATIN = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const CJK = {
    ja: '"Yu Gothic UI", "Meiryo UI", Meiryo, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "Noto Sans JP"',
    zh: '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Noto Sans SC"',
    ko: '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR"',
  };
  function fontStack(lang) {
    const order = lang === 'ja' ? ['ja', 'zh', 'ko'] : lang === 'ko' ? ['ko', 'ja', 'zh'] : ['zh', 'ja', 'ko'];
    return LATIN + ', ' + order.map(k => CJK[k]).join(', ') + ', "Segoe UI Symbol", sans-serif';
  }

  // Apply lang + dir to an element (helps font selection and RTL layout).
  function applyLang(el, lang) {
    if (!el) return;
    try {
      el.setAttribute('lang', localeOf(lang));
      el.setAttribute('dir', dirOf(lang));
      el.style.fontFamily = fontStack(lang);
    } catch (e) {}
  }

  // ── i18n ─────────────────────────────────────────────────────────────────
  // makeT(() => lang) returns t(key) with fallback chain lang → en → zh → key
  function makeT(getLang) {
    return function t(k) {
      const dict = root.CUM_I18N || {};
      const lang = getLang();
      return (dict[lang] || {})[k] || (dict.en || {})[k] || (dict.zh || {})[k] || k;
    };
  }

  // ── Inline SVG icons (replace emoji / dingbats that lack glyphs on some
  //    systems, e.g. 🪫 on Windows 10 or ✓/▶ on Shift_JIS pages) ───────────
  const ICONS = {
    check:   '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
    batFull: '<svg viewBox="0 0 24 14" width="18" height="11" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1" y="1.5" width="19" height="11" rx="2.5"/><rect x="21" y="5" width="2.2" height="4" rx="1" fill="currentColor" stroke="none"/><rect x="3.2" y="3.7" width="14.6" height="6.6" rx="1.2" fill="currentColor" stroke="none"/></svg>',
    batLow:  '<svg viewBox="0 0 24 14" width="18" height="11" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1" y="1.5" width="19" height="11" rx="2.5"/><rect x="21" y="5" width="2.2" height="4" rx="1" fill="currentColor" stroke="none"/><rect x="3.2" y="3.7" width="3.6" height="6.6" rx="1.2" fill="currentColor" stroke="none"/></svg>',
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  // ── Usage tiers / colours ────────────────────────────────────────────────
  // One place that decides which colour band a remaining-% falls into, so the
  // halo, the send ring, the petals and the popup all agree.
  function tierOf(remainPct, midPos) {
    const mp = typeof midPos === 'number' ? midPos : DEFAULT_COLORS.midPos;
    const hi = Math.round((1 - mp) * 100);
    const lo = Math.round(hi * 0.5);
    if (remainPct > hi) return 'hi';
    if (remainPct > lo) return 'mid';
    if (remainPct > 8)  return 'lo';
    return 'empty';
  }
  function usageColor(colors, remainPct) {
    const tier = tierOf(remainPct, colors.colorMidPos);
    return tier === 'hi' ? colors.colorHi : tier === 'mid' ? colors.colorMid : colors.colorLo;
  }

  // ── Formatting ───────────────────────────────────────────────────────────
  const pad = n => String(n).padStart(2, '0');
  function fmtCountdown(ms) {
    ms = Math.max(0, ms || 0);
    return pad(Math.floor(ms / 3600000)) + ':' + pad(Math.floor(ms % 3600000 / 60000)) + ':' + pad(Math.floor(ms % 60000 / 1000));
  }
  function fmtClock(ms, lang, withSeconds) {
    const d = new Date(ms);
    try {
      return new Intl.DateTimeFormat(localeOf(lang), {
        hour: '2-digit', minute: '2-digit', second: withSeconds ? '2-digit' : undefined, hour12: false,
      }).format(d);
    } catch (e) {
      return pad(d.getHours()) + ':' + pad(d.getMinutes()) + (withSeconds ? ':' + pad(d.getSeconds()) : '');
    }
  }
  const fmtN = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

  // Rough token estimate that does not undercount CJK text (≈1.3 tok / char)
  const CJK_RE = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯가-힯]/g;
  function estimateTokens(text) {
    if (!text) return 0;
    const cjk = (text.match(CJK_RE) || []).length;
    const rest = text.length - cjk;
    return Math.ceil(cjk * 1.3 + rest / 3.5);
  }

  // ── Normalisation of provider API payloads ───────────────────────────────
  const clampPct = v => Math.max(0, Math.min(100, Math.round(v)));

  function parseIso(s) {
    if (!s) return 0;
    const t = typeof s === 'number' ? (s > 1e12 ? s : s * 1000) : new Date(s).getTime();
    return isFinite(t) ? t : 0;
  }

  // claude.ai  GET /api/organizations/{org}/usage
  //   legacy: { five_hour:{utilization,resets_at}, seven_day:{…}, seven_day_opus, seven_day_sonnet, extra_usage }
  //   newer : { limits:[{kind, percent, resets_at, scope}], spend:{…} }
  //   utilization / percent are 0–100 (percent USED)
  function parseClaudeUsage(raw) {
    if (!raw || typeof raw !== 'object') return { error: 'unknown_shape' };
    const entry = (used, resetsAt) => (typeof used === 'number')
      ? { remainPct: clampPct(100 - used), resetMs: parseIso(resetsAt) } : null;

    let session = null, weekly = null;
    if (raw.five_hour || raw.seven_day) {
      session = raw.five_hour ? entry(raw.five_hour.utilization || 0, raw.five_hour.resets_at) : null;
      weekly  = raw.seven_day ? entry(raw.seven_day.utilization  || 0, raw.seven_day.resets_at)  : null;
    } else if (Array.isArray(raw.limits)) {
      for (const l of raw.limits) {
        if (!l) continue;
        const kind  = String(l.kind || l.name || '').toLowerCase();
        const scope = String(l.scope || '').toLowerCase();
        const modelScoped = /opus|sonnet|haiku|fable|model/.test(kind) || /model/.test(scope);
        const used = typeof l.percent === 'number' ? l.percent : typeof l.utilization === 'number' ? l.utilization : null;
        if (used === null) continue;
        if (!session && /five_hour|5h|session/.test(kind)) session = entry(used, l.resets_at);
        else if (!weekly && !modelScoped && /seven_day|7d|week/.test(kind)) weekly = entry(used, l.resets_at);
      }
    }
    if (!session && !weekly) return { error: 'unknown_shape', raw: safeSlice(raw) };
    const primary = session || weekly;
    return { provider: 'claude', remainPct: primary.remainPct, resetMs: primary.resetMs, session, weekly };
  }

  // chatgpt.com  GET /backend-api/wham/usage   (Bearer <session accessToken>)
  //   { rate_limit: { primary_window:{used_percent, limit_window_seconds, reset_after_seconds, reset_at},
  //                   secondary_window:{…} }, additional_rate_limits:[…], plan_type }
  //   reset_at is epoch SECONDS. Some builds use camelCase keys.
  function parseChatgptUsage(raw) {
    if (!raw || typeof raw !== 'object') return { error: 'unknown_shape' };
    const rl = raw.rate_limit || raw.rateLimit || raw;
    const win = (w) => {
      if (!w || typeof w !== 'object') return null;
      const used = w.used_percent ?? w.usedPercent;
      if (typeof used !== 'number') return null;
      let resetMs = parseIso(w.reset_at ?? w.resetAt);
      const after = w.reset_after_seconds ?? w.resetAfterSeconds;
      if (!resetMs && typeof after === 'number') resetMs = Date.now() + after * 1000;
      return { remainPct: clampPct(100 - used), resetMs, windowSec: w.limit_window_seconds ?? w.limitWindowSeconds ?? 0 };
    };
    const session = win(rl.primary_window || rl.primaryWindow);
    const weekly  = win(rl.secondary_window || rl.secondaryWindow);
    if (!session && !weekly) return { error: 'unknown_shape', raw: safeSlice(raw) };
    const primary = session || weekly;
    return { provider: 'chatgpt', remainPct: primary.remainPct, resetMs: primary.resetMs, session, weekly,
             plan: raw.plan_type || raw.planType || null };
  }

  function safeSlice(obj) { try { return JSON.stringify(obj).slice(0, 300); } catch (e) { return ''; } }

  function isUsable(data) {
    return !!(data && !data.error && typeof data.remainPct === 'number');
  }

  // ── Extension context helpers (content scripts) ──────────────────────────
  function isCtxValid() {
    try { return !!(root.chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }
  function safeSet(obj) {
    if (!isCtxValid()) return;
    try { chrome.storage.local.set(obj); } catch (e) {}
  }

  // ── Petal SVG (document required) ───────────────────────────────────────
  function buildPetalSvg(doc, color) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 101'); svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const paths = PETALS.map((p) => {
      const el = doc.createElementNS(NS, 'path');
      el.setAttribute('d', p.d); el.style.fill = color;
      el.style.transformOrigin = '50px 50px';
      el.style.transform = 'rotate(' + p.r + 'deg) scaleY(' + p.sy + ') rotate(-' + p.r + 'deg)';
      svg.appendChild(el); return el;
    });
    return { svg, paths };
  }
  function paintPetals(paths, remainPct, color) {
    const n = Math.round(remainPct / 100 * 12);
    CW.forEach((idx, pos) => { paths[idx].style.fill = pos < n ? color : EMPTY_PETAL; });
  }

  // Relative luminance of the first opaque ancestor background — used to pick
  // readable text colours over light / dark host themes.
  function isDarkBehind(el, win) {
    const w = win || root;
    try {
      let node = el;
      for (let i = 0; node && i < 12; i++) {
        const bg = w.getComputedStyle(node).backgroundColor;
        const m = bg && bg.match(/rgba?\(([^)]+)\)/);
        if (m) {
          const p = m[1].split(',').map(parseFloat);
          if (p.length < 4 || p[3] > 0.4) {
            const lum = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
            return lum < 128;
          }
        }
        node = node.parentElement;
      }
    } catch (e) {}
    return true;
  }

  root.CUM = {
    PETALS, CW, EMPTY_PETAL, DEFAULT_COLORS,
    PROVIDERS, PROVIDER_LABEL, USAGE_KEY, detectProvider,
    LOCALE, localeOf, dirOf, guessLang, fontStack, applyLang,
    makeT, ICONS, escapeHtml,
    tierOf, usageColor,
    pad, fmtCountdown, fmtClock, fmtN, estimateTokens,
    parseClaudeUsage, parseChatgptUsage, isUsable,
    isCtxValid, safeSet,
    buildPetalSvg, paintPetals, isDarkBehind,
  };
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
