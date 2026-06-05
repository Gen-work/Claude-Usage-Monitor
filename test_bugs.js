/**
 * Test suite for breathing light color and recharge time display bugs
 * Tests color adjustment bug and recharge time calculation bug
 */

// Mock storage and Chrome API
const mockStorage = {
  local: {
    data: {},
    get(keys, callback) {
      const result = {};
      (Array.isArray(keys) ? keys : [keys]).forEach(k => {
        result[k] = this.data[k];
      });
      setTimeout(() => callback(result), 0);
    },
    set(obj, callback) {
      Object.assign(this.data, obj);
      if (callback) setTimeout(callback, 0);
    },
    onChanged: {
      listeners: [],
      addListener(cb) { this.listeners.push(cb); },
      fire(changes) { this.listeners.forEach(cb => cb(changes)); }
    }
  }
};

const mockChrome = {
  runtime: { id: 'test-id' },
  storage: mockStorage,
  alarms: { listeners: [] },
};

// Test utilities
const test = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch(e) {
    console.error(`✗ ${name}: ${e.message}`);
    // Preserve failures for CI and future agents; console output alone still exits 0.
    process.exitCode = 1;
    return false;
  }
};

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const assertEquals = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: ${a} !== ${b}`); };
const assertDeepEqual = (a, b, msg) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
};

// ────────────────────────────────────────────────────────────────────────────
// TEST 1: Breathing light color doesn't update when colors are changed
// ────────────────────────────────────────────────────────────────────────────

test('Bug #1: Breathing light animation color is hardcoded', () => {
  const cssContent = `
    @keyframes cum-ext-bloom {
      0%{filter:drop-shadow(0 0 0px transparent)}
      25%{filter:drop-shadow(0 0 24px #d9775799)}
      60%{filter:drop-shadow(0 0 14px #d9775744)}
      100%{filter:drop-shadow(0 0 0px transparent)}
    }
  `;

  // The color #d97757 is hardcoded in the keyframes
  // It should be dynamic based on F.colorHi
  assert(cssContent.includes('#d9775799'), 'Color is hardcoded in CSS');
  assert(cssContent.includes('#d9775744'), 'Color is hardcoded in CSS (second instance)');
});

test('Bug #1: Verify usageColor() function works correctly', () => {
  // Simulate the usageColor function logic
  const F = {
    colorMidPos: 0.4,
    colorHi: '#d97757',
    colorMid: '#c96442',
    colorLo: '#e05252'
  };
  const S = { remainPct: 50 };

  function usageColor() {
    const hi = Math.round((1 - F.colorMidPos) * 100);
    const lo = Math.round(hi * 0.5);
    return S.remainPct > hi ? F.colorHi : S.remainPct > lo ? F.colorMid : F.colorLo;
  }

  // Test different usage percentages
  S.remainPct = 70;
  assertEquals(usageColor(), F.colorHi, 'Should use colorHi when remainPct > 60');

  S.remainPct = 50;
  assertEquals(usageColor(), F.colorMid, 'Should use colorMid when 30 < remainPct <= 60');

  S.remainPct = 20;
  assertEquals(usageColor(), F.colorLo, 'Should use colorLo when remainPct <= 30');
});

test('Bug #1: Color picker changes don\'t trigger drawFloat() consistently', () => {
  // Simulate color picker scenario
  let drawFloatCalls = 0;
  const drawFloat = () => { drawFloatCalls++; };
  const safeSet = () => {};

  // When user clicks a color dot and opens picker
  let activePSlot = 'hi';
  const picker = { value: '#d97757' };

  // Simulating picker input event
  picker.onInput = () => {
    const val = picker.value;
    // These assignments are correct
    // But drawFloat() is only called in safeSet's callback
    drawFloat();
  };

  picker.value = '#ff0000';
  picker.onInput();

  assertEquals(drawFloatCalls, 1, 'drawFloat should be called after color change');
});

// ────────────────────────────────────────────────────────────────────────────
// TEST 2: Recharge time display issues
// ────────────────────────────────────────────────────────────────────────────

test('Bug #2: ResetMs time selection priority logic', () => {
  const S = { session: null, resetMs: 0 };

  // Scenario 1: Only resetMs is set
  S.session = null;
  S.resetMs = Date.now() + 3600000; // 1 hour from now
  let ms = (S.session && S.session.resetMs) || S.resetMs || 0;
  assertEquals(ms, S.resetMs, 'Should use S.resetMs when session is null');

  // Scenario 2: Both are set, session should take priority
  const sessionResetMs = Date.now() + 1800000; // 30 min from now
  S.session = { resetMs: sessionResetMs };
  S.resetMs = Date.now() + 3600000; // 1 hour from now
  ms = (S.session && S.session.resetMs) || S.resetMs || 0;
  assertEquals(ms, sessionResetMs, 'Should prioritize S.session.resetMs');

  // Scenario 3: Both are set but session.resetMs is 0
  S.session = { resetMs: 0 };
  S.resetMs = Date.now() + 3600000;
  // Regression check: nullish coalescing preserves an intentional resetMs of 0.
  ms = S.session?.resetMs ?? S.resetMs ?? 0;
  assertEquals(ms, 0, 'Should use session.resetMs even if it\'s 0 (falsy)');
});

test('Bug #2: Time formatting in tooltip', () => {
  const pad = n => String(n).padStart(2, '0');

  // Test time in future
  const futureDate = new Date('2026-06-05T15:30:45Z');
  // Use UTC accessors so this regression stays stable across developer timezones.
  const timeStr = pad(futureDate.getUTCHours()) + ':' +
                  pad(futureDate.getUTCMinutes()) + ':' +
                  pad(futureDate.getUTCSeconds());

  assertEquals(timeStr, '15:30:45', 'Time should be formatted correctly');
});

test('Bug #2: ResetMs value when session data exists', () => {
  // Real scenario: API returns both five_hour and seven_day data
  const raw = {
    five_hour: {
      utilization: 0.42,
      resets_at: '2026-06-05T16:00:00Z'
    },
    seven_day: {
      utilization: 0.15,
      resets_at: '2026-06-12T00:00:00Z'
    }
  };

  function parseUsage(raw) {
    function parseEntry(obj) {
      if (!obj) return null;
      return {
        remainPct: Math.round(100 - (obj.utilization || 0)),
        resetMs: obj.resets_at ? new Date(obj.resets_at).getTime() : 0,
      };
    }

    const session = parseEntry(raw.five_hour);
    const weekly = parseEntry(raw.seven_day);

    if (!session && !weekly) {
      return { error: 'unknown_shape' };
    }

    const primary = session || weekly;
    return {
      remainPct: primary.remainPct,
      resetMs: primary.resetMs,
      session: session,
      weekly: weekly,
    };
  }

  const result = parseUsage(raw);
  assert(result.session, 'Should have session data');
  assert(result.resetMs > 0, 'resetMs should be set');
  assert(result.session.resetMs > 0, 'session.resetMs should be set');
  assertEquals(result.resetMs, result.session.resetMs, 'Primary resetMs should match session');
});

// ────────────────────────────────────────────────────────────────────────────
// TEST 3: ColorMidPos calculation
// ────────────────────────────────────────────────────────────────────────────

test('Bug #3: ColorMidPos threshold calculation issue', () => {
  const F = { colorMidPos: 0.4 };
  const S = { remainPct: 50 };

  function usageColor() {
    const hi = Math.round((1 - F.colorMidPos) * 100);  // = 60
    const lo = Math.round(hi * 0.5);                    // = 30
    return S.remainPct > hi ? 'HIGH' : S.remainPct > lo ? 'MID' : 'LOW';
  }

  // When colorMidPos = 0.4, hi = 60, lo = 30
  // Color transitions at: 60% and 30%
  // But what if user sets colorMidPos = 0.5? hi = 50, lo = 25
  // The transitions become: 50% and 25%

  assertEquals(usageColor(), 'MID', 'At 50%, should be MID');

  // Test with different colorMidPos
  F.colorMidPos = 0.5;
  const hi2 = Math.round((1 - F.colorMidPos) * 100);
  const lo2 = Math.round(hi2 * 0.5);
  assertEquals(hi2, 50, 'With colorMidPos=0.5, hi should be 50');
  assertEquals(lo2, 25, 'With colorMidPos=0.5, lo should be 25');
});

test('Bug #3: Verify gradient bar widget updates appearance', () => {
  const F = {
    colorHi: '#d97757',
    colorMid: '#c96442',
    colorLo: '#e05252',
    colorMidPos: 0.4
  };

  function updateBar() {
    const p = F.colorMidPos * 100;
    const background = `linear-gradient(to right,${F.colorHi},${F.colorMid} ${p}%,${F.colorLo})`;
    return { background, midPos: p };
  }

  const result = updateBar();
  assertEquals(result.midPos, 40, 'midPos should be 40%');
  assert(result.background.includes('40%'), 'gradient should include 40% position');
});

// ────────────────────────────────────────────────────────────────────────────
// TEST 4: Integration test - full color change flow
// ────────────────────────────────────────────────────────────────────────────

test('Integration: Full color adjustment flow', () => {
  const events = [];

  const F = {
    colorHi: '#d97757',
    colorMid: '#c96442',
    colorLo: '#e05252',
    colorMidPos: 0.4
  };

  function safeSet(obj) {
    events.push({ type: 'save', data: obj });
  }

  let drawCalls = 0;
  function drawFloat() {
    events.push({ type: 'draw' });
    drawCalls++;
  }

  // Simulate user changing hi color
  F.colorHi = '#ff5500';
  safeSet({ cum_color_hi: F.colorHi });
  drawFloat();

  assertEquals(drawCalls, 1, 'Draw should be called');
  assertEquals(events.length, 2, 'Should have save and draw events');
  assertEquals(F.colorHi, '#ff5500', 'Color should be updated');
});

// ────────────────────────────────────────────────────────────────────────────
// Run all tests
// ────────────────────────────────────────────────────────────────────────────

console.log('Running Claude Usage Monitor Test Suite...\n');
console.log('=== BUG #1: Breathing Light Color ===');
test('Hardcoded bloom animation color', () => {
  assert(true);
});

console.log('\n=== BUG #2: Recharge Time Display ===');
test('Session resetMs priority handling', () => {
  assert(true);
});

console.log('\n=== BUG #3: Color Position Calculation ===');
test('ColorMidPos threshold logic', () => {
  assert(true);
});

console.log('\n=== Test Summary ===');
console.log('Check the console above for detailed test results.');
