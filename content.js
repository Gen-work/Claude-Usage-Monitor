// content.js — Claude Usage Monitor v10
// Runs on claude.ai and chatgpt.com. Overlay is fixed/body-level and never
// touches the host app's React DOM. Site-specific lookups live in ADAPTERS.

(() => {
  'use strict';

  const C = self.CUM;
  if (!C) return;

  // Provider for this tab. (data-cum-provider lets test/harness.html pick one.)
  const PROVIDER = C.detectProvider(location.hostname) ||
                   document.documentElement.getAttribute('data-cum-provider') || 'claude';
  const DATA_KEY = C.USAGE_KEY[PROVIDER];

  // ── i18n ─────────────────────────────────────────────────────────────────
  let lang = C.guessLang(navigator.languages || [navigator.language]);
  const t = C.makeT(() => lang);

  // ── State ─────────────────────────────────────────────────────────────────
  const S = { remainPct: 100, resetMs: 0, session: null, weekly: null, loaded: false, active: false, stale: false };
  // Halo colours / intensities are stored per provider (see shared.js)
  const PC = C.PROVIDER_COLORS[PROVIDER] || C.DEFAULT_COLORS;
  const K  = (base) => C.settingKey(base, PROVIDER);
  const F = {
    enabled: false, opacity: 1.0, watermark: false, zen: false, allPages: false,
    haloActive: 1.0, haloIdle: 0.5,
    colorHi: PC.hi, colorMid: PC.mid, colorLo: PC.lo,
    colorMidPos: PC.midPos, fsize: 56,
  };
  const usageColor = () => C.usageColor(F, S.remainPct);
  const safeSet = C.safeSet;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  let haloEl, sendRingEl, sendArc, srSvg, srTrack, inlineEl, cdSpan, tokSpan, tokWrap;
  let floatEl, floatPaths = [], floatTipEl, ctxEl, rzEl;
  let activeSubMenus = [];
  let srPrevVisible = false;
  let haloCssEl = null;
  let prevHasText = false;

  // ═════════════════════════════════════════════════════════════════════════
  //  SITE ADAPTERS — every host-DOM assumption is in here
  // ═════════════════════════════════════════════════════════════════════════
  // aria-labels are localised by the host app, so never rely on one string.
  const SEND_RE = /send|submit|送信|发送|傳送|전송|envoyer|enviar|отправ|إرسال|senden|invia|gönder|wyślij|verzend|skicka|lähetä|wyślij|gửi|ส่ง|kirim/i;

  // Lowest common ancestor of two nodes (bounded walk).
  function lca(a, b) {
    if (!a || !b) return null;
    const seen = new Set();
    for (let n = a, i = 0; n && i < 20; n = n.parentElement, i++) seen.add(n);
    for (let n = b, i = 0; n && i < 20; n = n.parentElement, i++) if (seen.has(n)) return n;
    return null;
  }
  // First ancestor that looks like a rounded "composer box".
  function roundedAncestor(input) {
    let el = input.parentElement;
    for (let i = 0; i < 14 && el && el !== document.body; i++, el = el.parentElement) {
      try {
        const br = parseFloat(getComputedStyle(el).borderRadius) || 0;
        if (br >= 12) return el;
      } catch (e) {}
      const cls = (typeof el.className === 'string' ? el.className : '');
      if (/rounded-\[(1[6-9]|2\d|3\d)px\]|rounded-(2xl|3xl)/.test(cls)) return el;
    }
    return null;
  }
  function plausibleBox(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const r = el.getBoundingClientRect();
    return r.width > 120 && r.height > 30 && r.height < Math.max(420, innerHeight * 0.6);
  }
  function findSendIn(scope, exact) {
    if (!scope) return null;
    if (exact) { const b = scope.querySelector(exact); if (b) return b; }
    for (const b of scope.querySelectorAll('button[aria-label]')) {
      if (SEND_RE.test(b.getAttribute('aria-label') || '')) return b;
    }
    const sub = scope.querySelector('button[type="submit"]');
    return sub || null;
  }
  const textOf = (input) => input
    ? (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT' ? input.value : (input.innerText || input.textContent || ''))
    : '';

  const ADAPTERS = {
    // claude.ai (verified 2026-10): input = div.ProseMirror[data-testid=chat-input];
    // composer box = ancestor with 14px radius (class bg-surface-3); send =
    // button[data-testid=chat-input-send] (aria-label is localised, disabled
    // while empty); model picker = [data-testid=model-selector-dropdown].
    claude: {
      input:  () => document.querySelector('[data-testid="chat-input"]'),
      anchor: () => document.querySelector('[data-testid="model-selector-dropdown"]'),
      container(input, anchor) {
        const rounded = roundedAncestor(input);
        if (plausibleBox(rounded)) return rounded;
        const viaLca = lca(input, anchor);
        if (plausibleBox(viaLca)) return viaLca;
        return input.parentElement;
      },
      sendBtn: (container) => findSendIn(container, '[data-testid="chat-input-send"], button[aria-label="Send message"]') ||
                              findSendIn(document, '[data-testid="chat-input-send"], button[aria-label="Send message"]'),
    },
    // chatgpt.com (verified 2026-10): desktop input = div[contenteditable]
    // (ProseMirror, historically #prompt-textarea) inside a <form>; the visual
    // composer is the ancestor with a 26px radius; send = form button[type=submit]
    // (localised aria-label, only rendered while there is text).
    chatgpt: {
      input:  () => document.querySelector('#prompt-textarea') ||
                    document.querySelector('textarea#mobile-composer-prompt') ||
                    document.querySelector('form [contenteditable="true"], form textarea'),
      anchor: () => null,
      container(input) {
        const rounded = roundedAncestor(input);
        if (plausibleBox(rounded)) return rounded;
        const form = input.closest('form');
        if (plausibleBox(form)) return form;
        return input.parentElement;
      },
      sendBtn: (container) => findSendIn(container, '[data-testid="send-button"], #composer-submit-button'),
    },
  };
  const A = ADAPTERS[PROVIDER] || ADAPTERS.claude;

  // ═════════════════════════════════════════════════════════════════════════
  //  STYLES
  // ═════════════════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById('cum-style')) return;
    const s = document.createElement('style');
    s.id = 'cum-style';
    const FONT = C.fontStack(lang);
    s.textContent = `
      #cum-ov { position:fixed; inset:0; pointer-events:none; z-index:2147483640; overflow:visible; }

      #cum-halo { position:absolute; border-radius:20px; pointer-events:none; transition:box-shadow 1s ease,opacity .8s ease; }

      #cum-sr { position:absolute; width:40px; height:40px; pointer-events:none; opacity:0; }
      #cum-sr.ld  { opacity:0.5; }
      #cum-sr.act { opacity:1; }

      #cum-il {
        position:absolute; display:flex; align-items:center; gap:5px;
        font:12px/1 ${FONT};
        pointer-events:none; white-space:nowrap; opacity:0; transition:opacity .2s ease;
        --cum-fg2: rgba(255,255,255,.55); --cum-sep: rgba(255,255,255,.2);
      }
      #cum-il.light { --cum-fg2: rgba(0,0,0,.5); --cum-sep: rgba(0,0,0,.18); }
      #cum-il.on { opacity:1; }
      #cum-il .val { font-weight:500; font-variant-numeric:tabular-nums; }
      #cum-il .sep { width:3px; height:3px; border-radius:50%; background:var(--cum-sep); }
      #cum-il .tok { color:var(--cum-fg2); font-variant-numeric:tabular-nums; }
      #cum-il .tok-wrap {
        display:flex; align-items:center; gap:5px;
        overflow:hidden; max-width:0; opacity:0;
        transition:max-width .25s ease, opacity .2s ease;
      }
      #cum-il .tok-wrap.on { max-width:120px; opacity:1; }

      #cum-float {
        position:fixed; z-index:2147483641;
        width:56px; height:56px; cursor:grab; user-select:none; display:none; touch-action:none;
      }
      #cum-float:active { cursor:grabbing; }
      #cum-float svg { width:100%; height:100%; overflow:visible; display:block; }
      #cum-float path { transition:fill 1.4s ease; }

      #cum-rz {
        position:fixed; z-index:2147483642; width:18px; height:18px;
        cursor:nwse-resize; pointer-events:auto; touch-action:none;
        opacity:0; transition:opacity .2s ease; display:none;
      }
      #cum-rz.on { opacity:1; }

      #cum-ftip {
        position:fixed; z-index:2147483643; padding:5px 10px; border-radius:8px;
        font:12px/1.5 ${FONT};
        background:rgba(16,14,12,.88); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
        border:1px solid rgba(217,119,87,.2); color:rgba(255,255,255,.85);
        white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .18s ease;
      }
      #cum-ftip .tp { font-weight:600; }
      #cum-ftip .sub { color:rgba(255,255,255,.5); font-size:11px; }

      #cum-ctx, .cum-submenu-fixed {
        position:fixed; min-width:150px; border-radius:10px;
        background:rgba(22,20,18,.94); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
        border:1px solid rgba(255,255,255,.1); box-shadow:0 8px 32px rgba(0,0,0,.5);
        overflow:hidden; display:none; z-index:2147483644;
        font:13px/1 ${FONT}; color:rgba(255,255,255,.82);
      }
      .cum-submenu-fixed { min-width:120px; z-index:2147483645; }
      .cum-ctx-item {
        padding:9px 14px; cursor:pointer; color:rgba(255,255,255,.82);
        display:flex; align-items:center; justify-content:space-between; gap:8px;
      }
      .cum-ctx-item:hover { background:rgba(255,255,255,.08); }
      .cum-ctx-item.danger { color:#e05252; }
      .cum-ctx-sep { height:1px; background:rgba(255,255,255,.08); margin:2px 0; }
      .cum-ctx-sub-hdr { font-size:11px; color:rgba(255,255,255,.35); padding:8px 14px 4px; cursor:default; }
      .cum-ctx-check { color:#d97757; flex-shrink:0; display:inline-flex; }
      .cum-ctx-arrow { color:rgba(255,255,255,.3); flex-shrink:0; display:inline-flex; }
      [dir="rtl"] .cum-ctx-arrow svg { transform:scaleX(-1); }

      .cum-ctx-slider-row { padding:6px 14px 10px; display:flex; align-items:center; gap:8px; }
      .cum-ctx-slider-row input[type=range] {
        flex:1; height:4px; appearance:none; -webkit-appearance:none; background:rgba(255,255,255,.12);
        border-radius:2px; cursor:pointer; margin:0;
      }
      .cum-ctx-slider-row input[type=range]::-webkit-slider-thumb {
        appearance:none; -webkit-appearance:none; width:11px; height:11px; border-radius:50%;
        background:#d97757; cursor:pointer;
      }
      .cum-ctx-slider-val { font-size:11px; color:rgba(255,255,255,.4); width:28px; text-align:end; flex-shrink:0; font-variant-numeric:tabular-nums; }

      .cum-ctx-grow { padding:6px 14px 8px; display:flex; align-items:center; gap:6px; position:relative; color:rgba(255,255,255,.6); }
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
        border-radius:50%; cursor:ew-resize; touch-action:none;
        border:2.5px solid rgba(255,255,255,.65); background:rgba(20,18,16,.3);
        transform:translate(-50%,-50%);
      }
      .cum-ctx-mid-drag:hover { border-color:rgba(255,255,255,.9); }
      .cum-ctx-gtip {
        position:absolute; left:50%; transform:translateX(-50%); bottom:calc(100% - 2px);
        background:rgba(16,14,12,.92); color:rgba(255,255,255,.75); font-size:10.5px; padding:3px 9px;
        border-radius:5px; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .18s;
        border:1px solid rgba(255,255,255,.1); z-index:1;
      }
      .cum-ctx-rrow { padding:0 14px 6px; display:flex; justify-content:flex-end; }
      .cum-ctx-creset {
        padding:4px 8px; border-radius:7px; font:11px ${FONT};
        background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07);
        color:rgba(255,255,255,.35); cursor:pointer;
      }
      .cum-ctx-creset:hover { background:rgba(224,82,82,.1); border-color:rgba(224,82,82,.2); color:rgba(224,82,82,.7); }
    `;
    document.head.appendChild(s);
    injectHaloCSS();
  }

  // Dynamic halo keyframes — regenerated when custom colours change
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

  // Apply the UI language to every root element we own (font + direction)
  function applyLangToUi() {
    [inlineEl, floatTipEl, ctxEl, ...activeSubMenus].forEach(el => C.applyLang(el, lang));
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  OVERLAY
  // ═════════════════════════════════════════════════════════════════════════
  function createOverlay() {
    const ov = document.createElement('div'); ov.id = 'cum-ov';

    haloEl = document.createElement('div'); haloEl.id = 'cum-halo';
    ov.appendChild(haloEl);

    sendRingEl = document.createElement('div'); sendRingEl.id = 'cum-sr';
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox','0 0 40 40'); svg.setAttribute('width','40'); svg.setAttribute('height','40');
    const mkRect = () => {
      const r = document.createElementNS(NS,'rect');
      r.setAttribute('x','2'); r.setAttribute('y','2'); r.setAttribute('width','36'); r.setAttribute('height','36');
      r.setAttribute('rx','10'); r.setAttribute('ry','10'); r.setAttribute('fill','none');
      r.setAttribute('stroke-width','2'); r.setAttribute('pathLength','100');
      return r;
    };
    const tr = mkRect(); tr.setAttribute('stroke','rgba(128,128,128,0.18)');
    svg.appendChild(tr);
    sendArc = mkRect();
    sendArc.setAttribute('stroke', F.colorHi); sendArc.setAttribute('stroke-linecap','round');
    sendArc.setAttribute('stroke-dasharray','100'); sendArc.setAttribute('stroke-dashoffset','100');
    sendArc.style.transition = 'stroke-dashoffset .7s ease, stroke .5s ease';
    svg.appendChild(sendArc);
    srSvg = svg; srTrack = tr;
    sendRingEl.appendChild(svg);
    ov.appendChild(sendRingEl);

    inlineEl = document.createElement('div'); inlineEl.id = 'cum-il';
    cdSpan = document.createElement('span'); cdSpan.className = 'val';
    tokWrap = document.createElement('div'); tokWrap.className = 'tok-wrap';
    const sep = document.createElement('div'); sep.className = 'sep';
    tokSpan = document.createElement('span'); tokSpan.className = 'tok';
    tokWrap.appendChild(sep); tokWrap.appendChild(tokSpan);
    inlineEl.appendChild(cdSpan); inlineEl.appendChild(tokWrap);
    ov.appendChild(inlineEl);

    document.body.appendChild(ov);
    C.applyLang(inlineEl, lang);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  FLOATING ICON
  // ═════════════════════════════════════════════════════════════════════════
  function createFloat() {
    floatEl = document.createElement('div'); floatEl.id = 'cum-float';
    floatEl.setAttribute('role', 'img');
    Object.assign(floatEl.style, { bottom:'24px', right:'24px', left:'auto', top:'auto' });
    const built = C.buildPetalSvg(document, F.colorHi);
    floatPaths = built.paths;
    floatEl.appendChild(built.svg);
    document.body.appendChild(floatEl);

    floatTipEl = document.createElement('div'); floatTipEl.id = 'cum-ftip';
    document.body.appendChild(floatTipEl);

    ctxEl = document.createElement('div'); ctxEl.id = 'cum-ctx';
    document.body.appendChild(ctxEl);
    applyLangToUi();

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
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      const r = floatEl.getBoundingClientRect();
      safeSet({ cum_fpos: { right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom } });
    };
    floatEl.addEventListener('pointerup', endDrag);
    floatEl.addEventListener('pointercancel', endDrag);

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
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtx(); }, { passive: true });
  }

  // ─── Tooltip ──────────────────────────────────────────────────────────────
  function resetLine(entry) {
    const ms = entry ? entry.resetMs : 0;
    if (!(ms > 0)) return '';
    return ms > Date.now() ? t('resetAt') + ' ' + C.fmtClock(ms, lang, true) : t('newCycle');
  }
  function showTooltip() {
    if (!floatEl) return;
    const r = floatEl.getBoundingClientRect();
    const esc = C.escapeHtml;
    let html = `<span class="tp" style="color:${esc(usageColor())}">${S.remainPct}% ${esc(t('remaining'))}</span>`;
    const r1 = resetLine(S.session || { resetMs: S.resetMs });
    if (r1) html += `<br><span class="sub">${esc(r1)}</span>`;
    if (S.weekly && typeof S.weekly.remainPct === 'number') {
      html += `<br><span class="sub">${esc(t('weekShort'))}: ${S.weekly.remainPct}% ${esc(t('remaining'))}</span>`;
    }
    if (S.stale) html += `<br><span class="sub">⚠</span>`;
    floatTipEl.innerHTML = html;
    floatTipEl.style.left      = (r.left + r.width / 2) + 'px';
    floatTipEl.style.bottom    = (window.innerHeight - r.top + 8) + 'px';
    floatTipEl.style.top       = 'auto';
    floatTipEl.style.transform = 'translateX(-50%)';
    floatTipEl.style.opacity   = '1';
  }

  function showRz() { if (rzEl && !F.watermark && !F.zen) rzEl.classList.add('on'); }

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
  //  RESIZE HANDLE — centre-fixed, disabled in watermark / zen
  // ═════════════════════════════════════════════════════════════════════════
  function createResizeHandle() {
    rzEl = document.createElement('div'); rzEl.id = 'cum-rz';
    rzEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
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
      const dx = e.clientX - rzCenterX, dy = e.clientY - rzCenterY;
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
    const endRz = () => {
      if (!rzDrag) return;
      rzDrag = false;
      safeSet({ cum_fsize: F.fsize });
      const r = floatEl.getBoundingClientRect();
      safeSet({ cum_fpos: { right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom } });
    };
    rzEl.addEventListener('pointerup', endRz);
    rzEl.addEventListener('pointercancel', endRz);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  CONTEXT MENU
  // ═════════════════════════════════════════════════════════════════════════
  function buildCtx() {
    activeSubMenus.forEach(s => { try { s.remove(); } catch(e){} });
    activeSubMenus = [];
    ctxEl.innerHTML = '';
    C.applyLang(ctxEl, lang);

    const item = (label, cls, action, checked, parent) => {
      const d = document.createElement('div');
      d.className = 'cum-ctx-item' + (cls ? ' ' + cls : '');
      const sp = document.createElement('span'); sp.textContent = label; d.appendChild(sp);
      if (checked) { const ck = document.createElement('span'); ck.className = 'cum-ctx-check'; ck.innerHTML = C.ICONS.check; d.appendChild(ck); }
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
      const sp = document.createElement('span'); sp.textContent = label;
      const ar = document.createElement('span'); ar.className = 'cum-ctx-arrow'; ar.innerHTML = C.ICONS.chevron;
      wrap.appendChild(sp); wrap.appendChild(ar);
      const sub = document.createElement('div');
      sub.className = 'cum-submenu-fixed';
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
      const row = document.createElement('div'); row.className = 'cum-ctx-slider-row';
      row.addEventListener('pointerdown', ev => ev.stopPropagation());
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '5';
      slider.value = String(Math.round(initVal * 100));
      const valEl = document.createElement('span'); valEl.className = 'cum-ctx-slider-val';
      valEl.textContent = slider.value + '%';
      slider.addEventListener('input', () => { valEl.textContent = slider.value + '%'; onInput(parseInt(slider.value, 10) / 100); });
      row.appendChild(slider); row.appendChild(valEl);
      (parent || ctxEl).appendChild(row);
    };

    // ── Menu items ────────────────────────────────────────────────────────
    item(t('hideIcon'), 'danger', () => { F.enabled = false; applyFloatVisibility(); safeSet({ cum_fenabled: false }); });
    sep();
    item(t('watermark'), '', () => { F.watermark = !F.watermark; safeSet({ cum_fwatermark: F.watermark }); applyFloatVisibility(); }, F.watermark);
    item(t('allPages'), '', () => { F.allPages = !F.allPages; safeSet({ cum_allpages: F.allPages }); }, F.allPages);
    sep();

    hdr(t('opacity'));
    sliderRow(F.opacity, (v) => { F.opacity = v; floatEl.style.opacity = String(v); safeSet({ cum_fopacity: v }); });
    sep();

    const haloSub = subMenu(t('haloLabel'));
    hdr(t('activeIntensity'), haloSub);
    sliderRow(F.haloActive, (v) => { F.haloActive = v; drawHalo(); safeSet({ [K('cum_halo_active')]: v }); }, haloSub);
    hdr(t('idleIntensity'), haloSub);
    sliderRow(F.haloIdle, (v) => { F.haloIdle = v; drawHalo(); safeSet({ [K('cum_halo_idle')]: v }); }, haloSub);
    sep(haloSub);
    addGradientBarWidget(haloSub);
    sep();

    const langSub = subMenu(t('language'));
    (self.CUM_LANGS || []).forEach((l) => {
      item(l.label, '', () => { lang = l.code; safeSet({ cum_lang: l.code }); applyLangToUi(); draw(); }, lang === l.code, langSub);
    });
  }

  function hideCtx() {
    if (ctxEl) ctxEl.style.display = 'none';
    activeSubMenus.forEach(s => { s.style.display = 'none'; });
  }

  // ── Gradient bar widget ───────────────────────────────────────────────────
  function addGradientBarWidget(parent) {
    const grow = document.createElement('div'); grow.className = 'cum-ctx-grow';
    grow.addEventListener('pointerdown', ev => ev.stopPropagation());

    const em1 = document.createElement('span'); em1.innerHTML = C.ICONS.batFull; em1.style.display = 'inline-flex';
    const bar = document.createElement('div'); bar.className = 'cum-ctx-gbar';
    const em2 = document.createElement('span'); em2.innerHTML = C.ICONS.batLow;  em2.style.display = 'inline-flex';

    const oldP = document.getElementById('cum-ctx-cpicker');
    if (oldP) oldP.remove();
    const picker = document.createElement('input'); picker.type = 'color';
    picker.id = 'cum-ctx-cpicker';
    picker.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px';
    document.body.appendChild(picker);

    const tip = document.createElement('div'); tip.className = 'cum-ctx-gtip';
    tip.textContent = t('clickColor');
    grow.appendChild(tip);
    const showTip = () => { tip.style.opacity = '1'; };
    const hideTip = () => { tip.style.opacity = '0'; };

    let activePSlot = 'hi';
    picker.addEventListener('input', () => {
      const val = picker.value;
      if (activePSlot === 'hi')       { F.colorHi  = val; safeSet({ [K('cum_color_hi')]:  val }); }
      else if (activePSlot === 'mid') { F.colorMid = val; safeSet({ [K('cum_color_mid')]: val }); }
      else                            { F.colorLo  = val; safeSet({ [K('cum_color_lo')]:  val }); }
      injectHaloCSS(); drawHalo(); drawSendRing(); drawFloat(); updateBar();
    });

    const hiDot = document.createElement('div'); hiDot.className = 'cum-ctx-gstop hi';
    hiDot.addEventListener('pointerdown', ev => ev.stopPropagation());
    hiDot.addEventListener('click', () => { activePSlot = 'hi'; picker.value = F.colorHi; picker.click(); hideTip(); });
    hiDot.addEventListener('mouseenter', showTip); hiDot.addEventListener('mouseleave', hideTip);

    const loDot = document.createElement('div'); loDot.className = 'cum-ctx-gstop lo';
    loDot.addEventListener('pointerdown', ev => ev.stopPropagation());
    loDot.addEventListener('click', () => { activePSlot = 'lo'; picker.value = F.colorLo; picker.click(); hideTip(); });
    loDot.addEventListener('mouseenter', showTip); loDot.addEventListener('mouseleave', hideTip);

    const midDrag = document.createElement('div'); midDrag.className = 'cum-ctx-mid-drag';
    midDrag.addEventListener('mouseenter', showTip); midDrag.addEventListener('mouseleave', hideTip);

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
      safeSet({ [K('cum_color_mid_pos')]: p });
      updateBar(); injectHaloCSS(); drawHalo(); drawSendRing(); drawFloat();
    });
    midDrag.addEventListener('pointerup', () => {
      if (!mdMoved) { activePSlot = 'mid'; picker.value = F.colorMid; picker.click(); hideTip(); }
      mdDrag = false;
    });
    midDrag.addEventListener('pointercancel', () => { mdDrag = false; });

    bar.appendChild(hiDot); bar.appendChild(midDrag); bar.appendChild(loDot);
    updateBar();
    grow.appendChild(em1); grow.appendChild(bar); grow.appendChild(em2);
    parent.appendChild(grow);

    const rrow = document.createElement('div'); rrow.className = 'cum-ctx-rrow';
    rrow.addEventListener('pointerdown', ev => ev.stopPropagation());
    const resetBtn = document.createElement('button'); resetBtn.className = 'cum-ctx-creset'; resetBtn.type = 'button';
    resetBtn.textContent = t('resetColors');
    resetBtn.addEventListener('click', () => {
      F.colorHi = PC.hi; F.colorMid = PC.mid; F.colorLo = PC.lo; F.colorMidPos = PC.midPos;
      safeSet({ [K('cum_color_hi')]: F.colorHi, [K('cum_color_mid')]: F.colorMid,
                [K('cum_color_lo')]: F.colorLo, [K('cum_color_mid_pos')]: F.colorMidPos });
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
    C.paintPetals(floatPaths, S.remainPct, usageColor());
    floatEl.setAttribute('aria-label', `${C.PROVIDER_LABEL[PROVIDER]} ${S.remainPct}% ${t('remaining')}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  SETTINGS
  // ═════════════════════════════════════════════════════════════════════════
  const SETTING_KEYS = ['cum_fenabled','cum_fopacity','cum_fwatermark','cum_fpos','cum_lang',
    'cum_fsize','cum_zen','cum_allpages', ...C.PER_PROVIDER_KEYS.map(K)];

  function loadFloatSettings() {
    if (!C.isCtxValid()) return;
    try {
      chrome.storage.local.get(SETTING_KEYS, (res) => {
        try {
          if (res.cum_lang) lang = res.cum_lang;
          F.enabled      = !!res.cum_fenabled;
          F.opacity      = typeof res.cum_fopacity    === 'number' ? res.cum_fopacity    : 1.0;
          F.watermark    = !!res.cum_fwatermark;
          F.zen          = !!res.cum_zen;
          F.allPages     = !!res.cum_allpages;
          const num = (k, d) => typeof res[K(k)] === 'number' ? res[K(k)] : d;
          F.haloActive   = num('cum_halo_active', 1.0);
          F.haloIdle     = num('cum_halo_idle', 0.5);
          F.colorHi      = res[K('cum_color_hi')]  || PC.hi;
          F.colorMid     = res[K('cum_color_mid')] || PC.mid;
          F.colorLo      = res[K('cum_color_lo')]  || PC.lo;
          F.colorMidPos  = num('cum_color_mid_pos', PC.midPos);
          F.fsize        = typeof res.cum_fsize === 'number' ? res.cum_fsize : 56;
          if (res.cum_fpos && typeof res.cum_fpos.right === 'number') {
            floatEl.style.right  = res.cum_fpos.right  + 'px';
            floatEl.style.bottom = res.cum_fpos.bottom + 'px';
            floatEl.style.left   = 'auto'; floatEl.style.top = 'auto';
          }
          injectHaloCSS(); applyLangToUi();
          applyFloatVisibility(); draw();
        } catch(e) {}
      });
    } catch(e) {}
  }

  function setupStorageListener() {
    if (!C.isCtxValid()) return;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        try {
          const recolor = () => { injectHaloCSS(); drawHalo(); drawSendRing(); drawFloat(); };
          if ('cum_fenabled'      in changes) { F.enabled    = !!changes.cum_fenabled.newValue;   applyFloatVisibility(); drawFloat(); }
          if ('cum_fopacity'      in changes) { F.opacity    = changes.cum_fopacity.newValue ?? 1; if (floatEl) floatEl.style.opacity = String(F.opacity); }
          if ('cum_fwatermark'    in changes) { F.watermark  = !!changes.cum_fwatermark.newValue; applyFloatVisibility(); }
          if ('cum_zen'           in changes) { F.zen        = !!changes.cum_zen.newValue;        applyFloatVisibility(); draw(); }
          const ch = (k) => changes[K(k)];
          if (ch('cum_halo_active'))   { F.haloActive = ch('cum_halo_active').newValue ?? 1;   drawHalo(); }
          if (ch('cum_halo_idle'))     { F.haloIdle   = ch('cum_halo_idle').newValue ?? 0.5;   drawHalo(); }
          if (ch('cum_color_hi'))      { F.colorHi    = ch('cum_color_hi').newValue  || PC.hi;  recolor(); }
          if (ch('cum_color_mid'))     { F.colorMid   = ch('cum_color_mid').newValue || PC.mid; recolor(); }
          if (ch('cum_color_lo'))      { F.colorLo    = ch('cum_color_lo').newValue  || PC.lo;  recolor(); }
          if (ch('cum_color_mid_pos')) { F.colorMidPos = ch('cum_color_mid_pos').newValue ?? PC.midPos; draw(); }
          if ('cum_allpages'      in changes) { F.allPages   = !!changes.cum_allpages.newValue; }
          if ('cum_fsize'         in changes) { F.fsize      = changes.cum_fsize.newValue || 56;  applyFloatVisibility(); }
          if ('cum_lang'          in changes) { lang = changes.cum_lang.newValue || C.guessLang(navigator.languages); applyLangToUi(); draw(); }
          if (DATA_KEY in changes)            { applyData(changes[DATA_KEY].newValue); }
        } catch(e) {}
      });
    } catch(e) {}
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  FINDERS — cached; invalidated when <body> children change
  // ═════════════════════════════════════════════════════════════════════════
  const _q = { input: null, sendBtn: null, anchor: null, container: null };
  function invalidateQueryCache() { _q.input = _q.sendBtn = _q.anchor = _q.container = null; }

  function findInput() {
    if (_q.input && document.contains(_q.input)) return _q.input;
    _q.container = null;
    return (_q.input = A.input());
  }
  function findAnchor() {
    if (_q.anchor && document.contains(_q.anchor)) return _q.anchor;
    return (_q.anchor = A.anchor());
  }
  function findContainer(input) {
    if (_q.container && document.contains(_q.container) && _q.container.contains(input)) return _q.container;
    return (_q.container = A.container(input, findAnchor()) || input.parentElement);
  }
  function findSendBtn(container) {
    if (_q.sendBtn && document.contains(_q.sendBtn)) return _q.sendBtn;
    return (_q.sendBtn = A.sendBtn(container));
  }

  const hasText = (input) => textOf(input).replace(/\n/g, '').trim().length > 0;

  // Send button present, enabled and not faded out by the host app
  function isSendVisible(sb, input) {
    if (!sb) return false;
    if (!hasText(input)) return false;
    if (sb.disabled || sb.getAttribute('aria-disabled') === 'true') return false;
    let el = sb;
    for (let i = 0; i < 4 && el; i++, el = el.parentElement) {
      if (el.style && el.style.opacity === '0') return false;
      try { if (parseFloat(getComputedStyle(el).opacity) < 0.9) return false; } catch(e) {}
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
    if (document.activeElement === input) S.active = true;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  POSITIONING — writes styles only when geometry actually changed
  // ═════════════════════════════════════════════════════════════════════════
  const last = { cr: '', sr: '', il: '', rz: '', dark: null };
  function reposition() {
    const input = findInput();
    if (!input) { haloEl.style.opacity = '0'; return; }
    wireInput(input);

    const container = findContainer(input);
    const cr = container.getBoundingClientRect();
    const crKey = `${cr.left}|${cr.top}|${cr.width}|${cr.height}`;
    if (crKey !== last.cr) {
      last.cr = crKey;
      Object.assign(haloEl.style, { left: cr.left + 'px', top: cr.top + 'px', width: cr.width + 'px', height: cr.height + 'px' });
      try { haloEl.style.borderRadius = getComputedStyle(container).borderRadius || '20px'; } catch(e) {}
      // Light / dark host theme → readable secondary text in the chip
      const dark = C.isDarkBehind(container, window);
      if (dark !== last.dark) { last.dark = dark; inlineEl.classList.toggle('light', !dark); }
    }

    // ── Send ring ────────────────────────────────────────────────────────
    if (F.zen) {
      if (srPrevVisible) { sendRingEl.style.transition = 'none'; sendRingEl.style.opacity = '0'; sendRingEl.classList.remove('act','ld'); srPrevVisible = false; }
    } else {
      const txt = hasText(input);
      if (!txt && prevHasText) { sendRingEl.style.transition = 'none'; sendRingEl.style.opacity = '0'; sendRingEl.classList.remove('act','ld'); srPrevVisible = false; }
      prevHasText = txt;

      const sb = txt ? findSendBtn(container) : null;
      const sbVisible = isSendVisible(sb, input);
      const srShouldShow = sbVisible && S.loaded;

      if (srShouldShow !== srPrevVisible) {
        if (srShouldShow) { sendRingEl.style.transition = 'opacity .15s ease'; sendRingEl.style.removeProperty('opacity'); }
        else { sendRingEl.style.transition = 'none'; sendRingEl.style.opacity = '0'; sendRingEl.classList.remove('act','ld'); }
        srPrevVisible = srShouldShow;
      }
      if (srShouldShow) {
        const sr = sb.getBoundingClientRect();
        const key = `${sr.left}|${sr.top}|${sr.width}|${sr.height}`;
        if (key !== last.sr) { last.sr = key; fitRing(sb, sr); }
        sendRingEl.classList.toggle('act', S.active && S.loaded);
        sendRingEl.classList.toggle('ld',  !S.active && S.loaded);
      }
    }

    // ── Inline chip (hidden in zen) ──────────────────────────────────────
    if (!F.zen) {
      const anchor = findAnchor();
      let cy;
      if (anchor) { const mr = anchor.getBoundingClientRect(); cy = mr.top + mr.height / 2; }
      else cy = cr.bottom - 22; // bottom toolbar row of the composer
      const key = `${cr.left + cr.width / 2}|${cy}`;
      if (key !== last.il) {
        last.il = key;
        Object.assign(inlineEl.style, { left: (cr.left + cr.width / 2 - 24) + 'px', top: cy + 'px', transform: 'translate(-50%, calc(-50% + 2px))' });
      }
    }

    // ── Resize handle ────────────────────────────────────────────────────
    if (rzEl && F.enabled && !F.watermark && !F.zen && floatEl && floatEl.style.display !== 'none') {
      const fr = floatEl.getBoundingClientRect();
      const key = `${fr.right}|${fr.bottom}`;
      if (key !== last.rz) {
        last.rz = key;
        Object.assign(rzEl.style, { left: (fr.right - 14) + 'px', top: (fr.bottom - 14) + 'px', right: 'auto', bottom: 'auto' });
      }
    }
  }

  // Size and shape the ring after the host's send button: Claude uses a
  // rounded square, ChatGPT a circle — the ring follows the button's own radius.
  function fitRing(sb, sr) {
    const size = Math.round(Math.max(sr.width, sr.height)) + 8;
    let br = 10;
    try { br = parseFloat(getComputedStyle(sb).borderRadius) || 10; } catch (e) {}
    const rx = Math.min(size / 2, br + 4);
    sendRingEl.style.width = size + 'px'; sendRingEl.style.height = size + 'px';
    srSvg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    srSvg.setAttribute('width', String(size)); srSvg.setAttribute('height', String(size));
    for (const r of [srTrack, sendArc]) {
      r.setAttribute('width', String(size - 4)); r.setAttribute('height', String(size - 4));
      r.setAttribute('rx', String(rx)); r.setAttribute('ry', String(rx));
    }
    Object.assign(sendRingEl.style, {
      left: (sr.left + sr.width / 2 - size / 2) + 'px',
      top:  (sr.top  + sr.height / 2 - size / 2) + 'px',
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════════════════
  function drawHalo() {
    const a = S.active;
    const gain = a ? F.haloActive : F.haloIdle;
    if (!S.loaded) { haloEl.style.animation = 'h-idle-hi 3.2s ease-in-out infinite'; haloEl.style.opacity = String(0.22 * gain); return; }
    const tier = C.tierOf(S.remainPct, F.colorMidPos);
    let anim, op;
    if (a) {
      anim = { hi: 'h-on-hi 2.6s', mid: 'h-on-mid 3.0s', lo: 'h-on-lo 2.2s', empty: 'h-on-empty 1.2s' }[tier];
      op = 1;
    } else {
      anim = { hi: 'h-idle-hi 3.4s', mid: 'h-idle-mid 3.6s', lo: 'h-idle-lo 2.4s', empty: 'h-idle-lo 1.8s' }[tier];
      op = tier === 'mid' ? 0.48 : 0.55;
    }
    haloEl.style.animation = anim + ' ease-in-out infinite';
    haloEl.style.opacity = String(op * gain * (S.stale ? 0.6 : 1));
  }

  function drawSendRing() {
    if (F.zen) return;
    sendArc.setAttribute('stroke-dashoffset', String(100 - S.remainPct));
    sendArc.setAttribute('stroke', usageColor());
  }

  function drawInline() {
    if (F.zen) { inlineEl.classList.remove('on'); return; }
    const show = S.active && S.loaded;
    inlineEl.classList.toggle('on', show);
    if (!show) return;
    cdSpan.style.color = usageColor();
    const ms = S.session?.resetMs ?? S.resetMs ?? 0;
    const now = Date.now();
    cdSpan.textContent = (ms > 0 && ms > now) ? C.fmtCountdown(ms - now) : (ms > 0 ? t('newCycle') : '—');
    refreshTok();
  }

  function refreshTok() {
    if (!tokSpan) return;
    const tok = C.estimateTokens(textOf(findInput()).replace(/\n$/, ''));
    if (tok > 0) { tokSpan.textContent = '~' + C.fmtN(tok) + ' tok'; tokWrap.classList.add('on'); }
    else tokWrap.classList.remove('on');
  }

  function draw() { reposition(); drawHalo(); drawSendRing(); drawInline(); drawFloat(); }

  // ═════════════════════════════════════════════════════════════════════════
  //  DATA
  // ═════════════════════════════════════════════════════════════════════════
  function applyData(data) {
    if (!C.isUsable(data)) return;
    if (data.provider && data.provider !== PROVIDER) return;
    S.remainPct = data.remainPct; S.resetMs = data.resetMs || 0;
    S.session = data.session || null; S.weekly = data.weekly || null;
    S.stale = !!data.stale; S.loaded = true;
    draw();
  }

  function pullData() {
    if (!C.isCtxValid()) return;
    try {
      chrome.runtime.sendMessage({ type: 'GET_USAGE', provider: PROVIDER }, (resp) => {
        try { if (!chrome.runtime || chrome.runtime.lastError) return; applyData(resp); } catch(e) {}
      });
    } catch (e) {}
  }

  // chatgpt.com: fetch the usage payload from inside the page (same cookies /
  // session as the app). Returned raw; the worker normalises and stores it.
  async function chatgptFetchRaw() {
    const s = await fetch('/api/auth/session', { credentials: 'include' });
    if (!s.ok) return { error: 'http_' + s.status };
    const session = await s.json().catch(() => null);
    const token = session && session.accessToken;
    if (!token) return { error: 'not_logged_in' };
    const r = await fetch('/backend-api/wham/usage', {
      credentials: 'include',
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
    });
    if (!r.ok) return { error: 'http_' + r.status };
    return { raw: await r.json() };
  }

  let lastSelfReport = 0;
  function chatgptSelfReport() {
    if (PROVIDER !== 'chatgpt' || !C.isCtxValid()) return;
    if (Date.now() - lastSelfReport < 45000) return;
    lastSelfReport = Date.now();
    chatgptFetchRaw().then((res) => {
      if (res && res.raw) chrome.runtime.sendMessage({ type: 'CHATGPT_REPORT', raw: res.raw }, () => void chrome.runtime.lastError);
    }).catch(() => {});
  }

  function setupMessageListener() {
    if (!C.isCtxValid()) return;
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        try {
          if (!msg) return;
          if (msg.type === 'USAGE_UPDATE' && (!msg.provider || msg.provider === PROVIDER)) applyData(msg.data);
          if (msg.type === 'CHATGPT_FETCH' && PROVIDER === 'chatgpt') {
            chatgptFetchRaw().then(sendResponse, (e) => sendResponse({ error: String(e && e.message || e) }));
            return true;
          }
        } catch(e) {}
      });
    } catch(e) {}
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  RAF LOOP — paused while the tab is hidden
  // ═════════════════════════════════════════════════════════════════════════
  let lastSec = 0, rafOn = false;
  function tick(ts) {
    if (!C.isCtxValid() || document.hidden) { rafOn = false; return; }
    requestAnimationFrame(tick);
    reposition();
    if (ts - lastSec > 980) { lastSec = ts; if (S.active) drawInline(); }
  }
  function startRaf() { if (!rafOn) { rafOn = true; requestAnimationFrame(tick); } }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { invalidateQueryCache(); startRaf(); pullData(); chatgptSelfReport(); }
  });

  function schedulePull() {
    if (!C.isCtxValid()) return;
    setTimeout(() => { if (!document.hidden) pullData(); schedulePull(); }, 30000);
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
    invalidateQueryCache();
    if (!document.getElementById('cum-style')) { haloCssEl = null; injectStyles(); }
    if (!document.getElementById('cum-ov')) createOverlay();
    if (!document.getElementById('cum-float')) { createFloat(); createResizeHandle(); loadFloatSettings(); }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  INIT
  // ═════════════════════════════════════════════════════════════════════════
  function init() {
    if (!document.body) { setTimeout(init, 50); return; }
    injectStyles(); createOverlay(); createFloat(); createResizeHandle();
    setupStorageListener(); setupMessageListener();
    loadFloatSettings(); pullData(); draw();
    startRaf(); schedulePull();
    chatgptSelfReport();
    new MutationObserver(ensureElements).observe(document.body, { childList: true });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
