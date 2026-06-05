// popup.js — reads cached usage, manages float + halo settings, i18n, zen mode

const $ = id => document.getElementById(id);

let lang = 'zh';
function t(k) { return (window.CUM_I18N[lang] || {})[k] || window.CUM_I18N.zh[k] || k; }

const DEFAULTS = { hi: '#d97757', mid: '#c96442', lo: '#e05252', midPos: 0.4 };
const C = { hi: DEFAULTS.hi, mid: DEFAULTS.mid, lo: DEFAULTS.lo };
let colorMidPos = DEFAULTS.midPos;

document.addEventListener('DOMContentLoaded', () => {
  loadLang();
  loadUsage();
  loadSettings();
  loadZen();

  // ── Float settings ──────────────────────────────────────────────────────
  $('tog-float').addEventListener('change', (e) => {
    const on = e.target.checked;
    chrome.storage.local.set({ cum_fenabled: on });
    setFloatControlsEnabled(on);
  });

  $('tog-wm').addEventListener('change', (e) => {
    chrome.storage.local.set({ cum_fwatermark: e.target.checked });
  });

  $('tog-allpages').addEventListener('change', (e) => {
    chrome.storage.local.set({ cum_allpages: e.target.checked });
  });

  $('opacity-slider').addEventListener('input', (e) => {
    const v = parseInt(e.target.value) / 100;
    $('opacity-label').textContent = e.target.value + '%';
    chrome.storage.local.set({ cum_fopacity: v });
  });

  // ── Halo settings ──────────────────────────────────────────────────────
  $('halo-active-slider').addEventListener('input', (e) => {
    const v = parseInt(e.target.value) / 100;
    $('halo-active-label').textContent = e.target.value + '%';
    chrome.storage.local.set({ cum_halo_active: v });
  });

  $('halo-idle-slider').addEventListener('input', (e) => {
    const v = parseInt(e.target.value) / 100;
    $('halo-idle-label').textContent = e.target.value + '%';
    chrome.storage.local.set({ cum_halo_idle: v });
  });

  // ── Color pickers + mid-drag ───────────────────────────────────────────
  setupColorPicker();
  setupMidDrag();
  $('btn-reset-colors').addEventListener('click', resetColors);

  // ── Reset all ──────────────────────────────────────────────────────────
  $('btn-reset').addEventListener('click', () => {
    chrome.storage.local.remove([
      'cum_fenabled', 'cum_fopacity', 'cum_fwatermark', 'cum_fpos',
      'cum_halo_active', 'cum_halo_idle', 'cum_color_hi', 'cum_color_mid', 'cum_color_lo',
      'cum_fsize', 'cum_lang', 'cum_zen', 'cum_allpages', 'cum_color_mid_pos',
    ], () => {
      chrome.storage.local.set({ cum_lang: 'en' });
      location.reload();
    });
  });

  // ── Zen mode toggle ────────────────────────────────────────────────────
  $('zen-toggle').addEventListener('click', () => toggleZen(true));
  $('zen-view').addEventListener('click', () => toggleZen(false));
});

// ── i18n ──────────────────────────────────────────────────────────────────

function loadLang() {
  chrome.storage.local.get('cum_lang', (res) => {
    lang = res.cum_lang || 'zh';
    applyI18n();
    buildLangButtons();
  });
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (el.id === 'last-updated' && el.textContent !== t('loading') && el.getAttribute('data-dynamic')) return;
    el.textContent = t(key);
  });
}

function buildLangButtons() {
  const row = $('lang-row');
  if (!row) return;
  row.innerHTML = '';
  window.CUM_LANGS.forEach((l) => {
    const btn = document.createElement('button');
    btn.className = 'lang-btn' + (lang === l.code ? ' active' : '');
    btn.textContent = l.label;
    btn.addEventListener('click', () => {
      lang = l.code;
      chrome.storage.local.set({ cum_lang: l.code });
      applyI18n();
      buildLangButtons();
      loadUsage();
    });
    row.appendChild(btn);
  });
}

// ── Usage display ─────────────────────────────────────────────────────────

