// float_only.js — Cross-page floating Claude icon (non-claude.ai pages)
// Activates only when cum_allpages is enabled. Uses storage for data sync.

(() => {
  'use strict';

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
  const CW = [2, 1, 0, 11, 10, 9, 8, 7, 6, 5, 4, 3];
  const EMPTY_PETAL = '#c5c1bb';

  // ── i18n ─────────────────────────────────────────────────────────────────
  let lang = 'zh';
  function t(k) {
    if (!window.CUM_I18N) return k;
    return (window.CUM_I18N[lang] || {})[k] || window.CUM_I18N.zh[k] || k;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const S = { remainPct: 100, resetMs: 0, session: null, loaded: false };
  const F = {
    allPages: false, opacity: 1.0, watermark: false,
    haloActive: 1.0, haloIdle: 0.5,
    colorHi: '#d97757', colorMid: '#c96442', colorLo: '#e05252',
    colorMidPos: 0.4, fsize: 56,
  };

  // ── DOM ───────────────────────────────────────────────────────────────────
  let floatEl, floatPaths = [], floatTipEl, ctxEl, rzEl;
  let activeSubMenus = [];
  let initialized = false;
  // Drag state
  let dragging = false, dragMoved = false, dragStartX = 0, dragStartY = 0;
  let curRight = 24, curBottom = 24;
  // Resize state
  let rzDragging = false, rzStartX = 0, rzStartY = 0, rzStartSize = 56;
  let rzStartRight = 24, rzStartBottom = 24;

  // ── Utils ─────────────────────────────────────────────────────────────────
  function isCtxValid() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch(e) { return false; }
  }
  function safeSet(obj) {
    if (!isCtxValid()) return;
    try { chrome.storage.local.set(obj); } catch(e) {}
  }
  const pad = n => String(n).padStart(2, '0');
  function usageColor() {
    const hi = Math.round((1 - F.colorMidPos) * 100);
    const lo = Math.round(hi * 0.5);
    return S.remainPct > hi ? F.colorHi : S.remainPct > lo ? F.colorMid : F.colorLo;
  }
  function updateBloomKeyframes() {
    const color = usageColor();
    let bloomStyle = document.getElementById('cum-ext-bloom-dynamic');
    if (!bloomStyle) {
      bloomStyle = document.createElement('style');
      bloomStyle.id = 'cum-ext-bloom-dynamic';
      document.head.appendChild(bloomStyle);
    }
    bloomStyle.textContent = `
      @keyframes cum-ext-bloom {
        0%{filter:drop-shadow(0 0 0px transparent)}
        25%{filter:drop-shadow(0 0 24px ${color}99)}
        60%{filter:drop-shadow(0 0 14px ${color}44)}
        100%{filter:drop-shadow(0 0 0px transparent)}
      }
    `;
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('cum-ext-style')) return;
    const s = document.createElement('style');
    s.id = 'cum-ext-style';
    s.textContent = `
      #cum-float-ext {
        position:fixed; z-index:2147483641;
        width:56px; height:56px; cursor:grab; user-select:none; display:none;
        bottom:24px; right:24px;
      }
      #cum-float-ext:active { cursor:grabbing; }
      #cum-float-ext svg { width:100%; height:100%; overflow:visible; }
      #cum-float-ext path { transition:fill 1.4s ease; }

      @keyframes cum-ext-warn  { 0%,100%{opacity:1} 50%{opacity:.4} }
      @keyframes cum-ext-blink { 0%,49%{opacity:1} 50%,100%{opacity:.12} }
      @keyframes cum-ext-bloom {
        0%{filter:drop-shadow(0 0 0px transparent)}
        25%{filter:drop-shadow(0 0 24px #d9775799)}
        60%{filter:drop-shadow(0 0 14px #d9775744)}
        100%{filter:drop-shadow(0 0 0px transparent)}
      }
      #cum-float-ext.cum-ext-warn    { animation: cum-ext-warn  1s ease-in-out infinite; }
      #cum-float-ext.cum-ext-blink   { animation: cum-ext-blink .35s step-end infinite; }
      #cum-float-ext.cum-ext-blooming { animation: cum-ext-bloom 1.5s ease-out forwards; }

      #cum-ftip-ext {
        position:fixed; z-index:2147483643; padding:5px 10px; border-radius:8px;
        font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        background:rgba(16,14,12,.88); backdrop-filter:blur(12px);
        border:1px solid rgba(217,119,87,.2); color:rgba(255,255,255,.85);
        white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .18s ease;
      }
      #cum-ftip-ext .tp { font-weight:600; }

      #cum-ctx-ext {
        position:fixed; z-index:2147483644; min-width:150px; border-radius:10px;
        background:rgba(22,20,18,.92); backdrop-filter:blur(16px);
        border:1px solid rgba(255,255,255,.1); box-shadow:0 8px 32px rgba(0,0,0,.5);
        overflow:hidden; display:none;
        font:13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      .cum-ext-item {
        padding:9px 14px; cursor:pointer; color:rgba(255,255,255,.82);
        display:flex; align-items:center; justify-content:space-between; gap:8px;
      }
      .cum-ext-item:hover { background:rgba(255,255,255,.08); }
      .cum-ext-item.danger { color:#e05252; }
      .cum-ext-sep { height:1px; background:rgba(255,255,255,.08); margin:2px 0; }
      .cum-ext-sub-hdr { font-size:11px; color:rgba(255,255,255,.35); padding:8px 14px 4px; cursor:default; }
      .cum-ext-check { color:#d97757; flex-shrink:0; }
      .cum-ext-arrow { color:rgba(255,255,255,.3); font-size:10px; flex-shrink:0; }

      .cum-ext-submenu {
        position:fixed; min-width:120px; border-radius:10px;
        background:rgba(22,20,18,.95); backdrop-filter:blur(16px);
        border:1px solid rgba(255,255,255,.1); box-shadow:0 8px 32px rgba(0,0,0,.5);
        overflow:hidden; display:none; z-index:2147483645;
        font:13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }

      .cum-ext-slider-row {
        padding:6px 14px 10px; display:flex; align-items:center; gap:8px;
      }
      .cum-ext-slider-row input[type=range] {
        flex:1; height:4px; appearance:none; background:rgba(255,255,255,.12);
        border-radius:2px; cursor:pointer;
      }
      .cum-ext-slider-row input[type=range]::-webkit-slider-thumb {
        appearance:none; width:11px; height:11px; border-radius:50%;
        background:#d97757; cursor:pointer;
      }
      .cum-ext-slider-val { font-size:11px; color:rgba(255,255,255,.4); width:28px; text-align:right; flex-shrink:0; }

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
        border-radius:50%; cursor:ew-resize;
        border:2.5px solid rgba(255,255,255,.65); background:rgba(20,18,16,.3);
        transform:translate(-50%,-50%);
      }
      .cum-ext-mid-drag:hover { border-color:rgba(255,255,255,.9); }
      .cum-ext-cbtn-row {
        padding:2px 14px 8px; display:flex; align-items:center; gap:5px;
      }
      .cum-ext-cbtn {
        flex:1; display:flex; align-items:center; justify-content:center; gap:4px;
        padding:4px 6px; border-radius:7px;
        background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08);
        color:rgba(255,255,255,.45); font-size:11px; cursor:pointer;
      }
      .cum-ext-cbtn:hover { background:rgba(255,255,255,.09); }
      .cum-ext-cbtn.active { border-color:#d97757; color:#d97757; background:rgba(217,119,87,.09); }
      .cum-ext-cswatch {
        width:9px; height:9px; border-radius:50%;
        border:1px solid rgba(255,255,255,.25); flex-shrink:0;
      }
      .cum-ext-creset {
        padding:4px 8px; border-radius:7px; font-size:13px;
        background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07);
        color:rgba(255,255,255,.25); cursor:pointer;
      }
      .cum-ext-creset:hover { background:rgba(224,82,82,.1); border-color:rgba(224,82,82,.2); color:rgba(224,82,82,.6); }

      #cum-rz-ext {
        position:fixed; z-index:2147483642; width:18px; height:18px;
        cursor:nwse-resize; display:none; opacity:0; transition:opacity .2s ease;
      }
      #cum-rz-ext.on { opacity:1; }
      #cum-rz-ext svg { pointer-events:none; }
    `;
    document.head.appendChild(s);
  }

  // ── Float icon ────────────────────────────────────────────────────────────
  function createFloat() {
    floatEl = document.createElement('div'); floatEl.id = 'cum-float-ext';

    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 100 101'); svg.setAttribute('fill','none');
    floatPaths = PETALS.map((p) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg','path');
      el.setAttribute('d', p.d); el.style.fill = F.colorHi;
      el.style.transformOrigin = '50px 50px';
      el.style.transform = `rotate(${p.r}deg) scaleY(${p.sy}) rotate(-${p.r}deg)`;
      svg.appendChild(el); return el;
    });
    floatEl.appendChild(svg);
    document.body.appendChild(floatEl);

    floatTipEl = document.createElement('div'); floatTipEl.id = 'cum-ftip-ext';
    document.body.appendChild(floatTipEl);

    ctxEl = document.createElement('div'); ctxEl.id = 'cum-ctx-ext';
    document.body.appendChild(ctxEl);

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
      const left = e.clientX - ox, top = e.clientY - oy;
      applyRB(cw - left - F.fsize, ch - top - F.fsize);
    });
    floatEl.addEventListener('pointerup', () => {
      if (!dragging) return;
      if (dragMoved) {
        safeSet({ cum_fpos: { right: curRight, bottom: curBottom } });
      }
      dragging = false; // AFTER safeSet to prevent storage self-trigger jitter
    });

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

    // ── Resize handle ─────────────────────────────────────────────────────
    rzEl = document.createElement('div'); rzEl.id = 'cum-rz-ext';
    rzEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
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
      rzStartSize = F.fsize;
      rzStartRight = curRight; rzStartBottom = curBottom;
      rzEl.setPointerCapture(e.pointerId);
    });
    rzEl.addEventListener('pointermove', (e) => {
      if (!rzDragging) return;
      const delta = Math.round((e.clientX - rzStartX + e.clientY - rzStartY) / 2);
      const newFsize = Math.max(24, Math.min(128, rzStartSize + delta));
      F.fsize = newFsize;
      // Keep top-left corner fixed: shift right/bottom as size grows
      applyRB(rzStartRight + rzStartSize - newFsize, rzStartBottom + rzStartSize - newFsize);
      applyVisibility();
    });
    rzEl.addEventListener('pointerup', () => {
      if (!rzDragging) return;
      rzDragging = false;
      safeSet({ cum_fsize: F.fsize });
    });
    rzEl.addEventListener('pointercancel', () => { rzDragging = false; });
  }

  function positionRz() {
    if (!rzEl) return;
    rzEl.style.right  = Math.max(0, curRight  - 6) + 'px';
    rzEl.style.bottom = Math.max(0, curBottom - 6) + 'px';
  }

  function applyVisibility() {
    if (!floatEl) return;
    floatEl.style.display       = F.allPages ? 'block' : 'none';
    // Watermark on cross-page: lower opacity + no drag, but stays interactive for right-click
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
    const col = usageColor();
    const n = Math.round(S.remainPct / 100 * 12);
    CW.forEach((idx, pos) => {
      floatPaths[idx].style.fill = pos < n ? col : EMPTY_PETAL;
    });
    updateBloomKeyframes();
  }

  // ── Reset countdown effects ───────────────────────────────────────────────
  function checkResetEffects() {
    if (!floatEl || !S.loaded || !F.allPages) return;
    const now = Date.now();
    const ms = S.session?.resetMs ?? S.resetMs ?? 0;
    if (ms <= 0 || ms <= now) {
      floatEl.classList.remove('cum-ext-warn', 'cum-ext-blink');
      return;
    }
    const diff = ms - now;
    if (diff <= 5000) {
      floatEl.classList.remove('cum-ext-warn');
      floatEl.classList.add('cum-ext-blink');
    } else if (diff <= 30000) {
      floatEl.classList.remove('cum-ext-blink');
      floatEl.classList.add('cum-ext-warn');
    } else {
      floatEl.classList.remove('cum-ext-warn', 'cum-ext-blink');
    }
  }

  function triggerBloom() {
    if (!floatEl) return;
    floatEl.classList.remove('cum-ext-blooming');
    void floatEl.offsetWidth; // reflow to restart animation
    floatEl.classList.add('cum-ext-blooming');
    setTimeout(() => floatEl && floatEl.classList.remove('cum-ext-blooming'), 1600);
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  function showTooltip() {
    if (!floatEl || !floatTipEl) return;
    const r = floatEl.getBoundingClientRect();
    const ms = S.session?.resetMs ?? S.resetMs ?? 0;
    const tipColor = usageColor();
    let resetText = '';
    if (ms > 0) {
      if (ms > Date.now()) {
        const d = new Date(ms);
        resetText = t('resetAt') + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      } else {
        resetText = t('newCycle');
      }
    }
    floatTipEl.innerHTML =
      `<span class="tp" style="color:${tipColor}">${S.remainPct}% ${t('remaining')}</span>` +
      (resetText ? `<br><span style="color:rgba(255,255,255,.5);font-size:11px">${resetText}</span>` : '');
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

    const item = (label, cls, action, badge, parent) => {
      const d = document.createElement('div');
      d.className = 'cum-ext-item' + (cls ? ' ' + cls : '');
      d.innerHTML = `<span>${label}</span>` + (badge ? `<span class="cum-ext-check">${badge}</span>` : '');
      d.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); hideCtx(); action(); });
      (parent || ctxEl).appendChild(d);
    };
    const sep = (parent) => {
      const d = document.createElement('div'); d.className = 'cum-ext-sep';
      (parent || ctxEl).appendChild(d);
    };
    const hdr = (label, parent) => {
      const d = document.createElement('div'); d.className = 'cum-ext-sub-hdr'; d.textContent = label;
      (parent || ctxEl).appendChild(d);
    };
    const subMenu = (label) => {
      const wrap = document.createElement('div');
      wrap.className = 'cum-ext-item';
      wrap.innerHTML = `<span>${label}</span><span class="cum-ext-arrow">▶</span>`;
      const sub = document.createElement('div');
      sub.className = 'cum-ext-submenu';
      document.body.appendChild(sub);
      activeSubMenus.push(sub);
      let hideTimer = null;
      const open = () => {
        clearTimeout(hideTimer);
        const r = wrap.getBoundingClientRect();
        sub.style.display = 'block';
        const sw = sub.offsetWidth, sh = sub.offsetHeight;
        let lx = r.right + 4;
        if (lx + sw > window.innerWidth) lx = r.left - sw - 4;
        let ly = r.top - 4;
        if (ly + sh > window.innerHeight) ly = r.bottom - sh;
        sub.style.left = Math.max(0, lx) + 'px';
        sub.style.top  = Math.max(0, ly) + 'px';
      };
      const close = () => { hideTimer = setTimeout(() => { sub.style.display = 'none'; }, 120); };
      wrap.addEventListener('mouseenter', open);
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
      slider.addEventListener('input', () => { valEl.textContent = slider.value + '%'; onInput(parseInt(slider.value) / 100); });
      row.appendChild(slider); row.appendChild(valEl);
      (parent || ctxEl).appendChild(row);
    };

    item(t('hideIcon'), 'danger', () => { F.allPages = false; safeSet({ cum_allpages: false }); applyVisibility(); });
    sep();
    item(t('watermark'), '', () => { F.watermark = !F.watermark; safeSet({ cum_fwatermark: F.watermark }); applyVisibility(); }, F.watermark ? '✓' : '');
    sep();

    hdr(t('opacity'));
    sliderRow(F.opacity, (v) => { F.opacity = v; if (floatEl) floatEl.style.opacity = String(v); safeSet({ cum_fopacity: v }); });
    sep();

    // Colors submenu
    const colorSub = subMenu(t('haloLabel'));
    hdr(t('activeIntensity'), colorSub);
    sliderRow(F.haloActive, (v) => { F.haloActive = v; safeSet({ cum_halo_active: v }); }, colorSub);
    hdr(t('idleIntensity'), colorSub);
    sliderRow(F.haloIdle, (v) => { F.haloIdle = v; safeSet({ cum_halo_idle: v }); }, colorSub);
    sep(colorSub);
    addGradientBarWidget(colorSub, hdr, sliderRow);
    sep();

    // Language submenu
    if (window.CUM_LANGS) {
      const langSub = subMenu(t('language'));
      window.CUM_LANGS.forEach((l) => {
        item(l.label, '', () => { lang = l.code; safeSet({ cum_lang: l.code }); drawFloat(); showTooltip(); }, lang === l.code ? '✓' : '', langSub);
      });
    }
  }

  function addGradientBarWidget(parent) {
    // ── Gradient bar row ──────────────────────────────────────────────────
    const grow = document.createElement('div');
    grow.style.cssText = 'padding:6px 14px 8px;display:flex;align-items:center;gap:6px;position:relative;';
    grow.addEventListener('pointerdown', ev => ev.stopPropagation());

    const em1 = document.createElement('span'); em1.textContent = '🔋'; em1.style.fontSize = '12px';
    const bar  = document.createElement('div');  bar.className = 'cum-ext-gbar';
    const em2  = document.createElement('span'); em2.textContent = '🪫'; em2.style.fontSize = '12px';

    // Shared hidden picker (reuse to avoid accumulation on context menu rebuild)
    const oldP = document.getElementById('cum-ext-cpicker');
    if (oldP) oldP.remove();
    const picker = document.createElement('input'); picker.type = 'color';
    picker.id = 'cum-ext-cpicker';
    picker.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px';
    document.body.appendChild(picker);

    // Hover tooltip
    const tip = document.createElement('div');
    tip.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:calc(100% - 2px);' +
      'background:rgba(16,14,12,.92);color:rgba(255,255,255,.75);font-size:10.5px;padding:3px 9px;' +
      'border-radius:5px;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .18s;' +
      'border:1px solid rgba(255,255,255,.1);z-index:1;';
    tip.textContent = t('clickColor');
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

    // Hi stop
    const hiDot = document.createElement('div'); hiDot.className = 'cum-ext-gstop hi';
    hiDot.style.background = F.colorHi;
    hiDot.addEventListener('pointerdown', ev => ev.stopPropagation());
    hiDot.addEventListener('click', () => { activePSlot = 'hi'; picker.value = F.colorHi; picker.click(); hideTip(); });
    hiDot.addEventListener('mouseenter', showTip);
    hiDot.addEventListener('mouseleave', hideTip);

    // Lo stop
    const loDot = document.createElement('div'); loDot.className = 'cum-ext-gstop lo';
    loDot.style.background = F.colorLo;
    loDot.addEventListener('pointerdown', ev => ev.stopPropagation());
    loDot.addEventListener('click', () => { activePSlot = 'lo'; picker.value = F.colorLo; picker.click(); hideTip(); });
    loDot.addEventListener('mouseenter', showTip);
    loDot.addEventListener('mouseleave', hideTip);

    // Mid drag handle (drag = position, click = color)
    const midDrag = document.createElement('div'); midDrag.className = 'cum-ext-mid-drag';
    midDrag.style.left = (F.colorMidPos * 100) + '%';
    midDrag.addEventListener('mouseenter', showTip);
    midDrag.addEventListener('mouseleave', hideTip);

    const updateBar = () => {
      const p = F.colorMidPos * 100;
      bar.style.background = `linear-gradient(to right,${F.colorHi},${F.colorMid} ${p}%,${F.colorLo})`;
      midDrag.style.left = p + '%';
      hiDot.style.background = F.colorHi;
      loDot.style.background = F.colorLo;
    };

    let mdDrag = false, mdMoved = false;
    midDrag.addEventListener('pointerdown', ev => {
      ev.stopPropagation(); ev.preventDefault();
      mdDrag = true; mdMoved = false;
      midDrag.setPointerCapture(ev.pointerId);
    });
    midDrag.addEventListener('pointermove', ev => {
      if (!mdDrag) return;
      const br = bar.getBoundingClientRect();
      let p = (ev.clientX - br.left) / br.width;
      p = Math.max(0.05, Math.min(0.95, p));
      if (Math.abs(p - F.colorMidPos) > 0.008) mdMoved = true;
      F.colorMidPos = p;
      safeSet({ cum_color_mid_pos: p });
      updateBar(); drawFloat();
    });
    midDrag.addEventListener('pointerup', () => {
      if (!mdMoved) {
        activePSlot = 'mid'; picker.value = F.colorMid; picker.click(); hideTip();
      }
      mdDrag = false;
    });
    midDrag.addEventListener('pointercancel', () => { mdDrag = false; });

    bar.appendChild(hiDot); bar.appendChild(midDrag); bar.appendChild(loDot);
    updateBar();
    grow.appendChild(em1); grow.appendChild(bar); grow.appendChild(em2);
    parent.appendChild(grow);

    // ── Reset button row ──────────────────────────────────────────────────
    const rrow = document.createElement('div');
    rrow.style.cssText = 'padding:0 14px 6px;display:flex;justify-content:flex-end;';
    rrow.addEventListener('pointerdown', ev => ev.stopPropagation());
    const resetBtn = document.createElement('button'); resetBtn.className = 'cum-ext-creset';
    resetBtn.textContent = t('resetColors');
    resetBtn.addEventListener('click', () => {
      F.colorHi = '#d97757'; F.colorMid = '#c96442'; F.colorLo = '#e05252'; F.colorMidPos = 0.4;
      safeSet({ cum_color_hi: F.colorHi, cum_color_mid: F.colorMid,
                cum_color_lo: F.colorLo, cum_color_mid_pos: F.colorMidPos });
      drawFloat(); updateBar();
    });
    rrow.appendChild(resetBtn);
    parent.appendChild(rrow);
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  function applyData(data) {
    if (!data || data.error || typeof data.remainPct !== 'number') return;
    const wasLoaded  = S.loaded;
    const prevPct    = S.remainPct;
    S.remainPct = data.remainPct;
    S.resetMs   = data.resetMs || 0;
    S.session   = data.session || null;
    S.loaded    = true;
    // Bloom on usage recovery (reset happened)
    if (wasLoaded && prevPct < 40 && S.remainPct > 80) triggerBloom();
    drawFloat();
    checkResetEffects();
  }

  // ── Storage listener ──────────────────────────────────────────────────────
  function setupStorageListener() {
    if (!isCtxValid()) return;
    try {
      chrome.storage.onChanged.addListener((changes) => {
        try {
          if ('usageData'          in changes) applyData(changes.usageData.newValue);
          if ('cum_allpages'       in changes) { F.allPages    = !!changes.cum_allpages.newValue;      applyVisibility(); }
          if ('cum_fopacity'       in changes) { F.opacity     = changes.cum_fopacity.newValue;        applyVisibility(); }
          if ('cum_fwatermark'     in changes) { F.watermark   = !!changes.cum_fwatermark.newValue;    applyVisibility(); }
          if ('cum_halo_active'    in changes) { F.haloActive  = changes.cum_halo_active.newValue; }
          if ('cum_halo_idle'      in changes) { F.haloIdle    = changes.cum_halo_idle.newValue;   }
          if ('cum_color_hi'       in changes) { F.colorHi     = changes.cum_color_hi.newValue;        drawFloat(); }
          if ('cum_color_mid'      in changes) { F.colorMid    = changes.cum_color_mid.newValue;       drawFloat(); }
          if ('cum_color_lo'       in changes) { F.colorLo     = changes.cum_color_lo.newValue;        drawFloat(); }
          if ('cum_color_mid_pos'  in changes) { F.colorMidPos = changes.cum_color_mid_pos.newValue || 0.4; drawFloat(); }
          if ('cum_fsize'          in changes) { F.fsize       = changes.cum_fsize.newValue;           applyVisibility(); }
          if ('cum_lang'           in changes) { lang = changes.cum_lang.newValue || 'zh'; }
        } catch(e) {}
      });
    } catch(e) {}
  }

  // ── RAF tick for reset effects ────────────────────────────────────────────
  let lastEffectSec = 0;
  function tick(ts) {
    if (!isCtxValid()) return;
    requestAnimationFrame(tick);
    if (ts - lastEffectSec > 980) { lastEffectSec = ts; checkResetEffects(); }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (initialized) return;
    initialized = true;
    injectStyles();
    if (!isCtxValid()) return;
    try {
      chrome.storage.local.get(
        ['cum_allpages','cum_fopacity','cum_fwatermark','cum_fpos',
         'cum_lang','cum_halo_active','cum_halo_idle',
         'cum_color_hi','cum_color_mid','cum_color_lo',
         'cum_fsize','cum_color_mid_pos','usageData'],
        (res) => {
          try {
            lang          = res.cum_lang          || 'zh';
            F.allPages    = !!res.cum_allpages;
            F.opacity     = typeof res.cum_fopacity     === 'number' ? res.cum_fopacity     : 1.0;
            F.watermark   = !!res.cum_fwatermark;
            F.haloActive  = typeof res.cum_halo_active === 'number' ? res.cum_halo_active : 1.0;
            F.haloIdle    = typeof res.cum_halo_idle   === 'number' ? res.cum_halo_idle   : 0.5;
            F.colorHi     = res.cum_color_hi  || '#d97757';
            F.colorMid    = res.cum_color_mid || '#c96442';
            F.colorLo     = res.cum_color_lo  || '#e05252';
            F.colorMidPos = typeof res.cum_color_mid_pos === 'number' ? res.cum_color_mid_pos : 0.4;
            F.fsize       = typeof res.cum_fsize === 'number' ? res.cum_fsize : 56;

            createFloat();

            if (res.cum_fpos && typeof res.cum_fpos.right === 'number') {
              curRight  = res.cum_fpos.right;
              curBottom = res.cum_fpos.bottom;
              floatEl.style.right  = curRight  + 'px';
              floatEl.style.bottom = curBottom + 'px';
              floatEl.style.left   = 'auto'; floatEl.style.top = 'auto';
            }

            applyVisibility();
            if (res.usageData) applyData(res.usageData);
            updateBloomKeyframes();

            setupStorageListener();
            requestAnimationFrame(tick);
          } catch(e) {}
        }
      );
    } catch(e) {}
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
