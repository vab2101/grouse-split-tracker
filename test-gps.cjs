// GPS-spoofing integration test using Puppeteer + real Chrome
// Tests: start screen states, Instructions button, tag button visibility,
//        Approaching→Passing transition, auto-commit after exit fixes.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const URL = 'http://localhost:5173';
const SHOTS = '/tmp/gps-test-shots';
fs.mkdirSync(SHOTS, { recursive: true });

// Marker 1 position
const M1 = { lat: 49.3706139, lng: -123.0946675 };
const TRAILHEAD = { lat: 49.3711800, lng: -123.0983900 };

// Direction from M0→M1 in deg/m
const DLat = -2.044e-6;  // degrees per metre along trail
const DLng = +1.344e-5;

// GPS point N metres before (negative) or after (positive) marker 1
function offset(m) {
  return { latitude: M1.lat - m * DLat, longitude: M1.lng - m * DLng, accuracy: 10 };
}

let shotIdx = 0;
async function shot(page, name) {
  const p = path.join(SHOTS, `${String(shotIdx++).padStart(2,'0')}-${name}.png`);
  await page.screenshot({ path: p });
  console.log(`  📸 ${path.basename(p)}`);
}

async function waitForText(page, text, timeout = 5000) {
  try {
    await page.waitForFunction(
      (t) => document.body.innerText.includes(t),
      { timeout },
      text
    );
    return true;
  } catch { return false; }
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

let pass = 0, fail = 0;
function ok(label)       { console.log(`  ✅  ${label}`); pass++; }
function ko(label, info) { console.log(`  ❌  ${label}${info ? `\n       got: ${info}` : ''}`); fail++; }

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(URL, ['geolocation']);

    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    // Set initial GPS to trailhead BEFORE loading so watchPosition fires immediately
    await page.setGeolocation({ latitude: TRAILHEAD.lat, longitude: TRAILHEAD.lng, accuracy: 10 });

    // ── 0. Load & clear stale state ──────────────────────────────────────────
    console.log('\n── 0. Load page ──');
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(() => {
      localStorage.removeItem('bcmc-active-hike');
      localStorage.removeItem('bcmc-hike-attempts');
      localStorage.removeItem('bcmc-marker-gps');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 600));
    await shot(page, 'loaded');

    // ── 1. Start screen — state 0 ─────────────────────────────────────────
    console.log('\n── 1. Start screen (state 0) ──');
    const hasParking = await waitForText(page, 'In Parking Lot', 5000);
    hasParking ? ok('"In Parking Lot" button present') : ko('"In Parking Lot" button missing');

    // START should not be visible yet
    const allBtns = await page.evaluate(() =>
      [...document.querySelectorAll('button')].map(b => b.innerText.trim()).join(' | ')
    );
    !allBtns.includes('START') ? ok('START not visible in state 0') : ko('START shown too early', allBtns);

    // Tag button visible on start screen
    const tagBtn = await page.$('[aria-label="Tag trail markers"]');
    tagBtn ? ok('Tag (marker collector) button visible on start screen') : ko('Tag button missing on start screen');

    // Instructions button visible
    allBtns.includes('Instructions') ? ok('"Instructions" button present') : ko('"Instructions" button missing', allBtns);

    // ── 2. Click "In Parking Lot" → state 1 ─────────────────────────────
    console.log('\n── 2. Click "In Parking Lot" ──');
    const parkingBtn = await page.evaluateHandle(() =>
      [...document.querySelectorAll('button')].find(b => b.innerText.includes('In Parking Lot'))
    );
    await parkingBtn.click();
    await new Promise(r => setTimeout(r, 1500));

    const allBtns2 = await page.evaluate(() =>
      [...document.querySelectorAll('button')].map(b => b.innerText.trim()).join(' | ')
    );
    allBtns2.includes('START') ? ok('START button appears after parking lot click') : ko('START button did not appear', allBtns2);

    // GPS accuracy badge present (No GPS or Xm)
    const body2 = await bodyText(page);
    const hasGpsBadge = /\b\d+m\b/.test(body2.replace('km', '')) || body2.includes('No GPS');
    hasGpsBadge ? ok('GPS accuracy badge visible in state 1') : ko('GPS accuracy badge not found', body2.slice(0, 200));

    await shot(page, 'state1-gps-badge');

    // Tag button still shown in state 1
    const tagBtn2 = await page.$('[aria-label="Tag trail markers"]');
    tagBtn2 ? ok('Tag button still visible in state 1') : ko('Tag button disappeared in state 1');

    // ── 3. Click START → hike begins ─────────────────────────────────────
    console.log('\n── 3. Click START ──');
    const startBtn = await page.evaluateHandle(() =>
      [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'START')
    );
    await startBtn.click();
    await new Promise(r => setTimeout(r, 800));

    const hasElapsed = await waitForText(page, 'Elapsed', 3000);
    hasElapsed ? ok('Active hike screen visible') : ko('Active hike screen not shown');

    // Tag button hidden during active hike
    await new Promise(r => setTimeout(r, 300));
    const tagDuring = await page.$('[aria-label="Tag trail markers"]');
    !tagDuring ? ok('Tag button hidden during active hike') : ko('Tag button still visible during hike');

    await shot(page, 'hike-started');

    // ── 4. 50 m before M1 — no approach label ────────────────────────────
    console.log('\n── 4. GPS 50 m before marker 1 (outside zone) ──');
    await page.setGeolocation(offset(-50));
    await new Promise(r => setTimeout(r, 1200));
    const body4 = await bodyText(page);
    const noApproach4 = !body4.includes('Approaching') && !body4.includes('Passing');
    noApproach4 ? ok('No approach label 50 m out (outside zone)') : ko('Unexpected approach label at 50 m', body4.slice(0, 150));
    const distMatch = body4.match(/~\d+ m to marker/);
    console.log(`     distance label: ${distMatch ? distMatch[0] : '(none found)'}`);

    // ── 5. 12 m before M1 — enter zone → "Approaching" ───────────────────
    console.log('\n── 5. GPS 12 m before M1 → "Approaching" ──');
    await page.setGeolocation(offset(-12));
    await new Promise(r => setTimeout(r, 1200));
    const hasApproaching = await waitForText(page, 'Approaching', 3000);
    hasApproaching ? ok('"Approaching" shown at 12 m before marker') : ko('"Approaching" not shown', (await bodyText(page)).slice(0, 200));
    await shot(page, 'approaching');

    // ── 6. Exactly at M1 — still "Approaching" (best distance still updating) ─
    console.log('\n── 6. GPS exactly at M1 ──');
    await page.setGeolocation({ latitude: M1.lat, longitude: M1.lng, accuracy: 10 });
    await new Promise(r => setTimeout(r, 900));
    const body6 = await bodyText(page);
    const stillApproaching = body6.includes('Approaching') && !body6.includes('Passing');
    stillApproaching ? ok('Still "Approaching" at best point') : ko('Unexpected label at marker', body6.slice(0, 200));

    // ── 7. 8 m past M1 — in zone, moving away → "Passing" ────────────────
    console.log('\n── 7. GPS 8 m past M1 → "Passing" ──');
    await page.setGeolocation(offset(8));
    await new Promise(r => setTimeout(r, 1000));
    const body7 = await bodyText(page);
    const hasPassing = body7.includes('Passing');
    const noApproach7 = !body7.includes('Approaching');
    hasPassing ? ok('"Passing" shown at 8 m past marker') : ko('"Passing" not shown', body7.slice(0, 200));
    noApproach7 ? ok('"Approaching" cleared when switching to "Passing"') : ko('"Approaching" still shown alongside "Passing"');
    await shot(page, 'passing');

    // ── 8. 20 m past — exit fix 1 ─────────────────────────────────────────
    console.log('\n── 8. GPS 20 m past — exit fix 1 ──');
    await page.setGeolocation(offset(20));
    await new Promise(r => setTimeout(r, 1000));
    // Not asserting — just showing what's visible
    const body8 = await bodyText(page);
    console.log(`     Label: ${body8.includes('Passing') ? '"Passing" (still in zone or exit fix 1)' : body8.includes('Approaching') ? '"Approaching"' : '(cleared)'}`);

    // ── 9. 35 m past — exit fix 2 → auto-commit ──────────────────────────
    console.log('\n── 9. GPS 35 m past — exit fix 2 → auto-commit ──');
    await page.setGeolocation(offset(35));
    await new Promise(r => setTimeout(r, 2500));
    const body9 = await bodyText(page);
    // After commit: split timer header shows "since marker 1"; button advances to 2
    const splitCommitted = body9.includes('since marker 1');
    const labelCleared = !body9.includes('Approaching') && !body9.includes('Passing');
    splitCommitted ? ok('Split timer shows "since marker 1" (marker 1 committed)') : ko('No "since marker 1" in timer after expected commit', body9.slice(0, 300));
    labelCleared ? ok('Approach/passing labels cleared after commit') : ko('Approach label still showing after commit', body9.slice(0, 200));
    await shot(page, 'auto-committed');

    // ── 10. Bounce check ──────────────────────────────────────────────────
    console.log('\n── 10. Bounce check — back near M1 with nextMarker=2 ──');
    await page.setGeolocation({ latitude: M1.lat, longitude: M1.lng, accuracy: 10 });
    await new Promise(r => setTimeout(r, 1000));
    const body10 = await bodyText(page);
    !body10.includes('Passing') ? ok('No "Passing" for old marker after commit (state reset)') : ko('"Passing" bounced back', body10.slice(0, 200));

  } finally {
    await browser.close();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`Results: ${pass} passed, ${fail} failed`);
  console.log(`Screenshots saved to ${SHOTS}/`);
  if (fail > 0) process.exitCode = 1;
})();