function loadUsage() {
  chrome.storage.local.get('usageData', (res) => {
    const data = res.usageData;
    if (!data || data.error || typeof data.remainPct !== 'number') {
      showError();
      return;
    }
    showUsage(data);
  });
}

function showUsage(data) {
  $('loading').style.display    = 'none';
  $('error-body').style.display = 'none';
  $('usage-body').style.display = 'block';

  const p = data.remainPct;
  $('pct-val').textContent = p + '%';
  $('prog').style.width    = p + '%';
  $('prog').style.background = p > 60
    ? 'linear-gradient(90deg,#d97757,#e8a87c)'
    : p > 30
      ? 'linear-gradient(90deg,#c96442,#d97757)'
      : 'linear-gradient(90deg,#e05252,#ff8a65)';

  const ms  = (data.session && data.session.resetMs) || data.resetMs || 0;
  const now = Date.now();
  if (ms > 0 && ms > now) {
    const diff = ms - now;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    $('reset-val').textContent =
      String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  } else {
    $('reset-val').textContent = ms > 0 ? t('newCycle') : '—';
  }

  const ts = data.ts;
  const el = $('last-updated');
  el.setAttribute('data-dynamic', '1');
  el.textContent = ts
    ? t('updatedAt') + ' ' + new Date(ts).toLocaleTimeString(
        lang === 'ja' ? 'ja-JP' : lang === 'ko' ? 'ko-KR' : lang === 'en' ? 'en-US' : 'zh-CN',
        { hour:'2-digit', minute:'2-digit' })
    : '';
}

function showError() {
  $('loading').style.display    = 'none';
  $('usage-body').style.display = 'none';
  $('error-body').style.display = 'block';
}

// ── Settings ──────────────────────────────────────────────────────────────

function loadSettings() {
  chrome.storage.local.get(
    ['cum_fenabled','cum_fopacity','cum_fwatermark','cum_allpages',
     'cum_halo_active','cum_halo_idle','cum_color_hi','cum_color_mid','cum_color_lo','cum_color_mid_pos'],
    (res) => {
      const enabled   = !!res.cum_fenabled;
      const opacity   = typeof res.cum_fopacity === 'number' ? res.cum_fopacity : 1.0;
      const watermark = !!res.cum_fwatermark;

      $('tog-float').checked    = enabled;
      $('tog-wm').checked       = watermark;
      $('tog-allpages').checked = !!res.cum_allpages;
      $('opacity-slider').value = Math.round(opacity * 100);
      $('opacity-label').textContent = Math.round(opacity * 100) + '%';

      const haloActive = typeof res.cum_halo_active === 'number' ? res.cum_halo_active : 1.0;
      const haloIdle   = typeof res.cum_halo_idle   === 'number' ? res.cum_halo_idle   : 0.5;
      $('halo-active-slider').value = Math.round(haloActive * 100);
      $('halo-active-label').textContent = Math.round(haloActive * 100) + '%';
      $('halo-idle-slider').value = Math.round(haloIdle * 100);
      $('halo-idle-label').textContent = Math.round(haloIdle * 100) + '%';

      C.hi  = res.cum_color_hi  || DEFAULTS.hi;
      C.mid = res.cum_color_mid || DEFAULTS.mid;
      C.lo  = res.cum_color_lo  || DEFAULTS.lo;
      colorMidPos = typeof res.cum_color_mid_pos === 'number' ? res.cum_color_mid_pos : DEFAULTS.midPos;

      $('color-hi').value = C.hi;
      $('color-lo').value = C.lo;
      $('color-mid-picker').value = C.mid;

      updateGradientBar();
      checkColorsDirty();
      setFloatControlsEnabled(enabled);
    }
  );
}

function setFloatControlsEnabled(on) {
  ['watermark-row', 'allpages-row', 'opacity-row'].forEach((id) => {
    const el = $(id);
    el.style.opacity      = on ? '1' : '.45';
    el.style.pointerEvents = on ? 'auto' : 'none';
  });
}

function updateGradientBar() {
  const bar = $('gradient-bar');
  if (!bar) return;
  const p = colorMidPos * 100;
  bar.style.background = `linear-gradient(to right, ${C.hi}, ${C.mid} ${p}%, ${C.lo})`;
  const handle = $('gmid-handle');
  if (handle) handle.style.left = p + '%';
}

