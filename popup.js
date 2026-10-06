// popup.js — reads cached usage per provider, manages float + halo settings, i18n, zen mode

const C = self.CUM;
const $ = id => document.getElementById(id);

let lang = C.guessLang(navigator.languages || [navigator.language]);
const t = C.makeT(() => lang);

let provider = 'claude';
const D = C.DEFAULT_COLORS;
const Col = { hi: D.hi, mid: D.mid, lo: D.lo };
let colorMidPos = D.midPos;
let countdownTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  buildLogos();
  $('icon-bat-full').innerHTML = C.ICONS.batFull;
  $('icon-bat-low').innerHTML  = C.ICONS.batLow;

  chrome.storage.local.get(['cum_lang', 'cum_provider', 'cum_zen'], (res) => {
    if (res.cum_lang) lang = res.cum_lang;
    provider = C.USAGE_KEY[res.cum_provider] ? res.cum_provider : 'claude';
    applyLang();
    buildLangButtons();
    buildProviderSeg();
    loadUsage();
    loadSettings();
    if (res.cum_zen) applyZen(true);
  });

  // Live refresh while the popup is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (C.USAGE_KEY[provider] in changes) loadUsage();
  });
  // Ask the worker for fresh numbers right away
  try { chrome.runtime.sendMessage({ type: 'FORCE_FETCH' }, () => void chrome.runtime.lastError); } catch (e) {}

  // ── Float settings ──────────────────────────────────────────────────────
  $('tog-float').addEventListener('change', (e) => {
    chrome.storage.local.set({ cum_fenabled: e.target.checked });
    setFloatControlsEnabled(e.target.checked);
  });
  $('tog-wm').addEventListener('change', (e) => chrome.storage.local.set({ cum_fwatermark: e.target.checked }));
  $('tog-allpages').addEventListener('change', (e) => chrome.storage.local.set({ cum_allpages: e.target.checked }));
  $('opacity-slider').addEventListener('input', (e) => {
    $('opacity-label').textContent = e.target.value + '%';
    chrome.storage.local.set({ cum_fopacity: parseInt(e.target.value, 10) / 100 });
  });

  // ── Halo settings ──────────────────────────────────────────────────────
  $('halo-active-slider').addEventListener('input', (e) => {
    $('halo-active-label').textContent = e.target.value + '%';
    chrome.storage.local.set({ cum_halo_active: parseInt(e.target.value, 10) / 100 });
  });
  $('halo-idle-slider').addEventListener('input', (e) => {
    $('halo-idle-label').textContent = e.target.value + '%';
    chrome.storage.local.set({ cum_halo_idle: parseInt(e.target.value, 10) / 100 });
  });

  setupColorPicker();
  setupMidDrag();
  $('btn-reset-colors').addEventListener('click', resetColors);

  // ── Reset all ──────────────────────────────────────────────────────────
  $('btn-reset').addEventListener('click', () => {
    chrome.storage.local.remove([
      'cum_fenabled', 'cum_fopacity', 'cum_fwatermark', 'cum_fpos',
      'cum_halo_active', 'cum_halo_idle', 'cum_color_hi', 'cum_color_mid', 'cum_color_lo',
      'cum_fsize', 'cum_lang', 'cum_zen', 'cum_allpages', 'cum_color_mid_pos', 'cum_provider',
    ], () => location.reload());
  });

  // ── Zen mode ───────────────────────────────────────────────────────────
  $('zen-toggle').addEventListener('click', () => toggleZen(true));
  $('zen-toggle').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggleZen(true); });
  $('zen-view').addEventListener('click', () => toggleZen(false));
});

// ── Logos (built from shared petal geometry; no duplicated path data) ──────
function buildLogos() {
  for (const id of ['zen-toggle', 'zen-logo']) {
    const host = $(id);
    const { svg } = C.buildPetalSvg(document, 'currentColor');
    host.innerHTML = svg.innerHTML;
  }
}

// ── i18n / direction / fonts ───────────────────────────────────────────────

function applyLang() {
  const html = document.documentElement;
  html.setAttribute('lang', C.localeOf(lang));
  html.setAttribute('dir', C.dirOf(lang));
  document.body.style.fontFamily = C.fontStack(lang);
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    if (el.id === 'last-updated' && el.getAttribute('data-dynamic')) return;
    el.textContent = t(el.getAttribute('data-i18n'));
  });
}

