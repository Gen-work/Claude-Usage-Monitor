// Regenerates the README screenshots / GIFs / demo video from the visual harness.
//   npm i -D playwright   (or use a global install)   then:   node scripts/capture-media.js
// Needs ffmpeg on PATH for the GIF / MP4 output. Writes into docs/media/.
// Everything here is mock data from test/harness.html, not a real claude.ai / chatgpt.com page.
'use strict';
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright'))); }

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'media');
const PORT = 8790;
const BASE = `http://localhost:${PORT}`;

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Screenshot a page repeatedly, then stitch the frames with ffmpeg (palette pass keeps colours clean)
async function recordGif(page, name, { frames, every = 90, clip, step, fps = 11, width = 640 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cum-frames-'));
  for (let i = 0; i < frames; i++) {
    if (step) await step(i);
    await page.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + '.png'), clip });
    await sleep(every);
  }
  const src = ['-y', '-framerate', String(fps), '-i', path.join(dir, '%04d.png')];
  const vf = `scale=${width}:-1:flags=lanczos`;
  execFileSync('ffmpeg', [...src, '-vf', `${vf},palettegen=stats_mode=diff`, path.join(dir, 'pal.png')], { stdio: 'ignore' });
  execFileSync('ffmpeg', [...src, '-i', path.join(dir, 'pal.png'), '-lavfi', `${vf}[x];[x][1:v]paletteuse=dither=sierra2_4a`, path.join(OUT, name + '.gif')], { stdio: 'ignore' });
  return dir;
}

function mp4From(dir, name, fps = 11) {
  execFileSync('ffmpeg', ['-y', '-framerate', String(fps), '-i', path.join(dir, '%04d.png'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, name + '.mp4')], { stdio: 'ignore' });
}