function checkColorsDirty() {
  const dirty = C.hi !== DEFAULTS.hi || C.mid !== DEFAULTS.mid ||
                C.lo !== DEFAULTS.lo || Math.abs(colorMidPos - DEFAULTS.midPos) > 0.01;
  const btn = $('btn-reset-colors');
  if (btn) btn.style.display = dirty ? '' : 'none';
}

function setupColorPicker() {
  const tip = $('color-tip');
  const showTip = () => { if (tip) tip.classList.add('on'); };
  const hideTip = () => { if (tip) tip.classList.remove('on'); };

  // Hi stop — native input, direct click opens picker
  const hiIn = $('color-hi');
  hiIn.addEventListener('input', (e) => {
    C.hi = e.target.value;
    chrome.storage.local.set({ cum_color_hi: C.hi });
    updateGradientBar(); checkColorsDirty();
  });
  hiIn.addEventListener('mouseenter', showTip);
  hiIn.addEventListener('mouseleave', hideTip);

  // Lo stop — native input, direct click opens picker
  const loIn = $('color-lo');
  loIn.addEventListener('input', (e) => {
    C.lo = e.target.value;
    chrome.storage.local.set({ cum_color_lo: C.lo });
    updateGradientBar(); checkColorsDirty();
  });
  loIn.addEventListener('mouseenter', showTip);
  loIn.addEventListener('mouseleave', hideTip);

  // Mid picker — hidden input, triggered by mid handle click
  $('color-mid-picker').addEventListener('input', (e) => {
    C.mid = e.target.value;
    chrome.storage.local.set({ cum_color_mid: C.mid });
    updateGradientBar(); checkColorsDirty();
  });
}

function setupMidDrag() {
  const bar = $('gradient-bar');
  const handle = $('gmid-handle');
  const tip = $('color-tip');
  if (!bar || !handle) return;
  let mdDragging = false, mdMoved = false;

  handle.addEventListener('mouseenter', () => { if (tip) tip.classList.add('on'); });
  handle.addEventListener('mouseleave', () => { if (tip) tip.classList.remove('on'); });

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    mdDragging = true; mdMoved = false;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!mdDragging) return;
    const br = bar.getBoundingClientRect();
    let p = (e.clientX - br.left) / br.width;
    p = Math.max(0.05, Math.min(0.95, p));
    if (Math.abs(p - colorMidPos) > 0.008) mdMoved = true;
    colorMidPos = p;
    chrome.storage.local.set({ cum_color_mid_pos: p });
    updateGradientBar(); checkColorsDirty();
  });
  handle.addEventListener('pointerup', () => {
    if (!mdMoved) {
      const picker = $('color-mid-picker');
      if (picker) { picker.value = C.mid; picker.click(); }
    }
    mdDragging = false;
    handle.classList.remove('dragging');
  });
  handle.addEventListener('pointercancel', () => {
    mdDragging = false;
    handle.classList.remove('dragging');
  });
}

function resetColors() {
  C.hi = DEFAULTS.hi; C.mid = DEFAULTS.mid; C.lo = DEFAULTS.lo;
  colorMidPos = DEFAULTS.midPos;
  $('color-hi').value = C.hi;
  $('color-lo').value = C.lo;
  $('color-mid-picker').value = C.mid;
  chrome.storage.local.remove(['cum_color_hi', 'cum_color_mid', 'cum_color_lo', 'cum_color_mid_pos']);
  updateGradientBar(); checkColorsDirty();
}

// ── Zen mode ──────────────────────────────────────────────────────────────

function loadZen() {
  chrome.storage.local.get('cum_zen', (res) => {
    if (res.cum_zen) applyZen(true);
  });
}

function toggleZen(enterZen) {
  chrome.storage.local.set({ cum_zen: enterZen });
  applyZen(enterZen);
}

function applyZen(on) {
  $('main-view').style.display = on ? 'none' : '';
  $('zen-view').style.display  = on ? 'flex' : 'none';
}