function buildLangButtons() {
  const row = $('lang-row');
  row.innerHTML = '';
  (self.CUM_LANGS || []).forEach((l) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-btn' + (lang === l.code ? ' active' : '');
    btn.textContent = l.label;
    btn.setAttribute('lang', C.localeOf(l.code));
    btn.addEventListener('click', () => {
      lang = l.code;
      chrome.storage.local.set({ cum_lang: l.code });
      applyLang(); buildLangButtons(); buildProviderSeg(); loadUsage();
    });
    row.appendChild(btn);
  });
}

// ── Provider switch ────────────────────────────────────────────────────────

function buildProviderSeg() {
  const seg = $('provider-seg');
  seg.innerHTML = '';
  C.PROVIDERS.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab');
    b.className = provider === p ? 'active' : '';
    b.setAttribute('aria-selected', provider === p ? 'true' : 'false');
    b.textContent = C.PROVIDER_LABEL[p];
    b.addEventListener('click', () => {
      provider = p;
      chrome.storage.local.set({ cum_provider: p });
      buildProviderSeg(); loadUsage();
      try { chrome.runtime.sendMessage({ type: 'FORCE_FETCH', provider: p }, () => void chrome.runtime.lastError); } catch (e) {}
    });
    seg.appendChild(b);
  });
}

// ── Usage display ──────────────────────────────────────────────────────────

function loadUsage() {
  const key = C.USAGE_KEY[provider];
  chrome.storage.local.get(key, (res) => {
    const data = res[key];
    if (!C.isUsable(data)) { showError(data); return; }
    showUsage(data);
  });
}

function barGradient(pct) {
  const tier = C.tierOf(pct, colorMidPos);
  return tier === 'hi'  ? 'linear-gradient(90deg,#d97757,#e8a87c)'
       : tier === 'mid' ? 'linear-gradient(90deg,#c96442,#d97757)'
       :                  'linear-gradient(90deg,#e05252,#ff8a65)';
}

function resetText(entry) {
  const ms = entry ? (entry.resetMs || 0) : 0;
  const now = Date.now();
  if (ms > now) return C.fmtCountdown(ms - now);
  return ms > 0 ? t('newCycle') : '—';
}

function showUsage(data) {
  $('loading').style.display    = 'none';
  $('error-body').style.display = 'none';
  $('usage-body').style.display = 'block';

  const session = data.session || { remainPct: data.remainPct, resetMs: data.resetMs };
  const render = () => {
    $('pct-val').textContent = session.remainPct + '%';
    $('prog').style.width = session.remainPct + '%';
    $('prog').style.background = barGradient(session.remainPct);
    $('reset-val').textContent = resetText(session);

    if (data.weekly && typeof data.weekly.remainPct === 'number') {
      $('week-block').style.display = '';
      $('week-pct').textContent = data.weekly.remainPct + '%';
      $('week-prog').style.width = data.weekly.remainPct + '%';
      $('week-prog').style.background = barGradient(data.weekly.remainPct);
      $('week-reset').textContent = resetText(data.weekly);
    } else {
      $('week-block').style.display = 'none';
    }
  };
  render();
  clearInterval(countdownTimer);
  countdownTimer = setInterval(render, 1000);

  const note = $('stale-note');
  note.style.display = data.stale ? 'block' : 'none';
  note.textContent = data.stale ? '⚠ ' + t(provider === 'chatgpt' ? 'errorMsgChatgpt' : 'errorMsg') : '';

  const el = $('last-updated');
  el.setAttribute('data-dynamic', '1');
  el.textContent = data.ts ? `${C.PROVIDER_LABEL[provider]} · ${t('updatedAt')} ${C.fmtClock(data.ts, lang, false)}` : '';
}

function showError(data) {
  clearInterval(countdownTimer);
  $('loading').style.display    = 'none';
  $('usage-body').style.display = 'none';
  const err = $('error-body');
  err.style.display = 'block';
  err.textContent = t(provider === 'chatgpt' ? 'errorMsgChatgpt' : 'errorMsg');
  const el = $('last-updated');
  el.setAttribute('data-dynamic', '1');
  el.textContent = C.PROVIDER_LABEL[provider] + (data && data.error ? ' · ' + data.error : '');
}

// ── Settings ───────────────────────────────────────────────────────────────

