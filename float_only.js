// float_only.js — Cross-page floating icon (every site except claude.ai / chatgpt.com)
// Shows the cached usage of the selected source (cum_provider). Activates only
// when cum_allpages is enabled. Data comes from chrome.storage, never fetched here.

(() => {
  'use strict';

  const C = self.CUM;
  if (!C) return;
  const safeSet = C.safeSet;

  // ── i18n ─────────────────────────────────────────────────────────────────
  let lang = C.guessLang(navigator.languages || [navigator.language]);
  const t = C.makeT(() => lang);

  // ── State ─────────────────────────────────────────────────────────────────
  const S = { remainPct: 100, resetMs: 0, session: null, weekly: null, loaded: false, stale: false };
  const F = {
    allPages: false, opacity: 1.0, watermark: false, provider: 'claude',
    haloActive: 1.0, haloIdle: 0.5,
    colorHi: C.DEFAULT_COLORS.hi, colorMid: C.DEFAULT_COLORS.mid, colorLo: C.DEFAULT_COLORS.lo,
    colorMidPos: C.DEFAULT_COLORS.midPos, fsize: 56,
  };
  const usageColor = () => C.usageColor(F, S.remainPct);
  const dataKey = () => C.USAGE_KEY[F.provider] || C.USAGE_KEY.claude;

  // ── DOM ───────────────────────────────────────────────────────────────────
  let floatEl, floatPaths = [], floatTipEl, ctxEl, rzEl, bloomStyle;
  let activeSubMenus = [];
  let initialized = false;
  let dragging = false, dragMoved = false, dragStartX = 0, dragStartY = 0;
  let curRight = 24, curBottom = 24;
  let rzDragging = false, rzStartX = 0, rzStartY = 0, rzStartSize = 56, rzStartRight = 24, rzStartBottom = 24;

  // ── Styles ────────────────────────────────────────────────────────────────
  function updateBloomKeyframes() {
    const color = usageColor();
    if (!bloomStyle) {
      bloomStyle = document.createElement('style');
      bloomStyle.id = 'cum-ext-bloom-dynamic';
      (document.head || document.documentElement).appendChild(bloomStyle);
    }
    bloomStyle.textContent = `
      @keyframes cum-ext-bloom {
        0%{filter:drop-shadow(0 0 0px transparent)}
        25%{filter:drop-shadow(0 0 24px ${color}99)}
        60%{filter:drop-shadow(0 0 14px ${color}44)}
        100%{filter:drop-shadow(0 0 0px transparent)}
      }`;
  }

  function injectStyles() {
    if (document.getElementById('cum-ext-style')) return;
    const s = document.createElement('style');
    s.id = 'cum-ext-style';
    const FONT = C.fontStack(lang);
    s.textContent = `
      #cum-float-ext {
        position:fixed; z-index:2147483641;
        width:56px; height:56px; cursor:grab; user-select:none; display:none; touch-action:none;
        bottom:24px; right:24px; line-height:0;
      }
      #cum-float-ext:active { cursor:grabbing; }
      #cum-float-ext svg { width:100%; height:100%; overflow:visible; display:block; }
      #cum-float-ext path { transition:fill 1.4s ease; }

      @keyframes cum-ext-warn  { 0%,100%{opacity:1} 50%{opacity:.4} }
      @keyframes cum-ext-blink { 0%,49%{opacity:1} 50%,100%{opacity:.12} }
      #cum-float-ext.cum-ext-warn     { animation: cum-ext-warn  1s ease-in-out infinite; }
      #cum-float-ext.cum-ext-blink    { animation: cum-ext-blink .35s step-end infinite; }
      #cum-float-ext.cum-ext-blooming { animation: cum-ext-bloom 1.5s ease-out forwards; }

      #cum-ftip-ext {
        position:fixed; z-index:2147483643; padding:5px 10px; border-radius:8px;
        font:12px/1.5 ${FONT};
        background:rgba(16,14,12,.88); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
        border:1px solid rgba(217,119,87,.2); color:rgba(255,255,255,.85);
        white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .18s ease;
        text-align:start;
      }
      #cum-ftip-ext .tp { font-weight:600; }
      #cum-ftip-ext .sub { color:rgba(255,255,255,.5); font-size:11px; }

      #cum-ctx-ext, .cum-ext-submenu {
        position:fixed; min-width:150px; border-radius:10px;
        background:rgba(22,20,18,.94); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
        border:1px solid rgba(255,255,255,.1); box-shadow:0 8px 32px rgba(0,0,0,.5);
        overflow:hidden; display:none; z-index:2147483644;
        font:13px/1 ${FONT}; color:rgba(255,255,255,.82); text-align:start;
      }
      .cum-ext-submenu { min-width:120px; z-index:2147483645; }
      .cum-ext-item {
        padding:9px 14px; cursor:pointer; color:rgba(255,255,255,.82); margin:0;
        display:flex; align-items:center; justify-content:space-between; gap:8px;
      }
      .cum-ext-item:hover { background:rgba(255,255,255,.08); }
      .cum-ext-item.danger { color:#e05252; }
      .cum-ext-sep { height:1px; background:rgba(255,255,255,.08); margin:2px 0; }
      .cum-ext-sub-hdr { font-size:11px; color:rgba(255,255,255,.35); padding:8px 14px 4px; cursor:default; }
      .cum-ext-check { color:#d97757; flex-shrink:0; display:inline-flex; }
      .cum-ext-arrow { color:rgba(255,255,255,.3); flex-shrink:0; display:inline-flex; }
      [dir="rtl"] .cum-ext-arrow svg { transform:scaleX(-1); }

      .cum-ext-slider-row { padding:6px 14px 10px; display:flex; align-items:center; gap:8px; }
      .cum-ext-slider-row input[type=range] {
        flex:1; height:4px; appearance:none; -webkit-appearance:none; background:rgba(255,255,255,.12);
        border-radius:2px; cursor:pointer; margin:0;
      }
      .cum-ext-slider-row input[type=range]::-webkit-slider-thumb {
        appearance:none; -webkit-appearance:none; width:11px; height:11px; border-radius:50%;
        background:#d97757; cursor:pointer;
      }
      .cum-ext-slider-val { font-size:11px; color:rgba(255,255,255,.4); width:28px; text-align:end; flex-shrink:0; font-variant-numeric:tabular-nums; }

      .cum-ext-grow { padding:6px 14px 8px; display:flex; align-items:center; gap:6px; position:relative; color:rgba(255,255,255,.6); }
      .cum-ext-gbar { flex:1; height:16px; border-radius:8px; position:relative; border:1px solid rgba(255,255,255,.1); }
      .cum-ext-gstop {
        position:absolute; top:50%; width:16px; height:16px;
        border-radius:50%; border:2px solid rgba(255,255,255,.5); cursor:pointer;
        transform:translateY(-50%);
      }
      .cum-ext-gstop:hover { border-color:rgba(255,255,255,.9); }
      .cum-ext-gstop.hi { left:-4px; }
      .cum-ext-gstop.lo { right:-4px; left:auto; }
      .cum-ext-mid-drag {
        position:absolute; top:50%; width:16px; height:16px;
        border-radius:50%; cursor:ew-resize; touch-action:none;
        border:2.5px solid rgba(255,255,255,.65); background:rgba(20,18,16,.3);
        transform:translate(-50%,-50%);
      }
      .cum-ext-mid-drag:hover { border-color:rgba(255,255,255,.9); }
      .cum-ext-gtip {
        position:absolute; left:50%; transform:translateX(-50%); bottom:calc(100% - 2px);
        background:rgba(16,14,12,.92); color:rgba(255,255,255,.75); font-size:10.5px; padding:3px 9px;
        border-radius:5px; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .18s;
        border:1px solid rgba(255,255,255,.1); z-index:1;
      }
      .cum-ext-rrow { padding:0 14px 6px; display:flex; justify-content:flex-end; }
      .cum-ext-creset {
        padding:4px 8px; border-radius:7px; font:11px ${FONT};
        background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07);
        color:rgba(255,255,255,.35); cursor:pointer;
      }
      .cum-ext-creset:hover { background:rgba(224,82,82,.1); border-color:rgba(224,82,82,.2); color:rgba(224,82,82,.7); }

      #cum-rz-ext {
        position:fixed; z-index:2147483642; width:18px; height:18px;
        cursor:nwse-resize; display:none; opacity:0; transition:opacity .2s ease; touch-action:none;
      }
      #cum-rz-ext.on { opacity:1; }
      #cum-rz-ext svg { pointer-events:none; }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  function applyLangToUi() {
    [floatTipEl, ctxEl, ...activeSubMenus].forEach(el => C.applyLang(el, lang));
  }

  // ── Float icon ────────────────────────────────────────────────────────────
  function createFloat() {
    floatEl = document.createElement('div'); floatEl.id = 'cum-float-ext';
    floatEl.setAttribute('role', 'img');
    const built = C.buildPetalSvg(document, F.colorHi);
    floatPaths = built.paths;
    floatEl.appendChild(built.svg);
    document.body.appendChild(floatEl);

    floatTipEl = document.createElement('div'); floatTipEl.id = 'cum-ftip-ext';
    document.body.appendChild(floatTipEl);

    ctxEl = document.createElement('div'); ctxEl.id = 'cum-ctx-ext';
    document.body.appendChild(ctxEl);
    applyLangToUi();

    // ── Drag ──────────────────────────────────────────────────────────────
    let ox = 0, oy = 0;
    function applyRB(right, bottom) {
      const cw = document.documentElement.clientWidth;
      const ch = document.documentElement.clientHeight;
      right  = Math.max(0, Math.min(right,  cw - F.fsize));
      bottom = Math.max(0, Math.min(bottom, ch - F.fsize));
      curRight = right; curBottom = bottom;
      floatEl.style.right  = right  + 'px';
      floatEl.style.bottom = bottom + 'px';
      floatEl.style.left   = 'auto';
      floatEl.style.top    = 'auto';
      positionRz();
    }
    floatEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || F.watermark) return;
      e.preventDefault();
      dragStartX = e.clientX; dragStartY = e.clientY; dragMoved = false; dragging = true;
      const r = floatEl.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      floatEl.setPointerCapture(e.pointerId);
    });
    floatEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (!dragMoved) {
        if (Math.abs(e.clientX - dragStartX) < 5 && Math.abs(e.clientY - dragStartY) < 5) return;
        dragMoved = true;
      }
      const cw = document.documentElement.clientWidth;
      const ch = document.documentElement.clientHeight;
      applyRB(cw - (e.clientX - ox) - F.fsize, ch - (e.clientY - oy) - F.fsize);
    });
    const endDrag = () => {
      if (!dragging) return;
      if (dragMoved) safeSet({ cum_fpos: { right: curRight, bottom: curBottom } });
      dragging = false;
    };
    floatEl.addEventListener('pointerup', endDrag);
    floatEl.addEventListener('pointercancel', endDrag);

    // ── Hover ─────────────────────────────────────────────────────────────
    floatEl.addEventListener('mouseenter', () => {
      showTooltip();
      if (rzEl && rzEl.style.display !== 'none') rzEl.classList.add('on');
    });
    floatEl.addEventListener('mouseleave', () => {
      floatTipEl.style.opacity = '0';
      if (rzEl && !rzDragging) rzEl.classList.remove('on');
    });

    // ── Context menu ──────────────────────────────────────────────────────
    floatEl.addEventListener('contextmenu', showCtx);
    document.addEventListener('pointerdown', (e) => {
      const outside = ctxEl && !ctxEl.contains(e.target) &&
                      !activeSubMenus.some(s => s.contains(e.target));
      if (outside) hideCtx();
    }, { passive: true });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtx(); }, { passive: true });

    // ── Resize handle ─────────────────────────────────────────────────────
    rzEl = document.createElement('div'); rzEl.id = 'cum-rz-ext';
    rzEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M10 2 L10 10 L2 10" stroke="rgba(255,255,255,.85)"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    document.body.appendChild(rzEl);

    rzEl.addEventListener('mouseenter', () => rzEl.classList.add('on'));
    rzEl.addEventListener('mouseleave', () => { if (!rzDragging) rzEl.classList.remove('on'); });
    rzEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      rzDragging = true;
      rzStartX = e.clientX; rzStartY = e.clientY;
      rzStartSize = F.fsize; rzStartRight = curRight; rzStartBottom = curBottom;
      rzEl.setPointerCapture(e.pointerId);
    });
    rzEl.addEventListener('pointermove', (e) => {
      if (!rzDragging) return;
      const delta = Math.round((e.clientX - rzStartX + e.clientY - rzStartY) / 2);
      const ns = Math.max(24, Math.min(128, rzStartSize + delta));
      F.fsize = ns;
      applyRB(rzStartRight + rzStartSize - ns, rzStartBottom + rzStartSize - ns); // keep top-left fixed
      applyVisibility();
    });
    const endRz = () => { if (!rzDragging) return; rzDragging = false; safeSet({ cum_fsize: F.fsize }); };
    rzEl.addEventListener('pointerup', endRz);
    rzEl.addEventListener('pointercancel', endRz);
  }

  function positionRz() {
    if (!rzEl) return;
    rzEl.style.right  = Math.max(0, curRight  - 6) + 'px';
    rzEl.style.bottom = Math.max(0, curBottom - 6) + 'px';
  }

  function applyVisibility() {
    if (!floatEl) return;
    floatEl.style.display       = F.allPages ? 'block' : 'none';
    floatEl.style.opacity       = F.watermark ? String(Math.min(F.opacity, 0.35)) : String(F.opacity);
    floatEl.style.pointerEvents = 'auto';
    floatEl.style.cursor        = F.watermark ? 'default' : 'grab';
    floatEl.style.width         = F.fsize + 'px';
    floatEl.style.height        = F.fsize + 'px';
    if (rzEl) {
      const showRz = F.allPages && !F.watermark;
      rzEl.style.display = showRz ? 'block' : 'none';
      if (!showRz) rzEl.classList.remove('on');
    }
    positionRz();
  }

  function drawFloat() {
    if (!floatPaths.length || !S.loaded) return;
    C.paintPetals(floatPaths, S.remainPct, usageColor());
    floatEl.setAttribute('aria-label', `${C.PROVIDER_LABEL[F.provider]} ${S.remainPct}% ${t('remaining')}`);
    updateBloomKeyframes();
  }

  // ── Reset countdown effects ───────────────────────────────────────────────
  function checkResetEffects() {
    if (!floatEl || !S.loaded || !F.allPages) return;
    const now = Date.now();
    const ms = S.session?.resetMs ?? S.resetMs ?? 0;
    if (ms <= 0 || ms <= now) { floatEl.classList.remove('cum-ext-warn', 'cum-ext-blink'); return; }
    const diff = ms - now;
    if (diff <= 5000)       { floatEl.classList.remove('cum-ext-warn');  floatEl.classList.add('cum-ext-blink'); }
    else if (diff <= 30000) { floatEl.classList.remove('cum-ext-blink'); floatEl.classList.add('cum-ext-warn');  }
    else                    { floatEl.classList.remove('cum-ext-warn', 'cum-ext-blink'); }
  }

  function triggerBloom() {
    if (!floatEl) return;
    floatEl.classList.remove('cum-ext-blooming');
    void floatEl.offsetWidth;
    floatEl.classList.add('cum-ext-blooming');
    setTimeout(() => floatEl && floatEl.classList.remove('cum-ext-blooming'), 1600);
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  function showTooltip() {
    if (!floatEl || !floatTipEl) return;
    const r = floatEl.getBoundingClientRect();
    const esc = C.escapeHtml;
    const ms = S.session?.resetMs ?? S.resetMs ?? 0;
    let html = `<span class="tp" style="color:${esc(usageColor())}">${esc(C.PROVIDER_LABEL[F.provider])} · ${S.remainPct}% ${esc(t('remaining'))}</span>`;
    if (ms > 0) html += `<br><span class="sub">${esc(ms > Date.now() ? t('resetAt') + ' ' + C.fmtClock(ms, lang, true) : t('newCycle'))}</span>`;
    if (S.weekly && typeof S.weekly.remainPct === 'number') html += `<br><span class="sub">${esc(t('weekShort'))}: ${S.weekly.remainPct}% ${esc(t('remaining'))}</span>`;
    floatTipEl.innerHTML = html;
    floatTipEl.style.left      = (r.left + r.width / 2) + 'px';
    floatTipEl.style.bottom    = (window.innerHeight - r.top + 8) + 'px';
    floatTipEl.style.top       = 'auto';
    floatTipEl.style.transform = 'translateX(-50%)';
    floatTipEl.style.opacity   = '1';
  }

  // ── Context menu ──────────────────────────────────────────────────────────
  function showCtx(e) {
    e.preventDefault(); e.stopPropagation();
    buildCtx();
    ctxEl.style.left = '0'; ctxEl.style.top = '0'; ctxEl.style.display = 'block';
    const cw = ctxEl.offsetWidth, ch = ctxEl.offsetHeight;
    let cx = e.clientX, cy = e.clientY;
    if (cx + cw > window.innerWidth)  cx = e.clientX - cw;
    if (cy + ch > window.innerHeight) cy = e.clientY - ch;
    ctxEl.style.left = Math.max(0, cx) + 'px';
    ctxEl.style.top  = Math.max(0, cy) + 'px';
  }
  function hideCtx() {
    if (ctxEl) ctxEl.style.display = 'none';
    activeSubMenus.forEach(s => { s.style.display = 'none'; });
  }

  function buildCtx() {
    activeSubMenus.forEach(s => { try { s.remove(); } catch(e){} });
    activeSubMenus = [];
    ctxEl.innerHTML = '';
    C.applyLang(ctxEl, lang);

    const item = (label, cls, action, checked, parent) => {
      const d = document.createElement('div');
      d.className = 'cum-ext-item' + (cls ? ' ' + cls : '');
      const sp = document.createElement('span'); sp.textContent = label; d.appendChild(sp);
      if (checked) { const ck = document.createElement('span'); ck.className = 'cum-ext-check'; ck.innerHTML = C.ICONS.check; d.appendChild(ck); }
      d.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); hideCtx(); action(); });
      (parent || ctxEl).appendChild(d);
    };
    const sep = (parent) => { const d = document.createElement('div'); d.className = 'cum-ext-sep'; (parent || ctxEl).appendChild(d); };
    const hdr = (label, parent) => { const d = document.createElement('div'); d.className = 'cum-ext-sub-hdr'; d.textContent = label; (parent || ctxEl).appendChild(d); };
    const subMenu = (label) => {
      const wrap = document.createElement('div'); wrap.className = 'cum-ext-item';
      const sp = document.createElement('span'); sp.textContent = label;
      const ar = document.createElement('span'); ar.className = 'cum-ext-arrow'; ar.innerHTML = C.ICONS.chevron;
      wrap.appendChild(sp); wrap.appendChild(ar);
      const sub = document.createElement('div'); sub.className = 'cum-ext-submenu';
      C.applyLang(sub, lang);
      document.body.appendChild(sub);
      activeSubMenus.push(sub);
      let hideTimer = null;
      const open = () => {
        clearTimeout(hideTimer);
        const r = wrap.getBoundingClientRect();
        sub.style.display = 'block';
        const sw = sub.offsetWidth, sh = sub.offsetHeight;
        const rtl = C.dirOf(lang) === 'rtl';
        let lx = rtl ? r.left - sw - 4 : r.right + 4;
        if (lx + sw > window.innerWidth) lx = r.left - sw - 4;
        if (lx < 0) lx = r.right + 4;
        let ly = r.top - 4;
        if (ly + sh > window.innerHeight) ly = r.bottom - sh;
        sub.style.left = Math.max(0, lx) + 'px';
        sub.style.top  = Math.max(0, ly) + 'px';
      };
      const close = () => { hideTimer = setTimeout(() => { sub.style.display = 'none'; }, 120); };
      wrap.addEventListener('mouseenter', open);
      wrap.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); open(); });
      wrap.addEventListener('mouseleave', (ev) => { if (!sub.contains(ev.relatedTarget)) close(); });
      sub.addEventListener('mouseenter', () => clearTimeout(hideTimer));
      sub.addEventListener('mouseleave', (ev) => { if (!wrap.contains(ev.relatedTarget)) close(); });
      ctxEl.appendChild(wrap);
      return sub;
    };
    const sliderRow = (initVal, onInput, parent) => {
      const row = document.createElement('div'); row.className = 'cum-ext-slider-row';
      row.addEventListener('pointerdown', ev => ev.stopPropagation());
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '5';
      slider.value = String(Math.round(initVal * 100));
      const valEl = document.createElement('span'); valEl.className = 'cum-ext-slider-val';
      valEl.textContent = slider.value + '%';
      slider.addEventListener('input', () => { valEl.textContent = slider.value + '%'; onInput(parseInt(slider.value, 10) / 100); });
      row.appendChild(slider); row.appendChild(valEl);
      (parent || ctxEl).appendChild(row);
    };

    item(t('hideIcon'), 'danger', () => { F.allPages = false; safeSet({ cum_allpages: false }); applyVisibility(); });
    sep();
    item(t('watermark'), '', () => { F.watermark = !F.watermark; safeSet({ cum_fwatermark: F.watermark }); applyVisibility(); }, F.watermark);
    sep();

    // Data source
    const srcSub = subMenu(t('source'));
    C.PROVIDERS.forEach((p) => {
      item(C.PROVIDER_LABEL[p], '', () => { F.provider = p; safeSet({ cum_provider: p }); loadUsage(); }, F.provider === p, srcSub);
    });
    sep();

    hdr(t('opacity'));
    sliderRow(F.opacity, (v) => { F.opacity = v; applyVisibility(); safeSet({ cum_fopacity: v }); });
    sep();

    const colorSub = subMenu(t('haloLabel'));
    hdr(t('activeIntensity'), colorSub);
    sliderRow(F.haloActive, (v) => { F.haloActive = v; safeSet({ cum_halo_active: v }); }, colorSub);
    hdr(t('idleIntensity'), colorSub);
    sliderRow(F.haloIdle, (v) => { F.haloIdle = v; safeSet({ cum_halo_idle: v }); }, colorSub);
    sep(colorSub);
    addGradientBarWidget(colorSub);
    sep();

    const langSub = subMenu(t('language'));
    (self.CUM_LANGS || []).forEach((l) => {
      item(l.label, '', () => { lang = l.code; safeSet({ cum_lang: l.code }); applyLangToUi(); drawFloat(); }, lang === l.code, langSub);
    });
  }

  function addGradientBarWidget(parent) {
    const grow = document.createElement('div'); grow.className = 'cum-ext-grow';
    grow.addEventListener('pointerdown', ev => ev.stopPropagation());
    const em1 = document.createElement('span'); em1.innerHTML = C.ICONS.batFull; em1.style.display = 'inline-flex';
    const bar = document.createElement('div'); bar.className = 'cum-ext-gbar';
    const em2 = document.createElement('span'); em2.innerHTML = C.ICONS.batLow;  em2.style.display = 'inline-flex';

    const oldP = document.getElementById('cum-ext-cpicker');
    if (oldP) oldP.remove();
    const picker = document.createElement('input'); picker.type = 'color'; picker.id = 'cum-ext-cpicker';
    picker.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px';
    document.body.appendChild(picker);

    const tip = document.createElement('div'); tip.className = 'cum-ext-gtip'; tip.textContent = t('clickColor');
    grow.appendChild(tip);
    const showTip = () => { tip.style.opacity = '1'; };
    const hideTip = () => { tip.style.opacity = '0'; };

    let activePSlot = 'hi';
    picker.addEventListener('input', () => {
      const val = picker.value;
      if (activePSlot === 'hi')       { F.colorHi  = val; safeSet({ cum_color_hi:  val }); }
      else if (activePSlot === 'mid') { F.colorMid = val; safeSet({ cum_color_mid: val }); }
      else                            { F.colorLo  = val; safeSet({ cum_color_lo:  val }); }
      drawFloat(); updateBar();
    });

    const hiDot = document.createElement('div'); hiDot.className = 'cum-ext-gstop hi';
    hiDot.addEventListener('pointerdown', ev => ev.stopPropagation());
    hiDot.addEventListener('click', () => { activePSlot = 'hi'; picker.value = F.colorHi; picker.click(); hideTip(); });
    hiDot.addEventListener('mouseenter', showTip); hiDot.addEventListener('mouseleave', hideTip);
    const loDot = document.createElement('div'); loDot.className = 'cum-ext-gstop lo';
    loDot.addEventListener('pointerdown', ev => ev.stopPropagation());
    loDot.addEventListener('click', () => { activePSlot = 'lo'; picker.value = F.colorLo; picker.click(); hideTip(); });
    loDot.addEventListener('mouseenter', showTip); loDot.addEventListener('mouseleave', hideTip);
    const midDrag = document.createElement('div'); midDrag.className = 'cum-ext-mid-drag';
    midDrag.addEventListener('mouseenter', showTip); midDrag.addEventListener('mouseleave', hideTip);

    const updateBar = () => {
      const p = F.colorMidPos * 100;
      bar.style.background = `linear-gradient(to right,${F.colorHi},${F.colorMid} ${p}%,${F.colorLo})`;
      midDrag.style.left = p + '%';
      hiDot.style.background = F.colorHi; loDot.style.background = F.colorLo;
    };
    let mdDrag = false, mdMoved = false;
    midDrag.addEventListener('pointerdown', ev => { ev.stopPropagation(); ev.preventDefault(); mdDrag = true; mdMoved = false; midDrag.setPointerCapture(ev.pointerId); });
    midDrag.addEventListener('pointermove', ev => {
      if (!mdDrag) return;
      const br = bar.getBoundingClientRect();
      let p = (ev.clientX - br.left) / br.width;
      p = Math.max(0.05, Math.min(0.95, p));
      if (Math.abs(p - F.colorMidPos) > 0.008) mdMoved = true;
      F.colorMidPos = p; safeSet({ cum_color_mid_pos: p });
      updateBar(); drawFloat();
    });
    midDrag.addEventListener('pointerup', () => { if (!mdMoved) { activePSlot = 'mid'; picker.value = F.colorMid; picker.click(); hideTip(); } mdDrag = false; });
    midDrag.addEventListener('pointercancel', () => { mdDrag = false; });

    bar.appendChild(hiDot); bar.appendChild(midDrag); bar.appendChild(loDot);
    updateBar();
    grow.appendChild(em1); grow.appendChild(bar); grow.appendChild(em2);
    parent.appendChild(grow);

    const rrow = document.createElement('div'); rrow.className = 'cum-ext-rrow';
    rrow.addEventListener('pointerdown', ev => ev.stopPropagation());
    const resetBtn = document.createElement('button'); resetBtn.className = 'cum-ext-creset'; resetBtn.type = 'button';
    resetBtn.textContent = t('resetColors');
    resetBtn.addEventListener('click', () => {
      const D = C.DEFAULT_COLORS;
      F.colorHi = D.hi; F.colorMid = D.mid; F.colorLo = D.lo; F.colorMidPos = D.midPos;
      safeSet({ cum_color_hi: F.colorHi, cum_color_mid: F.colorMid, cum_color_lo: F.colorLo, cum_color_mid_pos: F.colorMidPos });
      drawFloat(); updateBar();
    });
    rrow.appendChild(resetBtn);
    parent.appendChild(rrow);
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  function applyData(data) {
    if (!C.isUsable(data)) return;
    const wasLoaded = S.loaded, prevPct = S.remainPct;
    S.remainPct = data.remainPct; S.resetMs = data.resetMs || 0;
    S.session = data.session || null; S.weekly = data.weekly || null;
    S.stale = !!data.stale; S.loaded = true;
    if (wasLoaded && prevPct < 40 && S.remainPct > 80) triggerBloom();
    drawFloat(); checkResetEffects();
  }

  function loadUsage() {
    if (!C.isCtxValid()) return;
    try {
      chrome.storage.local.get(dataKey(), (res) => { S.loaded = false; applyData(res[dataKey()]); if (!S.loaded) drawFloat(); });
    } catch (e) {}
  }

  // ── Storage listener ──────────────────────────────────────────────────────
  function setupStorageListener() {
    if (!C.isCtxValid()) return;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        try {
          if (dataKey() in changes)          applyData(changes[dataKey()].newValue);
          if ('cum_provider'      in changes) { F.provider    = C.USAGE_KEY[changes.cum_provider.newValue] ? changes.cum_provider.newValue : 'claude'; loadUsage(); }
          if ('cum_allpages'      in changes) { F.allPages    = !!changes.cum_allpages.newValue;   applyVisibility(); }
          if ('cum_fopacity'      in changes) { F.opacity     = changes.cum_fopacity.newValue ?? 1; applyVisibility(); }
          if ('cum_fwatermark'    in changes) { F.watermark   = !!changes.cum_fwatermark.newValue; applyVisibility(); }
          if ('cum_halo_active'   in changes) { F.haloActive  = changes.cum_halo_active.newValue ?? 1; }
          if ('cum_halo_idle'     in changes) { F.haloIdle    = changes.cum_halo_idle.newValue ?? 0.5; }
          if ('cum_color_hi'      in changes) { F.colorHi     = changes.cum_color_hi.newValue  || C.DEFAULT_COLORS.hi;  drawFloat(); }
          if ('cum_color_mid'     in changes) { F.colorMid    = changes.cum_color_mid.newValue || C.DEFAULT_COLORS.mid; drawFloat(); }
          if ('cum_color_lo'      in changes) { F.colorLo     = changes.cum_color_lo.newValue  || C.DEFAULT_COLORS.lo;  drawFloat(); }
          if ('cum_color_mid_pos' in changes) { F.colorMidPos = changes.cum_color_mid_pos.newValue ?? C.DEFAULT_COLORS.midPos; drawFloat(); }
          if ('cum_fsize'         in changes) { F.fsize       = changes.cum_fsize.newValue || 56; applyVisibility(); }
          if ('cum_fpos'          in changes && !dragging && changes.cum_fpos.newValue) {
            curRight = changes.cum_fpos.newValue.right; curBottom = changes.cum_fpos.newValue.bottom;
            floatEl.style.right = curRight + 'px'; floatEl.style.bottom = curBottom + 'px'; positionRz();
          }
          if ('cum_lang'          in changes) { lang = changes.cum_lang.newValue || C.guessLang(navigator.languages); applyLangToUi(); drawFloat(); }
        } catch(e) {}
      });
    } catch(e) {}
  }

  // ── Timer for reset effects (1 Hz, paused when hidden) ───────────────────
  let timer = null;
  function startTimer() {
    if (timer) return;
    timer = setInterval(() => {
      if (!C.isCtxValid()) { clearInterval(timer); timer = null; return; }
      if (!document.hidden) checkResetEffects();
    }, 1000);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (initialized) return;
    if (!document.body) { setTimeout(init, 50); return; }
    initialized = true;
    if (!C.isCtxValid()) return;
    injectStyles();
    try {
      chrome.storage.local.get(
        ['cum_allpages','cum_fopacity','cum_fwatermark','cum_fpos','cum_lang','cum_provider',
         'cum_halo_active','cum_halo_idle','cum_color_hi','cum_color_mid','cum_color_lo',
         'cum_fsize','cum_color_mid_pos'],
        (res) => {
          try {
            if (res.cum_lang) lang = res.cum_lang;
            F.provider    = C.USAGE_KEY[res.cum_provider] ? res.cum_provider : 'claude';
            F.allPages    = !!res.cum_allpages;
            F.opacity     = typeof res.cum_fopacity    === 'number' ? res.cum_fopacity    : 1.0;
            F.watermark   = !!res.cum_fwatermark;
            F.haloActive  = typeof res.cum_halo_active === 'number' ? res.cum_halo_active : 1.0;
            F.haloIdle    = typeof res.cum_halo_idle   === 'number' ? res.cum_halo_idle   : 0.5;
            F.colorHi     = res.cum_color_hi  || C.DEFAULT_COLORS.hi;
            F.colorMid    = res.cum_color_mid || C.DEFAULT_COLORS.mid;
            F.colorLo     = res.cum_color_lo  || C.DEFAULT_COLORS.lo;
            F.colorMidPos = typeof res.cum_color_mid_pos === 'number' ? res.cum_color_mid_pos : C.DEFAULT_COLORS.midPos;
            F.fsize       = typeof res.cum_fsize === 'number' ? res.cum_fsize : 56;

            createFloat();
            if (res.cum_fpos && typeof res.cum_fpos.right === 'number') {
              curRight = res.cum_fpos.right; curBottom = res.cum_fpos.bottom;
              floatEl.style.right = curRight + 'px'; floatEl.style.bottom = curBottom + 'px';
              floatEl.style.left = 'auto'; floatEl.style.top = 'auto';
            }
            applyVisibility();
            updateBloomKeyframes();
            loadUsage();
            setupStorageListener();
            startTimer();
          } catch(e) {}
        }
      );
    } catch(e) {}
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