// The popup needs the same chrome.* mock the harness uses, plus tabs.query
const popupMock = ({ provider, lang }) => {
  const now = Date.now();
  const usage = (p, pct, weekly) => ({ provider: p, remainPct: pct, resetMs: now + 83 * 60000,
    session: { remainPct: pct, resetMs: now + 83 * 60000 }, weekly: { remainPct: weekly, resetMs: now + 3 * 86400000 }, ts: now });
  const store = { cum_lang: lang, cum_provider: provider, cum_fenabled: true,
    usageData: usage('claude', 72, 40), usageData_chatgpt: usage('chatgpt', 58, 81) };
  const listeners = [];
  window.chrome = {
    runtime: { id: 'media', lastError: null, sendMessage(m, cb) { cb && cb(m && m.type === 'GET_USAGE' ? store[m.provider === 'chatgpt' ? 'usageData_chatgpt' : 'usageData'] : { ok: true }); }, onMessage: { addListener() {} } },
    tabs: { query(q, cb) { cb([{ url: provider === 'chatgpt' ? 'https://chatgpt.com/' : 'https://claude.ai/new' }]); } },
    storage: { local: {
      get(keys, cb) { const o = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) o[k] = store[k]; }); setTimeout(() => cb(o), 0); },
      set(obj, cb) { const ch = {}; for (const k of Object.keys(obj)) { ch[k] = { newValue: obj[k] }; store[k] = obj[k]; } listeners.forEach(l => l(ch, 'local')); cb && cb(); },
      remove(keys, cb) { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]); cb && cb(); },
    }, onChanged: { addListener(l) { listeners.push(l); } } },
  };
};

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'test', 'serve.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await sleep(600);
  const browser = await chromium.launch();
  const made = [];
  try {
    const composer = { x: 60, y: 380, width: 840, height: 240 };

    // 1. Hero: type a message, glow brightens, countdown + draft tok appear
    {
      const p = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 2 });
      await p.goto(`${BASE}/test/harness.html?site=claude&lang=en&pct=72`);
      await sleep(900);
      const input = p.locator('[contenteditable="true"]').first();
      const text = 'Summarise this thread in three bullet points';
      await recordGif(p, 'hero', { frames: 44, clip: composer, step: async (i) => {
        if (i === 6) await input.click();
        if (i > 8 && i - 9 < text.length / 2) await p.keyboard.type(text.slice((i - 9) * 2, (i - 9) * 2 + 2));
      } });
      made.push('hero.gif');
      await p.close();
    }

    // 2. Remaining quota sweep: colour moves from full to low
    {
      const p = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 2 });
      await p.goto(`${BASE}/test/harness.html?site=claude&lang=en&pct=100`);
      await sleep(900);
      await p.locator('[contenteditable="true"]').first().click();
      await p.keyboard.type('hi');
      const dir = await recordGif(p, 'quota-sweep', { frames: 40, every: 120, clip: { x: 60, y: 380, width: 840, height: 240 }, step: async (i) => {
        const pct = Math.max(2, Math.round(100 - i * 2.6));
        await p.evaluate((v) => window.__harness.setPct(v), pct);
      } });
      mp4From(dir, 'quota-sweep');
      made.push('quota-sweep.gif', 'quota-sweep.mp4');
      await p.close();
    }

    // 3. Style presets on the same composer
    {
      const p = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 2 });
      await p.goto(`${BASE}/test/harness.html?site=claude&lang=en&pct=64`);
      await sleep(900);
      await p.locator('[contenteditable="true"]').first().click();
      await p.keyboard.type('Pick a style');
      const order = [null, 'neon', 'cyber', 'natural'];
      await recordGif(p, 'presets', { frames: 48, every: 110, clip: composer, step: async (i) => {
        if (i % 12 !== 0) return;
        const id = order[i / 12];
        await p.evaluate(({ id }) => {
          const keys = ['cum_color_hi', 'cum_color_mid', 'cum_color_lo', 'cum_color_mid_pos', 'cum_halo_active', 'cum_halo_idle', 'cum_breath_rate', 'cum_color_fade'];
          if (!id) { const o = {}; keys.forEach(k => { o[k] = undefined; }); chrome.storage.local.set(o); return; }
          chrome.storage.local.set(window.CUM.presetToStorage(window.CUM.STYLE_PRESETS[id], 'claude'));
        }, { id });
      } });
      made.push('presets.gif');
      await p.close();
    }

    // 4. Stills: ChatGPT composer, right-click menus, float on another site, first-run hint
    for (const [site, lang, name] of [['chatgpt', 'en', 'chatgpt'], ['claude', 'zh', 'first-run-zh']]) {
      const p = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 2 });
      await p.goto(`${BASE}/test/harness.html?site=${site}&lang=${lang}`);
      await sleep(900);
      await p.locator('[contenteditable="true"]').first().click();
      await p.keyboard.type(site === 'chatgpt' ? 'Draft a reply to this email' : '帮我把这段话整理成三点');
      await sleep(500);
      await p.screenshot({ path: path.join(OUT, name + '.png'), clip: composer });
      made.push(name + '.png');
      if (site === 'chatgpt') {
        await p.locator('#cum-float').click({ button: 'right' });
        await sleep(300);
        await p.screenshot({ path: path.join(OUT, 'menu-chatgpt.png'), clip: { x: 520, y: 260, width: 380, height: 380 } });
        made.push('menu-chatgpt.png');
      }
      await p.close();
    }
    {
      const p = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 2 });
      await p.goto(`${BASE}/test/harness.html?site=claude&lang=en`);
      await sleep(900);
      await p.locator('#cum-float').click({ button: 'right' });
      await sleep(300);
      await p.screenshot({ path: path.join(OUT, 'menu-claude.png'), clip: { x: 520, y: 260, width: 380, height: 380 } });
      made.push('menu-claude.png');
      await p.close();
    }

    // 5. Popup for each provider
    for (const provider of ['claude', 'chatgpt']) {
      const p = await browser.newPage({ viewport: { width: 340, height: 1600 }, deviceScaleFactor: 2 });
      await p.addInitScript(popupMock, { provider, lang: 'en' });
      await p.goto(`${BASE}/popup.html`);
      await sleep(900);
      const box = await p.locator('#main-view').boundingBox();
      await p.screenshot({ path: path.join(OUT, `popup-${provider}.png`), clip: { x: 0, y: 0, width: 340, height: Math.ceil(box.y + box.height) } });
      made.push(`popup-${provider}.png`);
      await p.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log('wrote', made.map(f => 'docs/media/' + f).join('\n      '));
})();