function loadSettings() {
  chrome.storage.local.get(
    ['cum_fenabled','cum_fopacity','cum_fwatermark','cum_allpages',
     'cum_halo_active','cum_halo_idle','cum_color_hi','cum_color_mid','cum_color_lo','cum_color_mid_pos'],
    (res) => {
      const enabled = !!res.cum_fenabled;
      const opacity = typeof res.cum_fopacity === 'number' ? res.cum_fopacity : 1.0;
      $('tog-float').checked    = enabled;
      $('tog-wm').checked       = !!res.cum_fwatermark;
      $('tog-allpages').checked = !!res.cum_allpages;
      $('opacity-slider').value = Math.round(opacity * 100);
      $('opacity-label').textContent = Math.round(opacity * 100) + '%';

      const haloActive = typeof res.cum_halo_active === 'number' ? res.cum_halo_active : 1.0;
      const haloIdle   = typeof res.cum_halo_idle   === 'number' ? res.cum_halo_idle   : 0.5;
      $('halo-active-slider').value = Math.round(haloActive * 100);
      $('halo-active-label').textContent = Math.round(haloActive * 100) + '%';
      $('halo-idle-slider').value = Math.round(haloIdle * 100);
      $('halo-idle-label').textContent = Math.round(haloIdle * 100) + '%';

      Col.hi  = res.cum_color_hi  || D.hi;
      Col.mid = res.cum_color_mid || D.mid;
      Col.lo  = res.cum_color_lo  || D.lo;
      colorMidPos = typeof res.cum_color_mid_pos === 'number' ? res.cum_color_mid_pos : D.midPos;

      $('color-hi').value = Col.hi;
      $('color-lo').value = Col.lo;
      $('color-mid-picker').value = Col.mid;

      updateGradientBar(); checkColorsDirty(); setFloatControlsEnabled(enabled);
    }
  );
}

function setFloatControlsEnabled(on) {
  ['watermark-row', 'allpages-row', 'opacity-row'].forEach((id) => $(id).classList.toggle('disabled', !on));
}

function updateGradientBar() {
  const p = colorMidPos * 100;
  $('gradient-bar').style.background = `linear-gradient(to right, ${Col.hi}, ${Col.mid} ${p}%, ${Col.lo})`;
  $('gmid-handle').style.left = p + '%';
}

function checkColorsDirty() {
  const dirty = Col.hi !== D.hi || Col.mid !== D.mid || Col.lo !== D.lo || Math.abs(colorMidPos - D.midPos) > 0.01;
  $('btn-reset-colors').style.display = dirty ? '' : 'none';
}

function setupColorPicker() {
  const tip = $('color-tip');
  const showTip = () => tip.classList.add('on');
  const hideTip = () => tip.classList.remove('on');

  const bind = (id, key, slot) => {
    const input = $(id);
    input.addEventListener('input', (e) => {
      Col[slot] = e.target.value;
      chrome.storage.local.set({ [key]: Col[slot] });
      updateGradientBar(); checkColorsDirty();
    });
    input.addEventListener('mouseenter', showTip);
    input.addEventListener('mouseleave', hideTip);
  };
  bind('color-hi', 'cum_color_hi', 'hi');
  bind('color-lo', 'cum_color_lo', 'lo');
  bind('color-mid-picker', 'cum_color_mid', 'mid');
}

function setupMidDrag() {
  const bar = $('gradient-bar'), handle = $('gmid-handle'), tip = $('color-tip');
  let dragging = false, moved = false;

  handle.addEventListener('mouseenter', () => tip.classList.add('on'));
  handle.addEventListener('mouseleave', () => tip.classList.remove('on'));
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault(); dragging = true; moved = false;
    handle.setPointerCapture(e.pointerId); handle.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const br = bar.getBoundingClientRect();
    let p = (e.clientX - br.left) / br.width;
    p = Math.max(0.05, Math.min(0.95, p));
    if (Math.abs(p - colorMidPos) > 0.008) moved = true;
    colorMidPos = p;
    chrome.storage.local.set({ cum_color_mid_pos: p });
    updateGradientBar(); checkColorsDirty();
  });
  const end = () => {
    if (!dragging) return;
    if (!moved) { const picker = $('color-mid-picker'); picker.value = Col.mid; picker.click(); }
    dragging = false; handle.classList.remove('dragging');
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', () => { dragging = false; handle.classList.remove('dragging'); });
}

function resetColors() {
  Col.hi = D.hi; Col.mid = D.mid; Col.lo = D.lo; colorMidPos = D.midPos;
  $('color-hi').value = Col.hi; $('color-lo').value = Col.lo; $('color-mid-picker').value = Col.mid;
  chrome.storage.local.remove(['cum_color_hi', 'cum_color_mid', 'cum_color_lo', 'cum_color_mid_pos']);
  updateGradientBar(); checkColorsDirty();
}

// ── Zen mode ───────────────────────────────────────────────────────────────

function toggleZen(enterZen) {
  chrome.storage.local.set({ cum_zen: enterZen });
  applyZen(enterZen);
}
function applyZen(on) {
  $('main-view').style.display = on ? 'none' : '';
  $('zen-view').style.display  = on ? 'flex' : 'none';
}
