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

// Halo colours / intensities are stored per provider (see shared.js)
const K  = (base) => C.settingKey(base, provider);
const PC = () => C.PROVIDER_COLORS[provider] || D;
const ALL_PROVIDER_KEYS = C.PROVIDERS.flatMap(p => C.PER_PROVIDER_KEYS.map(b => C.settingKey(b, p)));

document.addEventListener('DOMContentLoaded', () => {
  buildLogos();
  $('icon-bat-full').innerHTML = C.ICONS.batFull;
  $('icon-bat-low').innerHTML  = C.ICONS.batLow;

  chrome.storage.local.get(['cum_lang', 'cum_provider', 'cum_zen'], (res) => {
    if (res.cum_lang) lang = res.cum_lang;
    provider = C.USAGE_KEY[res.cum_provider] ? res.cum_provider : 'claude';
    const init = () => {
      C.applyMenuTheme(document.documentElement, provider);
      applyLang();
      buildLangButtons();
      buildProviderSeg();
      loadUsage();
      loadSettings();
      if (res.cum_zen) applyZen(true);
    };
    // Prefer the current chat page; unrelated pages retain the saved choice.
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const error = chrome.runtime.lastError;
        const current = !error && C.providerFromUrl(tabs && tabs[0] && tabs[0].url);
        if (current) provider = current;
        init();
      });
    } catch (e) { init(); }
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
    chrome.storage.local.set({ [K('cum_halo_active')]: parseInt(e.target.value, 10) / 100 });
  });
  $('halo-idle-slider').addEventListener('input', (e) => {
    $('halo-idle-label').textContent = e.target.value + '%';
    chrome.storage.local.set({ [K('cum_halo_idle')]: parseInt(e.target.value, 10) / 100 });
  });

  $('breath-slider').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10) / 100;
    $('breath-label').textContent = v.toFixed(1) + '×';
    chrome.storage.local.set({ [K('cum_breath_rate')]: v }); checkColorsDirty();
  });
  $('fade-slider').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10) / 10;
    $('fade-label').textContent = v.toFixed(1) + ' s';
    chrome.storage.local.set({ [K('cum_color_fade')]: v }); checkColorsDirty();
  });
  $('tog-cd').addEventListener('change', (e) => chrome.storage.local.set({ cum_show_cd: e.target.checked }));
  $('tog-tok').addEventListener('change', (e) => chrome.storage.local.set({ cum_show_tok: e.target.checked }));

  setupColorPicker();
  setupMidDrag();
  $('btn-reset-colors').addEventListener('click', resetColors);

  // ── Reset all ──────────────────────────────────────────────────────────
  $('btn-reset').addEventListener('click', () => {
    chrome.storage.local.remove([
      'cum_fenabled', 'cum_fopacity', 'cum_fwatermark', 'cum_fpos',
      'cum_halo_active', 'cum_halo_idle', 'cum_color_hi', 'cum_color_mid', 'cum_color_lo',
      'cum_fsize', 'cum_lang', 'cum_zen', 'cum_allpages', 'cum_color_mid_pos', 'cum_provider',
      'cum_show_cd', 'cum_show_tok',
      ...ALL_PROVIDER_KEYS,
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
  updateHaloTitle();
  if ($('preset-row').childElementCount) buildPresets();
}

function updateHaloTitle() {
  const el = $('halo-title-label');
  if (el) el.textContent = t('haloSection') + ' · ' + C.PROVIDER_LABEL[provider];
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
      C.applyMenuTheme(document.documentElement, provider);
      chrome.storage.local.set({ cum_provider: p });
      buildProviderSeg(); loadUsage(); loadSettings(); updateHaloTitle();
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
  // Follows the provider's configured colours so the popup matches the halo
  const tier = C.tierOf(pct, colorMidPos);
  const c = tier === 'hi' ? Col.hi : tier === 'mid' ? Col.mid : Col.lo;
  return `linear-gradient(90deg, ${c}, ${c}aa)`;
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
  note.textContent = data.stale ? '⚠ ' + t('staleData') : '';

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
    ['cum_fenabled','cum_fopacity','cum_fwatermark','cum_allpages','cum_show_cd','cum_show_tok', ...ALL_PROVIDER_KEYS],
    (res) => {
      const enabled = !!res.cum_fenabled;
      const opacity = typeof res.cum_fopacity === 'number' ? res.cum_fopacity : 1.0;
      $('tog-float').checked    = enabled;
      $('tog-wm').checked       = !!res.cum_fwatermark;
      $('tog-allpages').checked = !!res.cum_allpages;
      $('opacity-slider').value = Math.round(opacity * 100);
      $('opacity-label').textContent = Math.round(opacity * 100) + '%';
      $('tog-cd').checked  = res.cum_show_cd  !== false;
      $('tog-tok').checked = res.cum_show_tok !== false;

      const num = (k, d) => typeof res[K(k)] === 'number' ? res[K(k)] : d;
      const haloActive = num('cum_halo_active', 1.0);
      const haloIdle   = num('cum_halo_idle', 0.5);
      $('halo-active-slider').value = Math.round(haloActive * 100);
      $('halo-active-label').textContent = Math.round(haloActive * 100) + '%';
      $('halo-idle-slider').value = Math.round(haloIdle * 100);
      $('halo-idle-label').textContent = Math.round(haloIdle * 100) + '%';
      motion.breathRate = num('cum_breath_rate', C.MOTION_DEFAULTS.breathRate);
      motion.colorFade  = num('cum_color_fade',  C.MOTION_DEFAULTS.colorFade);
      motion.haloActive = haloActive; motion.haloIdle = haloIdle;
      showMotion();

      const P = PC();
      Col.hi  = res[K('cum_color_hi')]  || P.hi;
      Col.mid = res[K('cum_color_mid')] || P.mid;
      Col.lo  = res[K('cum_color_lo')]  || P.lo;
      colorMidPos = num('cum_color_mid_pos', P.midPos);

      $('color-hi').value = Col.hi;
      $('color-lo').value = Col.lo;
      $('color-mid-picker').value = Col.mid;

      updateGradientBar(); checkColorsDirty(); setFloatControlsEnabled(enabled); buildPresets();
      loadUsage(); // bars were drawn before this provider's colours were known
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

// Halo intensity + motion values currently shown (per provider)
const motion = { haloActive: 1.0, haloIdle: 0.5, breathRate: 1.0, colorFade: 1.4 };
function showMotion() {
  $('breath-slider').value = Math.round(motion.breathRate * 100);
  $('breath-label').textContent = motion.breathRate.toFixed(1) + '×';
  $('fade-slider').value = Math.round(motion.colorFade * 10);
  $('fade-label').textContent = motion.colorFade.toFixed(1) + ' s';
}

// Style presets: hover previews the colours on the gradient bar, click applies every parameter
function buildPresets() {
  const row = $('preset-row');
  row.innerHTML = '';
  const names = { neon: 'presetNeon', cyber: 'presetCyber', natural: 'presetNatural' };
  for (const [id, p] of Object.entries(C.STYLE_PRESETS)) {
    const b = document.createElement('button');
    b.className = 'preset-btn';
    b.dataset.preset = id;
    const sw = document.createElement('span'); sw.className = 'preset-swatch';
    sw.style.background = `linear-gradient(to right, ${p.hi}, ${p.mid} ${p.midPos * 100}%, ${p.lo})`;
    b.appendChild(sw); b.appendChild(document.createTextNode(t(names[id])));
    b.classList.toggle('active', Col.hi === p.hi && Col.mid === p.mid && Col.lo === p.lo);
    b.addEventListener('mouseenter', () => {
      $('gradient-bar').style.background = `linear-gradient(to right, ${p.hi}, ${p.mid} ${p.midPos * 100}%, ${p.lo})`;
    });
    b.addEventListener('mouseleave', updateGradientBar);
    b.addEventListener('click', () => {
      chrome.storage.local.set(C.presetToStorage(p, provider), loadSettings);
    });
    row.appendChild(b);
  }
}

function checkColorsDirty() {
  const P = PC();
  const M = C.MOTION_DEFAULTS;
  const breath = parseInt($('breath-slider').value, 10) / 100;
  const fade = parseInt($('fade-slider').value, 10) / 10;
  const dirty = Col.hi !== P.hi || Col.mid !== P.mid || Col.lo !== P.lo || Math.abs(colorMidPos - P.midPos) > 0.01
    || Math.abs(breath - M.breathRate) > 0.01 || Math.abs(fade - M.colorFade) > 0.01;
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
      chrome.storage.local.set({ [K(key)]: Col[slot] });
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
    chrome.storage.local.set({ [K('cum_color_mid_pos')]: p });
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
  const P = PC();
  Col.hi = P.hi; Col.mid = P.mid; Col.lo = P.lo; colorMidPos = P.midPos;
  $('color-hi').value = Col.hi; $('color-lo').value = Col.lo; $('color-mid-picker').value = Col.mid;
  // Undo a preset as well: colours, glow intensity and motion all go back to defaults
  chrome.storage.local.remove(C.PER_PROVIDER_KEYS.map(K), loadSettings);
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
