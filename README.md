# Claude Usage Monitor

A Chrome extension that surfaces Claude.ai quota usage as ambient visual feedback — directly inside the chat interface, with no context-switching required.

**The problem it solves:** Claude enforces a rolling 5-hour usage window, but the only way to check your remaining quota is to navigate away from the chat. This extension injects real-time usage indicators into the page itself, so you always know where you stand without breaking your flow.

---

## Features

### On claude.ai

- **Halo glow** — animated box-shadow around the chat input that pulses with your remaining quota. Color shifts from warm orange (healthy) through amber to red as usage depletes; intensity scales separately for active typing vs. idle states.
- **Send ring** — an SVG arc around the send button that fills proportionally to remaining quota. Appears when you have text typed, disappears when the input clears.
- **Inline chip** — when the input is focused, shows a live countdown to the quota reset (`HH:MM:SS`) and a rough token estimate for the text currently in the box (`~N tok`), calculated as `⌈length / 3.5⌉`.
- **Floating icon** — a draggable 12-petal Claude logo in the corner. Petals fill clockwise to represent remaining quota percentage. Right-click opens a full settings context menu.

### Cross-page mode

When enabled, the floating icon appears on *any* webpage, syncing its state from the cached usage data — useful when you're working in a different tab and want ambient quota awareness.

### Popup panel

Click the extension icon for a quick-glance panel: remaining percentage, a color-coded progress bar, reset countdown, and all settings in one place.

---

## Technical Highlights

**Non-invasive overlay architecture.** All UI elements are injected at `document.body` level using `position: fixed` with `z-index: 2147483640+`, never touching React's virtual DOM. A `MutationObserver` on `document.body` re-creates overlay elements if they get removed during SPA navigation, making the extension resilient to React re-renders and client-side route changes.

**Event-driven data pipeline.** The service worker (MV3) uses `chrome.webRequest` to intercept the `completion` API endpoint — every time Claude finishes a reply, a re-fetch fires with a 1.5s delay. A `chrome.alarms`-based fallback polls every 60 seconds. The org ID is read from the `lastActiveOrg` cookie, requiring no hardcoded credentials.

**Real-time UI sync via storage events.** Content scripts listen on `chrome.storage.onChanged` rather than polling. Any settings change in the popup propagates instantly to all open tabs without a page refresh.

**Dynamic CSS keyframes.** The halo animation uses `box-shadow` keyframes generated at runtime from the user's custom colors. When colors change, the `<style>` element is replaced in-place, keeping animations smooth without inline style thrashing.

**requestAnimationFrame layout loop.** A single `rAF` loop handles all overlay positioning — halo and send ring track their anchor elements every frame, handling scroll, resize, and layout shifts without polling or `ResizeObserver` overhead. Inline chip updates are throttled to ~1 Hz to avoid unnecessary DOM writes during typing.

**Drag and resize with Pointer Events API.** The floating icon and resize handle use `setPointerCapture` for reliable drag even when the pointer leaves the element, with viewport clamping to keep the icon on-screen at all times. Size and position persist across sessions via `chrome.storage.local`.

**Reset proximity effects.** `float_only.js` animates warning states based on time-to-reset: slow pulse at ≤30 seconds, hard blink at ≤5 seconds, and a drop-shadow "bloom" burst when usage recovers (detected by `prevPct < 40 && newPct > 80`).

**i18n for 8 languages.** A flat key-value dictionary in `i18n.js` covers Chinese, English, Japanese, Korean, French, Russian, Spanish, and Arabic. Language preference persists via storage and switches without a reload.

**Graceful context invalidation.** Every Chrome API call is guarded by a `chrome.runtime.id` check and wrapped in try/catch, preventing console errors when the extension is updated or reloaded while pages are open.

---

## Screenshots

> *(Add screenshots here — halo glow on the input box, floating icon with filled petals, popup panel, context menu with gradient color picker)*

---

## Installation (Developer Mode)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the project folder (the one containing `manifest.json`).
5. Navigate to [claude.ai](https://claude.ai) — the extension activates automatically once you're logged in.

---

## Usage

### Getting started

Log in to Claude.ai. The halo glow and inline countdown appear once the extension fetches your usage data (usually within a few seconds of page load).

### Floating icon

Enable it from the popup (extension icon → "Enable floating icon"). **Drag** to reposition anywhere on screen. **Drag the resize handle** (bottom-right corner, appears on hover) to change size. Both are saved automatically.

**Right-click** the icon for quick access to: hide icon, watermark mode, opacity, halo intensity, color customization, and language.

### Zen mode

Click the Claude logo in the popup header. All UI except the halo glow is hidden — minimal visual footprint, still ambient feedback. Click the spinning logo in the popup to exit.

### Watermark mode

Makes the floating icon non-interactive (`pointer-events: none`) so it doesn't block clicks on page content beneath it.

### Color customization

The gradient bar in the popup (🔋 → 🪫) has three color stops: high-quota (left), low-quota (right), and a draggable midpoint for the transition. Click any stop to open a native color picker. The same control is available in the right-click context menu on the floating icon.

---

## Tech Stack

- **Chrome Extensions Manifest V3** — service worker, `chrome.alarms`, declarative `webRequest`
- **Chrome APIs** — `storage.local`, `cookies`, `webRequest`, `tabs`, `runtime` messaging
- **Vanilla JS** — no frameworks, no build step; IIFE modules with strict mode throughout
- **SVG** — hand-crafted 12-petal icon with per-petal CSS transforms; arc fill via `stroke-dashoffset`
- **CSS animations** — dynamically generated `@keyframes` for 6 halo states; `backdrop-filter` glassmorphism for context menus
- **Pointer Events API** — drag, resize, and `setPointerCapture`
- **requestAnimationFrame** — frame-synchronous overlay positioning
- **MutationObserver** — SPA survival across React-driven navigation

---

## Project Structure

```
Claude-Usage-Monitor/
├── manifest.json    # MV3 extension manifest
├── background.js    # Service worker: fetch, cache, and broadcast usage data
├── content.js       # Full overlay UI injected into claude.ai
├── float_only.js    # Floating icon only, for cross-page mode
├── popup.html       # Extension popup panel
├── popup.js         # Popup logic and settings management
├── i18n.js          # Translations for 8 languages
└── icon.png         # Extension icon
```

---

## Reference

API endpoint and response shape based on [lugia19/Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension).
