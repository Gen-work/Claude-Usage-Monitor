// content.js — Claude Usage Monitor v9
// Overlay is fixed/body-level, never touches React's DOM.

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
  function t(k) { return (window.CUM_I18N[lang] || {})[k] || window.CUM_I18N.zh[k] || k; }

  // ── State ─────────────────────────────────────────────────────────────────
  const S = { remainPct: 100, resetMs: 0, session: null, loaded: false, active: false };
  const F = {
    enabled: false, opacity: 1.0, watermark: false, zen: false, allPages: false,
    haloActive: 1.0, haloIdle: 0.5,
    colorHi: '#d97757', colorMid: '#c96442', colorLo: '#e05252',
    colorMidPos: 0.4, fsize: 56,
  };

  // ── DOM refs ──────────────────────────────────────────────────────────────
  let haloEl, sendRingEl, sendArc, inlineEl, cdSpan, tokSpan;
  let floatEl, floatPaths = [], floatTipEl, ctxEl, rzEl;
  let activeSubMenus = [];
  let srPrevVisible = false;
  let haloCssEl = null;
  let prevHasText = false;

  // ═════════════════════════════════════════════════════════════════════════
  //  STYLES
  // ═════════════════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById('cum-style')) return;
    const s = document.createElement('style');
    s.id = 'cum-style';
    s.textContent = `
      #cum-ov { position:fixed; inset:0; pointer-events:none; z-index:2147483640; overflow:visible; }

      #cum-halo { position:absolute; border-radius:20px; pointer-events:none; transition:box-shadow 1s ease,opacity .8s ease; }

      #cum-sr { position:absolute; width:40px; height:40px; pointer-events:none; opacity:0; }
      #cum-sr.ld  { opacity:0.5; }
      #cum-sr.act { opacity:1; }

      #cum-il {
        position:absolute; display:flex; align-items:center; gap:5px;
        font:12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        pointer-events:none; white-space:nowrap; opacity:0; transition:opacity .2s ease;
      }
      #cum-il.on { opacity:1; }
      #cum-il .val { font-weight:500; font-variant-numeric:tabular-nums; }
      #cum-il .sep { width:3px; height:3px; border-radius:50%; background:rgba(255,255,255,.2); }
      #cum-il .tok { color:rgba(255,255,255,.55); font-variant-numeric:tabular-nums; }
      #cum-il .tok-wrap {
        display:flex; align-items:center; gap:5px;
        overflow:hidden; max-width:0; opacity:0;
        transition:max-width .25s ease, opacity .2s ease;
      }
      #cum-il .tok-wrap.on { max-width:120px; opacity:1; }

      #cum-float {
        position:fixed; z-index:2147483641;
        width:56px; height:56px; cursor:grab; user-select:none; display:none;
      }
      #cum-float:active { cursor:grabbing; }
      #cum-float svg { width:100%; height:100%; overflow:visible; }
      #cum-float path { transition:fill 1.4s ease; }

      #cum-rz {
        position:fixed; z-index:2147483642; width:18px; height:18px;
        cursor:nwse-resize; pointer-events:auto;
        opacity:0; transition:opacity .2s ease; display:none;
      }
      #cum-rz.on { opacity:1; }

      #cum-ftip {
        position:fixed; z-index:2147483643; padding:5px 10px; border-radius:8px;
        font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        background:rgba(16,14,12,.88); backdrop-filter:blur(12px);
        border:1px solid rgba(217,119,87,.2); color:rgba(255,255,255,.85);
        white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .18s ease;
      }
      #cum-ftip .tp { font-weight:600; }

      #cum-ctx {
        position:fixed; z-index:2147483644; min-width:150px; border-radius:10px;
        background:rgba(22,20,18,.92); backdrop-filter:blur(16px);
        border:1px solid rgba(255,255,255,.1); box-shadow:0 8px 32px rgba(0,0,0,.5);
        overflow:hidden; display:none;
        font:13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      .cum-ctx-item {
        padding:9px 14px; cursor:pointer; color:rgba(255,255,255,.82);
        display:flex; align-items:center; justify-content:space-between; gap:8px;
      }
      .cum-ctx-item:hover { background:rgba(255,255,255,.08); }
      .cum-ctx-item.danger { color:#e05252; }
      .cum-ctx-sep { height:1px; background:rgba(255,255,255,.08); margin:2px 0; }
      .cum-ctx-sub-hdr { font-size:11px; color:rgba(255,255,255,.35); padding:8px 14px 4px; cursor:default; }
      .cum-ctx-check { color:#d97757; flex-shrink:0; }
      .cum-ctx-arrow { color:rgba(255,255,255,.3); font-size:10px; flex-shrink:0; }

      .cum-submenu-fixed {
        position:fixed; min-width:120px; border-radius:10px;
        background:rgba(22,20,18,.95); backdrop-filter:blur(16px);
        border:1px solid rgba(255,255,255,.1); box-shadow:0 8px 32px rgba(0,0,0,.5);
        overflow:hidden; display:none; z-index:2147483645;
        font:13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }

      .cum-ctx-slider-row {
        padding:6px 14px 10px; display:flex; align-items:center; gap:8px;
      }
      .cum-ctx-slider-row input[type=range] {
        flex:1; height:4px; appearance:none; background:rgba(255,255,255,.12);
        border-radius:2px; cursor:pointer;
      }
      .cum-ctx-slider-row input[type=range]::-webkit-slider-thumb {
        appearance:none; width:11px; height:11px; border-radius:50%;
        background:#d97757; cursor:pointer;
      }
      .cum-ctx-slider-val { font-size:11px; color:rgba(255,255,255,.4); width:28px; text-align:right; flex-shrink:0; }

      .cum-ctx-color-row {
        padding:4px 14px 6px; display:flex; align-items:center; gap:8px;
      }
      .cum-ctx-color-row input[type=color] {
        width:26px; height:22px; border:1px solid rgba(255,255,255,.15); border-radius:4px;
        background:none; cursor:pointer; padding:0;
      }
      .cum-ctx-color-label { font-size:11px; color:rgba(255,255,255,.45); }

      .cum-ctx-gbar { flex:1; height:16px; border-radius:8px; position:relative; border:1px solid rgba(255,255,255,.1); }
      .cum-ctx-gstop {
        position:absolute; top:50%; width:16px; height:16px;
        border-radius:50%; border:2px solid rgba(255,255,255,.5); cursor:pointer;
        transform:translateY(-50%);
      }
      .cum-ctx-gstop:hover { border-color:rgba(255,255,255,.9); }
      .cum-ctx-gstop.hi { left:-4px; }
      .cum-ctx-gstop.lo { right:-4px; left:auto; }
      .cum-ctx-mid-drag {
        position:absolute; top:50%; width:16px; height:16px;
        border-radius:50%; cursor:ew-resize;
        border:2.5px solid rgba(255,255,255,.65); background:rgba(20,18,16,.3);
        transform:translate(-50%,-50%);
      }
      .cum-ctx-mid-drag:hover { border-color:rgba(255,255,255,.9); }
      .cum-ctx-cbtn-row {
        padding:2px 14px 8px; display:flex; align-items:center; gap:5px;
      }
      .cum-ctx-cbtn {
        flex:1; display:flex; align-items:center; justify-content:center; gap:4px;
        padding:4px 6px; border-radius:7px;
        background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08);
        color:rgba(255,255,255,.45); font-size:11px; cursor:pointer;
      }
      .cum-ctx-cbtn:hover { background:rgba(255,255,255,.09); }
      .cum-ctx-cbtn.active { border-color:#d97757; color:#d97757; background:rgba(217,119,87,.09); }
      .cum-ctx-cswatch {
        width:9px; height:9px; border-radius:50%;
        border:1px solid rgba(255,255,255,.25); flex-shrink:0;
      }
      .cum-ctx-creset {
        padding:4px 8px; border-radius:7px; font-size:13px;
        background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07);
        color:rgba(255,255,255,.25); cursor:pointer;
      }
      .cum-ctx-creset:hover { background:rgba(224,82,82,.1); border-color:rgba(224,82,82,.2); color:rgba(224,82,82,.6); }
    `;
    document.head.appendChild(s);
    injectHaloCSS();
  }

  // Dynamic halo keyframes — regenerated when custom colors change
  function injectHaloCSS() {
    if (haloCssEl) haloCssEl.remove();
    haloCssEl = document.createElement('style');
    haloCssEl.id = 'cum-halo-css';
    const hi = F.colorHi, mid = F.colorMid, lo = F.colorLo;
    haloCssEl.textContent = `
      @keyframes h-idle-hi  { 0%,100%{box-shadow:0 0 9px 2px ${hi}22,0 0 20px 4px ${hi}0d} 50%{box-shadow:0 0 14px 3px ${hi}3a,0 0 30px 7px ${hi}16} }
      @keyframes h-idle-mid { 0%,100%{box-shadow:0 0 7px 2px ${mid}1e,0 0 17px 3px ${mid}0a} 50%{box-shadow:0 0 11px 2px ${mid}32,0 0 24px 5px ${mid}12} }
      @keyframes h-idle-lo  { 0%,100%{box-shadow:0 0 6px 2px ${lo}28,0 0 15px 3px ${lo}0e}     50%{box-shadow:0 0 10px 3px ${lo}44,0 0 24px 6px ${lo}18}  }
      @keyframes h-on-hi    { 0%,100%{box-shadow:0 0 0 1px ${hi}38,0 0 16px 5px ${hi}50,0 0 38px 10px ${hi}1e} 50%{box-shadow:0 0 0 1px ${hi}55,0 0 24px 8px ${hi}6a,0 0 52px 14px ${hi}28} }
      @keyframes h-on-mid   { 0%,100%{box-shadow:0 0 0 1px ${mid}2e,0 0 13px 4px ${mid}3c,0 0 32px 8px ${mid}16} 50%{box-shadow:0 0 0 1px ${mid}48,0 0 20px 6px ${mid}52,0 0 42px 11px ${mid}20} }
      @keyframes h-on-lo    { 0%,100%{box-shadow:0 0 0 1px ${lo}3c,0 0 13px 4px ${lo}4a,0 0 30px 8px ${lo}1c}        50%{box-shadow:0 0 0 1px ${lo}66,0 0 22px 6px ${lo}70,0 0 44px 11px ${lo}2a}        }
      @keyframes h-on-empty { 0%,100%{box-shadow:0 0 0 2px ${lo}70,0 0 18px 5px ${lo}88,0 0 38px 10px ${lo}30}       50%{box-shadow:0 0 0 2px ${lo}a0,0 0 28px 8px ${lo}aa,0 0 52px 14px ${lo}40}       }
    `;
    document.head.appendChild(haloCssEl);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  OVERLAY
  // ═════════════════════════════════════════════════════════════════════════
  function createOverlay() {
    const ov = document.createElement('div'); ov.id = 'cum-ov';

    haloEl = document.createElement('div'); haloEl.id = 'cum-halo';
    ov.appendChild(haloEl);

    sendRingEl = document.createElement('div'); sendRingEl.id = 'cum-sr';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox','0 0 40 40'); svg.setAttribute('width','40'); svg.setAttribute('height','40');
    const tr = document.createElementNS('http://www.w3.org/2000/svg','rect');
    tr.setAttribute('x','2'); tr.setAttribute('y','2'); tr.setAttribute('width','36'); tr.setAttribute('height','36');
    tr.setAttribute('rx','10'); tr.setAttribute('ry','10'); tr.setAttribute('fill','none');
    tr.setAttribute('stroke','rgba(255,255,255,0.07)'); tr.setAttribute('stroke-width','2'); tr.setAttribute('pathLength','100');
    svg.appendChild(tr);
    sendArc = document.createElementNS('http://www.w3.org/2000/svg','rect');
    sendArc.setAttribute('x','2'); sendArc.setAttribute('y','2'); sendArc.setAttribute('width','36'); sendArc.setAttribute('height','36');
    sendArc.setAttribute('rx','10'); sendArc.setAttribute('ry','10'); sendArc.setAttribute('fill','none');
    sendArc.setAttribute('stroke', F.colorHi); sendArc.setAttribute('stroke-width','2');
    sendArc.setAttribute('stroke-linecap','round'); sendArc.setAttribute('pathLength','100');
    sendArc.setAttribute('stroke-dasharray','100'); sendArc.setAttribute('stroke-dashoffset','100');
    sendArc.style.transition = 'stroke-dashoffset .7s ease, stroke .5s ease';
    svg.appendChild(sendArc);
    sendRingEl.appendChild(svg);
    ov.appendChild(sendRingEl);

    inlineEl = document.createElement('div'); inlineEl.id = 'cum-il';
    inlineEl.innerHTML =
      '<span class="val" id="cum-cd"></span>' +
      '<div class="tok-wrap" id="cum-tw"><div class="sep"></div><span class="tok" id="cum-tok"></span></div>';
    ov.appendChild(inlineEl);

    document.body.appendChild(ov);
    cdSpan  = document.getElementById('cum-cd');
    tokSpan = document.getElementById('cum-tok');
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  FLOATING CLAUDE ICON
  // ═════════════════════════════════════════════════════════════════════════
  function createFloat() {
    floatEl = document.createElement('div'); floatEl.id = 'cum-float';
    Object.assign(floatEl.style, { bottom:'24px', right:'24px', left:'auto', top:'auto' });

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

    floatTipEl = document.createElement('div'); floatTipEl.id = 'cum-ftip';
    document.body.appendChild(floatTipEl);

    ctxEl = document.createElement('div'); ctxEl.id = 'cum-ctx';
    document.body.appendChild(ctxEl);

    // ── Drag ──────────────────────────────────────────────────────────────
    let dragging = false, ox = 0, oy = 0;

    function applyRB(right, bottom) {
      right  = Math.max(0, Math.min(right,  window.innerWidth  - F.fsize));
      bottom = Math.max(0, Math.min(bottom, window.innerHeight - F.fsize));
      floatEl.style.right  = right  + 'px';
      floatEl.style.bottom = bottom + 'px';
      floatEl.style.left   = 'auto';
      floatEl.style.top    = 'auto';
    }

    floatEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); dragging = true;
      const r = floatEl.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      floatEl.setPointerCapture(e.pointerId);
    });
    floatEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const left = e.clientX - ox, top = e.clientY - oy;
      applyRB(window.innerWidth - left - F.fsize, window.innerHeight - top - F.fsize);
      floatTipEl.style.left   = (left + F.fsize / 2) + 'px';
      floatTipEl.style.bottom = (window.innerHeight - top + 8) + 'px';
    });
    floatEl.addEventListener('pointerup', () => {
      dragging = false;
      const r = floatEl.getBoundingClientRect();
      safeSet({ cum_fpos: { right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom } });
    });

    // ── Hover ─────────────────────────────────────────────────────────────
    floatEl.addEventListener('mouseenter', () => { showTooltip(); showRz(); });
    floatEl.addEventListener('mouseleave', (e) => {
      if (!rzEl || !rzEl.contains(e.relatedTarget)) {
        floatTipEl.style.opacity = '0';
        if (!rzEl || !rzEl.matches(':hover')) rzEl.classList.remove('on');
      }
    });

    // ── Context menu ──────────────────────────────────────────────────────
    floatEl.addEventListener('contextmenu', showCtx);
    document.addEventListener('pointerdown', (e) => {
      const outside = ctxEl && !ctxEl.contains(e.target) &&
                      !activeSubMenus.some(s => s.contains(e.target));
      if (outside) hideCtx();
    }, { passive: true });
  }

  // ─── Tooltip — dynamic colors + absolute reset time ──────────────────────
  function showTooltip() {
    if (!floatEl) return;
    const r = floatEl.getBoundingClientRect();
    const ms = S.session?.resetMs ?? S.resetMs ?? 0;
    const tipColor = usageColor();
    let resetText = '—';
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
      (resetText !== '—' ? `<br><span style="color:rgba(255,255,255,.5);font-size:11px">${resetText}</span>` : '');
    floatTipEl.style.left      = (r.left + r.width / 2) + 'px';
    floatTipEl.style.bottom    = (window.innerHeight - r.top + 8) + 'px';
    floatTipEl.style.top       = 'auto';
    floatTipEl.style.transform = 'translateX(-50%)';
    floatTipEl.style.opacity   = '1';
  }

  function usageColor() {
    const hi = Math.round((1 - F.colorMidPos) * 100);
    const lo = Math.round(hi * 0.5);
    return S.remainPct > hi ? F.colorHi : S.remainPct > lo ? F.colorMid : F.colorLo;
  }

  function showRz() { if (rzEl && !F.watermark && !F.zen) rzEl.classList.add('on'); }

  // ─── Context menu ─────────────────────────────────────────────────────────
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

  // ═════════════════════════════════════════════════════════════════════════
  //  RESIZE HANDLE — center-fixed, disabled in watermark / zen
  // ═════════════════════════════════════════════════════════════════════════
  function createResizeHandle() {
    rzEl = document.createElement('div'); rzEl.id = 'cum-rz';
    rzEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M10 2 L10 10 L2 10" stroke="rgba(255,255,255,.85)"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    document.body.appendChild(rzEl);

    let rzDrag = false, rzCenterX = 0, rzCenterY = 0;

    rzEl.addEventListener('mouseenter', () => { if (!F.watermark && !F.zen) { showRz(); showTooltip(); } });
    rzEl.addEventListener('mouseleave', (e) => {
      if (!floatEl || !floatEl.contains(e.relatedTarget)) {
        rzEl.classList.remove('on');
        if (floatTipEl) floatTipEl.style.opacity = '0';
      }
    });

    rzEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || F.watermark || F.zen) return;
      e.preventDefault(); e.stopPropagation();
      rzDrag = true;
      const fr = floatEl.getBoundingClientRect();
      rzCenterX = fr.left + fr.width / 2;
      rzCenterY = fr.top + fr.height / 2;
      rzEl.setPointerCapture(e.pointerId); hideCtx();
    });
    rzEl.addEventListener('pointermove', (e) => {
      if (!rzDrag) return;
      const dx = e.clientX - rzCenterX;
      const dy = e.clientY - rzCenterY;
      const ns = Math.max(32, Math.min(120, Math.round(2 * Math.max(dx, dy))));
      if (ns !== F.fsize) {
        const diff = (ns - F.fsize) / 2;
        const curRight  = parseFloat(floatEl.style.right)  || 0;
        const curBottom = parseFloat(floatEl.style.bottom) || 0;
        F.fsize = ns;
        floatEl.style.width  = ns + 'px';
        floatEl.style.height = ns + 'px';
        floatEl.style.right  = (curRight  - diff) + 'px';
        floatEl.style.bottom = (curBottom - diff) + 'px';
        showTooltip();
      }
    });
    rzEl.addEventListener('pointerup', () => {
      if (!rzDrag) return;
      rzDrag = false;
      safeSet({ cum_fsize: F.fsize });
      const r = floatEl.getBoundingClientRect();
      safeSet({ cum_fpos: { right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom } });
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  CONTEXT MENU
  // ═════════════════════════════════════════════════════════════════════════
  function buildCtx() {
    activeSubMenus.forEach(s => { try { s.remove(); } catch(e){} });
    activeSubMenus = [];
    ctxEl.innerHTML = '';

    const item = (label, cls, action, badge, parent) => {
      const d = document.createElement('div');
      d.className = 'cum-ctx-item' + (cls ? ' ' + cls : '');
      d.innerHTML = `<span>${label}</span>` + (badge ? `<span class="cum-ctx-check">${badge}</span>` : '');
      d.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); hideCtx(); action(); });
      (parent || ctxEl).appendChild(d);
    };
    const sep = (parent) => {
      const d = document.createElement('div'); d.className = 'cum-ctx-sep';
      (parent || ctxEl).appendChild(d);
    };
    const hdr = (label, parent) => {
      const d = document.createElement('div'); d.className = 'cum-ctx-sub-hdr'; d.textContent = label;
      (parent || ctxEl).appendChild(d);
    };

    const subMenu = (label) => {
      const wrap = document.createElement('div');
      wrap.className = 'cum-ctx-item';
      wrap.innerHTML = `<span>${label}</span><span class="cum-ctx-arrow">▶</span>`;
      const sub = document.createElement('div');
      sub.className = 'cum-submenu-fixed';
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
      const row = document.createElement('div'); row.className = 'cum-ctx-slider-row';
      row.addEventListener('pointerdown', ev => ev.stopPropagation());
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '5';
      slider.value = String(Math.round(initVal * 100));
      const valEl = document.createElement('span'); valEl.className = 'cum-ctx-slider-val';
      valEl.textContent = slider.value + '%';
      slider.addEventListener('input', () => { valEl.textContent = slider.value + '%'; onInput(parseInt(slider.value) / 100); });
      row.appendChild(slider); row.appendChild(valEl);
      (parent || ctxEl).appendChild(row);
    };

    const colorRow = (label, color, onChange, parent) => {
      const row = document.createElement('div'); row.className = 'cum-ctx-color-row';
      row.addEventListener('pointerdown', ev => ev.stopPropagation());
      const lbl = document.createElement('span'); lbl.className = 'cum-ctx-color-label';
      lbl.textContent = label;
      const input = document.createElement('input');
      input.type = 'color'; input.value = color;
      input.addEventListener('input', () => onChange(input.value));
      input.addEventListener('pointerdown', ev => ev.stopPropagation());
      row.appendChild(lbl); row.appendChild(input);
      (parent || ctxEl).appendChild(row);
    };

    // ── Menu items ────────────────────────────────────────────────────────
    item(t('hideIcon'), 'danger', () => { F.enabled = false; applyFloatVisibility(); safeSet({ cum_fenabled: false }); });
    sep();
    item(t('watermark'), '', () => { F.watermark = !F.watermark; safeSet({ cum_fwatermark: F.watermark }); applyFloatVisibility(); }, F.watermark ? '✓' : '');
    item(t('allPages'), '', () => { F.allPages = !F.allPages; safeSet({ cum_allpages: F.allPages }); }, F.allPages ? '✓' : '');
    sep();

    // Opacity — slider
    hdr(t('opacity'));
    sliderRow(F.opacity, (v) => { F.opacity = v; floatEl.style.opacity = String(v); safeSet({ cum_fopacity: v }); });
    sep();

    // Halo — flyout submenu
    const haloSub = subMenu(t('haloLabel'));
    hdr(t('activeIntensity'), haloSub);
    sliderRow(F.haloActive, (v) => { F.haloActive = v; drawHalo(); safeSet({ cum_halo_active: v }); }, haloSub);
    hdr(t('idleIntensity'), haloSub);
    sliderRow(F.haloIdle, (v) => { F.haloIdle = v; drawHalo(); safeSet({ cum_halo_idle: v }); }, haloSub);
    sep(haloSub);
    addGradientBarWidget(haloSub);
    sep();

    // Language — flyout submenu
    const langSub = subMenu(t('language'));
    window.CUM_LANGS.forEach((l) => {
      item(l.label, '', () => { lang = l.code; safeSet({ cum_lang: l.code }); draw(); }, lang === l.code ? '✓' : '', langSub);
    });
  }

  function hideCtx() {
    if (ctxEl) ctxEl.style.display = 'none';
    activeSubMenus.forEach(s => { s.style.display = 'none'; });
  }

  // ── Gradient bar widget (shared by context menu halo submenu) ─────────────
  function addGradientBarWidget(parent) {
    // ── Gradient bar row ──────────────────────────────────────────────────
    const grow = document.createElement('div');
    grow.style.cssText = 'padding:6px 14px 8px;display:flex;align-items:center;gap:6px;position:relative;';
    grow.addEventListener('pointerdown', ev => ev.stopPropagation());

    const em1 = document.createElement('span'); em1.textContent = '🔋'; em1.style.fontSize = '12px';
    const bar  = document.createElement('div');  bar.className = 'cum-ctx-gbar';
    const em2  = document.createElement('span'); em2.textContent = '🪫'; em2.style.fontSize = '12px';

    // Shared hidden picker (reuse to avoid accumulation on context menu rebuild)
    const oldP = document.getElementById('cum-ctx-cpicker');
    if (oldP) oldP.remove();
    const picker = document.createElement('input'); picker.type = 'color';
    picker.id = 'cum-ctx-cpicker';
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
      injectHaloCSS(); drawHalo(); drawSendRing(); drawFloat(); updateBar();
    });

    // Hi stop
    const hiDot = document.createElement('div'); hiDot.className = 'cum-ctx-gstop hi';
    hiDot.style.background = F.colorHi;
    hiDot.addEventListener('pointerdown', ev => ev.stopPropagation());
    hiDot.addEventListener('click', () => { activePSlot = 'hi'; picker.value = F.colorHi; picker.click(); hideTip(); });
    hiDot.addEventListener('mouseenter', showTip);
    hiDot.addEventListener('mouseleave', hideTip);

    // Lo stop
    const loDot = document.createElement('div'); loDot.className = 'cum-ctx-gstop lo';
    loDot.style.background = F.colorLo;
    loDot.addEventListener('pointerdown', ev => ev.stopPropagation());
    loDot.addEventListener('click', () => { activePSlot = 'lo'; picker.value = F.colorLo; picker.click(); hideTip(); });
    loDot.addEventListener('mouseenter', showTip);
    loDot.addEventListener('mouseleave', hideTip);

    // Mid drag handle (drag = position, click = color)
    const midDrag = document.createElement('div'); midDrag.className = 'cum-ctx-mid-drag';
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
      updateBar(); injectHaloCSS(); drawHalo(); drawSendRing();
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
    const resetBtn = document.createElement('button'); resetBtn.className = 'cum-ctx-creset';
    resetBtn.textContent = t('resetColors');
    resetBtn.addEventListener('click', () => {
      F.colorHi = '#d97757'; F.colorMid = '#c96442'; F.colorLo = '#e05252'; F.colorMidPos = 0.4;
      safeSet({ cum_color_hi: F.colorHi, cum_color_mid: F.colorMid,
                cum_color_lo: F.colorLo, cum_color_mid_pos: F.colorMidPos });
      injectHaloCSS(); drawHalo(); drawSendRing(); drawFloat(); updateBar();
    });
    rrow.appendChild(resetBtn);
    parent.appendChild(rrow);
  }

  function applyFloatVisibility() {
    if (!floatEl) return;
    if (F.zen) {
      floatEl.style.display = 'none';
      if (rzEl) { rzEl.style.display = 'none'; rzEl.classList.remove('on'); }
      return;
    }
    floatEl.style.display       = F.enabled ? 'block' : 'none';
    floatEl.style.opacity       = String(F.opacity);
    floatEl.style.pointerEvents = F.watermark ? 'none' : 'auto';
    floatEl.style.cursor        = F.watermark ? 'default' : 'grab';
    floatEl.style.width         = F.fsize + 'px';
    floatEl.style.height        = F.fsize + 'px';
    if (rzEl) {
      rzEl.style.display = F.enabled && !F.watermark ? 'block' : 'none';
      rzEl.classList.remove('on');
    }
  }

  function drawFloat() {
    if (F.zen || !F.enabled || !floatPaths.length || !S.loaded) return;
    const col = usageColor();
    const n = Math.round(S.remainPct / 100 * 12);
    CW.forEach((idx, pos) => {
      floatPaths[idx].style.fill = pos < n ? col : EMPTY_PETAL;
    });
  }

  function loadFloatSettings() {
    if (!isCtxValid()) return;
    try {
      chrome.storage.local.get(
        ['cum_fenabled','cum_fopacity','cum_fwatermark','cum_fpos','cum_lang',
         'cum_halo_active','cum_halo_idle','cum_color_hi','cum_color_mid','cum_color_lo',
         'cum_fsize','cum_zen','cum_allpages','cum_color_mid_pos'],
        (res) => {
          try {
            lang           = res.cum_lang         || 'zh';
            F.enabled      = !!res.cum_fenabled;
            F.opacity      = typeof res.cum_fopacity    === 'number' ? res.cum_fopacity    : 1.0;
            F.watermark    = !!res.cum_fwatermark;
            F.zen          = !!res.cum_zen;
            F.allPages     = !!res.cum_allpages;
            F.haloActive   = typeof res.cum_halo_active === 'number' ? res.cum_halo_active : 1.0;
            F.haloIdle     = typeof res.cum_halo_idle   === 'number' ? res.cum_halo_idle   : 0.5;
            F.colorHi      = res.cum_color_hi  || '#d97757';
            F.colorMid     = res.cum_color_mid || '#c96442';
            F.colorLo      = res.cum_color_lo  || '#e05252';
            F.colorMidPos  = typeof res.cum_color_mid_pos === 'number' ? res.cum_color_mid_pos : 0.4;
            F.fsize        = typeof res.cum_fsize === 'number' ? res.cum_fsize : 56;
            if (res.cum_fpos && typeof res.cum_fpos.right === 'number') {
              floatEl.style.right  = res.cum_fpos.right  + 'px';
              floatEl.style.bottom = res.cum_fpos.bottom + 'px';
              floatEl.style.left   = 'auto'; floatEl.style.top = 'auto';
            }
            injectHaloCSS();
            applyFloatVisibility(); drawFloat();
          } catch(e) {}
        }
      );
    } catch(e) {}
  }

  function setupStorageListener() {
    if (!isCtxValid()) return;
    try {
      chrome.storage.onChanged.addListener((changes) => {
        try {
          if ('cum_fenabled'    in changes) { F.enabled    = changes.cum_fenabled.newValue;    applyFloatVisibility(); }
          if ('cum_fopacity'    in changes) { F.opacity    = changes.cum_fopacity.newValue;    if (floatEl) floatEl.style.opacity = String(F.opacity); }
          if ('cum_fwatermark'  in changes) { F.watermark  = changes.cum_fwatermark.newValue;  applyFloatVisibility(); }
          if ('cum_zen'         in changes) { F.zen        = !!changes.cum_zen.newValue;       applyFloatVisibility(); draw(); }
          if ('cum_halo_active' in changes) { F.haloActive = changes.cum_halo_active.newValue; drawHalo(); }
          if ('cum_halo_idle'   in changes) { F.haloIdle   = changes.cum_halo_idle.newValue;   drawHalo(); }
          // Keep float redraws on every color tier: drawFloat() derives its color from usageColor().
          if ('cum_color_hi'    in changes) { F.colorHi    = changes.cum_color_hi.newValue;    injectHaloCSS(); drawHalo(); drawSendRing(); drawFloat(); }
          if ('cum_color_mid'   in changes) { F.colorMid   = changes.cum_color_mid.newValue;   injectHaloCSS(); drawHalo(); drawSendRing(); drawFloat(); }
          if ('cum_color_lo'      in changes) { F.colorLo      = changes.cum_color_lo.newValue;      injectHaloCSS(); drawHalo(); drawSendRing(); drawFloat(); }
          if ('cum_color_mid_pos' in changes) { F.colorMidPos  = changes.cum_color_mid_pos.newValue || 0.4; draw(); }
          if ('cum_allpages'      in changes) { F.allPages     = !!changes.cum_allpages.newValue; }
          if ('cum_fsize'         in changes) { F.fsize        = changes.cum_fsize.newValue;       applyFloatVisibility(); }
          if ('cum_lang'          in changes) { lang           = changes.cum_lang.newValue || 'zh'; draw(); }
        } catch(e) {}
      });
    } catch(e) {}
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  FINDERS — cached to avoid querySelector on every RAF frame / mouse event
  // ═════════════════════════════════════════════════════════════════════════
  const _q = { input: null, sendBtn: null, modelBtn: null, container: null };

  function invalidateQueryCache() {
    _q.input = _q.sendBtn = _q.modelBtn = _q.container = null;
  }

  function findInput() {
    if (_q.input && document.contains(_q.input)) return _q.input;
    return (_q.input = document.querySelector('[data-testid="chat-input"]'));
  }
  function findModelBtn() {
    if (_q.modelBtn && document.contains(_q.modelBtn)) return _q.modelBtn;
    return (_q.modelBtn = document.querySelector('[data-testid="model-selector-dropdown"]'));
  }
  function findSendBtn() {
    if (_q.sendBtn && document.contains(_q.sendBtn)) return _q.sendBtn;
    return (_q.sendBtn = document.querySelector('button[aria-label="Send message"]'));
  }

  function findContainer(input) {
    if (_q.container && _q.input === input && document.contains(_q.container)) return _q.container;
    let el = input.parentElement;
    for (let i = 0; i < 14; i++) {
      if (!el) break;
      if ((el.className || '').includes('rounded-[20px]')) return (_q.container = el);
      el = el.parentElement;
    }
    return (_q.container = input.parentElement);
  }

  // Detect send button going away: check computed opacity + input text
  function isSendVisible() {
    const sb = findSendBtn(); if (!sb) return false;
    // If input has no text, send button is (about to be) gone
    const inp = findInput();
    if (inp && !(inp.innerText || '').replace(/\n/g, '').trim()) return false;
    let el = sb.parentElement;
    for (let i = 0; i < 4; i++) {
      if (!el) break;
      if (el.style && el.style.opacity === '0') return false;
      try {
        if (parseFloat(getComputedStyle(el).opacity) < 0.9) return false;
      } catch(e) {}
      el = el.parentElement;
    }
    return true;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  EVENT WIRING
  // ═════════════════════════════════════════════════════════════════════════
  let wiredInput = null;
  function wireInput(input) {
    if (wiredInput === input) return;
    wiredInput = input;
    input.addEventListener('focus', () => { S.active = true;  draw(); });
    input.addEventListener('blur',  () => { S.active = false; draw(); });
    input.addEventListener('input', refreshTok);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  POSITIONING
  // ═════════════════════════════════════════════════════════════════════════
  function reposition() {
    const input = findInput();
    if (!input) { haloEl.style.opacity = '0'; return; }
    wireInput(input);

    const container = findContainer(input);
    const cr = container.getBoundingClientRect();

    // Halo always positioned (even in zen — it's the only visible element)
    Object.assign(haloEl.style, {
      left: cr.left + 'px', top: cr.top + 'px',
      width: cr.width + 'px', height: cr.height + 'px',
    });

    // ── Send ring ────────────────────────────────────────────────────────
    if (F.zen) {
      if (srPrevVisible) {
        sendRingEl.style.transition = 'none';
        sendRingEl.style.opacity = '0';
        sendRingEl.classList.remove('act', 'ld');
        srPrevVisible = false;
      }
    } else {
      // Track text clearing for instant hide
      const hasText = !!(input && (input.innerText || '').replace(/\n/g, '').trim());
      if (!hasText && prevHasText) {
        sendRingEl.style.transition = 'none';
        sendRingEl.style.opacity = '0';
        sendRingEl.classList.remove('act', 'ld');
        srPrevVisible = false;
      }
      prevHasText = hasText;

      const sb = findSendBtn();
      const sbVisible = isSendVisible();
      const srShouldShow = !!(sb && sbVisible) && S.loaded;

      if (srShouldShow !== srPrevVisible) {
        if (srShouldShow) {
          sendRingEl.style.transition = 'opacity .15s ease';
          sendRingEl.style.removeProperty('opacity');
        } else {
          sendRingEl.style.transition = 'none';
          sendRingEl.style.opacity = '0';
          sendRingEl.classList.remove('act', 'ld');
        }
        srPrevVisible = srShouldShow;
      }

      if (sb && sbVisible && srShouldShow) {
        const sr = sb.getBoundingClientRect();
        Object.assign(sendRingEl.style, {
          left: (sr.left + sr.width/2  - 20) + 'px',
          top:  (sr.top  + sr.height/2 - 20) + 'px',
        });
        sendRingEl.classList.toggle('act', S.active && S.loaded);
        sendRingEl.classList.toggle('ld',  !S.active && S.loaded);
      }
    }

    // ── Inline chip (hidden in zen) ──────────────────────────────────────
    if (!F.zen) {
      const mb = findModelBtn();
      if (mb) {
        const mr = mb.getBoundingClientRect();
        Object.assign(inlineEl.style, {
          left:      (cr.left + cr.width / 2 - 24) + 'px',
          top:       (mr.top  + mr.height / 2) + 'px',
          transform: 'translate(-50%, calc(-50% + 2px))',
        });
      }
    }

    // ── Resize handle ────────────────────────────────────────────────────
    if (rzEl && F.enabled && !F.watermark && !F.zen && floatEl && floatEl.style.display !== 'none') {
      const fr = floatEl.getBoundingClientRect();
      rzEl.style.left   = (fr.right  - 14) + 'px';
      rzEl.style.top    = (fr.bottom - 14) + 'px';
      rzEl.style.right  = 'auto';
      rzEl.style.bottom = 'auto';
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════════════════
  function drawHalo() {
    const p = S.remainPct, a = S.active;
    const hi = a ? F.haloActive : F.haloIdle;
    if (!S.loaded) { haloEl.style.animation = 'h-idle-hi 3.2s ease-in-out infinite'; haloEl.style.opacity = String(0.22 * hi); return; }
    let anim, op;
    if (a) {
      if      (p > 60) { anim = 'h-on-hi    2.6s ease-in-out infinite'; op = 1;    }
      else if (p > 30) { anim = 'h-on-mid   3.0s ease-in-out infinite'; op = 1;    }
      else if (p > 8)  { anim = 'h-on-lo    2.2s ease-in-out infinite'; op = 1;    }
      else             { anim = 'h-on-empty 1.2s ease-in-out infinite'; op = 1;    }
    } else {
      if      (p > 60) { anim = 'h-idle-hi  3.4s ease-in-out infinite'; op = 0.55; }
      else if (p > 30) { anim = 'h-idle-mid 3.6s ease-in-out infinite'; op = 0.48; }
      else             { anim = 'h-idle-lo  2.4s ease-in-out infinite'; op = 0.55; }
    }
    haloEl.style.animation = anim; haloEl.style.opacity = String(op * hi);
  }

  function drawSendRing() {
    if (F.zen) return;
    const p = S.remainPct;
    sendArc.setAttribute('stroke-dashoffset', String(100 - p));
    sendArc.setAttribute('stroke', usageColor());
  }

  function drawInline() {
    if (F.zen) { inlineEl.classList.remove('on'); return; }
    const show = S.active && S.loaded;
    inlineEl.classList.toggle('on', show);
    if (!show || !cdSpan) return;
    // Dynamic color linked to usage level
    cdSpan.style.color = usageColor();
    const ms = S.session?.resetMs ?? S.resetMs ?? 0;
    const now = Date.now();
    cdSpan.textContent = (ms > 0 && ms > now) ? fmtCD(ms - now) : (ms > 0 ? t('newCycle') : '—');
    refreshTok();
  }

  function refreshTok() {
    if (!tokSpan) return;
    const input = findInput();
    const text  = input ? (input.innerText || '').replace(/\n$/, '') : '';
    const tok   = Math.ceil(text.length / 3.5);
    const tw    = document.getElementById('cum-tw');
    if (tok > 0) {
      tokSpan.textContent = '~' + fmtN(tok) + ' tok';
      if (tw) tw.classList.add('on');
    } else {
      if (tw) tw.classList.remove('on');
    }
  }

  function draw() { reposition(); drawHalo(); drawSendRing(); drawInline(); drawFloat(); }

  // ═════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═════════════════════════════════════════════════════════════════════════
  function fmtCD(d) {
    d = Math.max(0, d);
    return pad(Math.floor(d/3600000)) + ':' + pad(Math.floor(d%3600000/60000)) + ':' + pad(Math.floor(d%60000/1000));
  }
  const pad  = n => String(n).padStart(2,'0');
  const fmtN = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n);

  function isCtxValid() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }
  function safeSet(obj) {
    if (!isCtxValid()) return;
    try { chrome.storage.local.set(obj); } catch (e) {}
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  DATA
  // ═════════════════════════════════════════════════════════════════════════
  function applyData(data) {
    if (!data || data.error || typeof data.remainPct !== 'number') return;
    S.remainPct = data.remainPct; S.resetMs = data.resetMs || 0;
    S.session = data.session || null; S.loaded = true;
    draw();
  }

  function pullData() {
    if (!isCtxValid()) return;
    try {
      chrome.runtime.sendMessage({ type: 'GET_USAGE' }, (resp) => {
        try {
          if (!chrome.runtime || chrome.runtime.lastError) return;
          applyData(resp);
        } catch(e) {}
      });
    } catch (e) {}
  }

  function setupMessageListener() {
    if (!isCtxValid()) return;
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        try { if (msg.type === 'USAGE_UPDATE') applyData(msg.data); } catch(e) {}
      });
    } catch(e) {}
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  RAF LOOP
  // ═════════════════════════════════════════════════════════════════════════
  let lastSec = 0;
  function tick(ts) {
    if (!isCtxValid()) return;
    requestAnimationFrame(tick);
    reposition();
    if (ts - lastSec > 980) { lastSec = ts; if (S.active) drawInline(); }
  }

  // Self-rescheduling pull (stops when context dies)
  function schedulePull() {
    if (!isCtxValid()) return;
    setTimeout(() => { pullData(); schedulePull(); }, 30000);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  HOVER DELEGATION
  // ═════════════════════════════════════════════════════════════════════════
  document.addEventListener('mouseover', (e) => {
    const inp = findInput(); if (!inp) return;
    if (findContainer(inp).contains(e.target) && !S.active) { S.active = true; draw(); }
  }, { passive: true });

  document.addEventListener('mouseout', (e) => {
    const inp = findInput(); if (!inp) return;
    if (!findContainer(inp).contains(e.relatedTarget) && document.activeElement !== inp) {
      if (S.active) { S.active = false; draw(); }
    }
  }, { passive: true });

  // ═════════════════════════════════════════════════════════════════════════
  //  SPA SURVIVAL
  // ═════════════════════════════════════════════════════════════════════════
  function ensureElements() {
    invalidateQueryCache(); // body childList changed — DOM refs may be stale
    if (!document.getElementById('cum-ov')) createOverlay();
    if (!document.getElementById('cum-float')) {
      createFloat(); createResizeHandle();
      loadFloatSettings();
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  INIT
  // ═════════════════════════════════════════════════════════════════════════
  function init() {
    injectStyles(); createOverlay(); createFloat(); createResizeHandle();
    setupStorageListener(); setupMessageListener();
    loadFloatSettings(); pullData(); draw();
    requestAnimationFrame(tick);
    schedulePull();
    const observer = new MutationObserver(ensureElements);
    observer.observe(document.body, { childList: true });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
