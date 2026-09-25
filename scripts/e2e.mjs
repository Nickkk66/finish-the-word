// Browser end-to-end test: one headless Chrome, one isolated profile per player, each driving the
// real game UI (menu → room → seats → turns → shop) against a running server.
//
//   npm run dev                                   (in another terminal)
//   node scripts/e2e.mjs [match|shop|load]        screenshots land in .e2e-shots/
//
// env: BASE (default http://127.0.0.1:8787), BASE_B (second player's site, e.g. the other host),
//      CHROME_BIN (defaults to Playwright's cached chrome-headless-shell). Uses the real GPU (Metal):
//      SwiftShader stalls once two WebGL pages are open. Pages must be opened with ?debug for window.__ftw.
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const OUT = path.join(PROJECT, '.e2e-shots');
mkdirSync(OUT, { recursive: true });
const { default: WORDS } = await import(`${PROJECT}/src/words.js`);
const { createDictionary } = await import(`${PROJECT}/src/dictionary.js`);
const dict = createDictionary(WORDS);

const BIN = process.env.CHROME_BIN || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const profileDir = path.join(os.tmpdir(), `ftw-e2e-${process.pid}`);
const proc = spawn(BIN, ['--remote-debugging-pipe', `--user-data-dir=${profileDir}`, '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
  '--disable-gpu-vsync', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---- CDP plumbing -------------------------------------------------------------------
let seq = 0;
const pending = new Map();
const pages = new Map(); // sessionId -> page
const pipeOut = proc.stdio[3];
function cdp(method, params = {}, sessionId) {
  return new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej, method });
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    pipeOut.write(JSON.stringify(msg) + '\0');
  });
}
let buf = '';
proc.stdio[4].on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let k;
  while ((k = buf.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buf.slice(0, k));
    buf = buf.slice(k + 1);
    if (msg.id) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(`${p.method}: ${JSON.stringify(msg.error)}`));
      else p.res(msg.result);
      continue;
    }
    const page = pages.get(msg.sessionId);
    if (!page) continue;
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      page.logs.push(`[${msg.params.type}] ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      page.logs.push(`[exception] ${d.exception?.description ?? d.text}`);
    } else if (msg.method === 'Log.entryAdded') {
      page.logs.push(`[log ${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
    }
  }
});

async function newPage(name, { width = 1280, height = 800, mobile = false } = {}) {
  const { browserContextId } = await cdp('Target.createBrowserContext', {});
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  const page = { name, sessionId, logs: [] };
  pages.set(sessionId, page);
  const s = (m, p) => cdp(m, p, sessionId);
  page.cdp = s;
  await s('Runtime.enable');
  await s('Log.enable');
  await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // Keep every page "visible" so rAF/timers aren't throttled like a background tab.
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  page.eval = async (expr) => {
    const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`[${name}] eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}\n  in: ${expr.slice(0, 200)}`);
    return r.result?.value;
  };
  page.nav = (url) => s('Page.navigate', { url });
  page.shot = async (label) => {
    const r = await s('Page.captureScreenshot', { format: 'png' });
    const file = `${OUT}/${name}-${label}.png`;
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    log(`shot ${file}`);
  };
  page.key = async (key, code, vk, text) => {
    await s('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text });
    await s('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  };
  page.typeText = async (text) => {
    for (const ch of text) {
      const up = ch.toUpperCase();
      await page.key(ch, `Key${up}`, up.charCodeAt(0), ch);
      await sleep(25);
    }
  };
  page.enter = () => page.key('Enter', 'Enter', 13, '\r');
  page.waitFor = async (expr, timeout = 15000, label = expr) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        const v = await page.eval(expr);
        if (v) return v;
      } catch { /* page may still be loading */ }
      await sleep(150);
    }
    throw new Error(`[${name}] timed out waiting for: ${label}`);
  };
  page.state = () => page.eval(`(() => { const s = window.__ftw?.state; return s && JSON.parse(JSON.stringify({ you: s.you, code: s.code, inRoom: s.inRoom, hostId: s.hostId, match: s.match, players: [...s.players.values()] })); })()`);
  page.clickText = (selector, text) => page.eval(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((el) => el.textContent.includes(${JSON.stringify(text)}) && !el.disabled); if (!b) return false; b.click(); return true; })()`);
  page.send = (msg) => page.eval(`window.__ftw.net.send(${JSON.stringify(msg)})`);
  return page;
}

async function openMenu(page, url, name) {
  await page.nav(url);
  await page.waitFor(`!!document.querySelector('.name-input') && !!window.__ftw`, 30000, 'menu');
  await page.eval(`(() => { const i = document.querySelector('.name-input'); i.value = ${JSON.stringify(name)}; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); })()`);
}

function errorsOf(page) {
  return page.logs.filter((l) => /\[(exception|error|log error|warning)\]|\[log warning\]/.test(l) && !/fonts\.g/.test(l));
}

// ---- Scenario -----------------------------------------------------------------------
const scenario = process.argv[2] || 'match';
const result = { ok: false, notes: [] };

// Shop flow: buy + equip a chair, hatch + equip a pet, sit; a second player must see both.
async function shopScenario() {
  const A = await newPage('A');
  await openMenu(A, `${BASE}/?debug=1`, 'Alice');
  await A.eval(`(() => { const p = JSON.parse(localStorage.getItem('ftw_profile_v1')); p.coins = 40000; localStorage.setItem('ftw_profile_v1', JSON.stringify(p)); })()`);
  await openMenu(A, `${BASE}/?debug=1`, 'Alice');
  if (!(await A.clickText('button', 'Create Private Game'))) throw new Error('no Create Private Game button');
  await A.waitFor('window.__ftw.state.inRoom', 20000, 'A inRoom');
  const { code } = await A.state();

  await A.eval(`document.querySelector('.side-btn[aria-label="Shop"]').click()`);
  await sleep(800);
  await A.shot('chairs-panel');
  const buy = `(() => { const card = [...document.querySelectorAll('.item-card')].find((c) => c.textContent.includes('Throne')); card.querySelector('button').click(); return card.querySelector('button').textContent; })()`;
  log('throne button after buy:', await A.eval(buy));
  await A.clickText('.confirm button', 'Buy');
  await sleep(400);
  log('throne button after 2nd click:', await A.eval(buy));
  await A.eval(`document.querySelector('.side-btn[aria-label="Pets"]').click()`);
  await sleep(600);
  if (!(await A.clickText('button', 'Open · 300'))) throw new Error('no Open block button');
  await A.clickText('.confirm button', 'Buy');
  await A.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent === 'Equip' && b.offsetParent)`, 10000, 'hatch Equip button');
  await sleep(1200);
  await A.shot('hatch');
  await A.clickText('button', 'Equip');
  await sleep(1500);
  const prof = await A.eval(`JSON.parse(localStorage.getItem('ftw_profile_v1'))`);
  log('A profile:', JSON.stringify({ coins: prof.coins, equippedChair: prof.equippedChair, equippedPet: prof.equippedPet, pets: prof.pets }));
  await A.send({ t: 'sit', seat: 0 });
  await sleep(2500);
  await A.shot('seated-throne');

  const B = await newPage('B');
  await openMenu(B, `${process.env.BASE_B || BASE}/?room=${code}&debug=1`, 'Bob');
  if (!(await B.clickText('button', 'Join Game'))) throw new Error('no Join Game button for B');
  await B.waitFor('window.__ftw.state.inRoom', 20000, 'B inRoom');
  await sleep(2500);
  const seenByB = await B.eval(`(() => { const a = [...window.__ftw.state.players.values()].find((p) => p.name === 'Alice'); return a && { chair: a.chair, pet: a.pet, seat: a.seat }; })()`);
  log('B sees Alice as', JSON.stringify(seenByB));
  await B.shot('sees-alice');
  await B.send({ t: 'sit', seat: 4 });
  await sleep(2500);
  await B.shot('seated');
  if (seenByB?.chair !== 'throne' || !seenByB?.pet) throw new Error('B does not see Alice\'s loadout');
  result.notes.push(`alice=${JSON.stringify(seenByB)}`);
  result.ok = true;
}

try {
  if (scenario === 'load') {
    // Page loads from BASE (e.g. a subfolder), the world starts, and nothing 404s.
    const A = await newPage('A');
    await A.cdp('Network.enable');
    const failed = [];
    A.onResponse = (r) => { if (r.status >= 400) failed.push(`${r.status} ${r.url}`); };
    await openMenu(A, `${BASE}?debug=1`, 'Alice');
    await A.waitFor('!!window.__ftw.world', 20000, 'world created');
    await sleep(2500);
    await A.shot('load');
    const bad = await A.eval(`performance.getEntriesByType('resource').filter((e) => e.responseStatus >= 400).map((e) => e.responseStatus + ' ' + e.name)`);
    log('failed resources:', JSON.stringify(bad));
    if (bad.length) throw new Error('resources failed to load');
    result.ok = true;
    throw 'done';
  }
  if (scenario === 'shop') {
    await shopScenario();
    throw 'done';
  }
  const A = await newPage('A');
  await openMenu(A, `${BASE}/?debug=1`, 'Alice');
  await sleep(2500);
  await A.shot('menu');
  if (!(await A.clickText('button', 'Create Private Game'))) throw new Error('no Create Private Game button');
  await A.waitFor('window.__ftw.state.inRoom', 20000, 'A inRoom');
  const { code } = await A.state();
  log('room', code, 'url', await A.eval('location.href'));

  const B = await newPage('B');
  await openMenu(B, `${process.env.BASE_B || BASE}/?room=${code}&debug=1`, 'Bob');
  if (!(await B.clickText('button', 'Join Game'))) throw new Error('no Join Game button for B');
  await B.waitFor('window.__ftw.state.inRoom', 20000, 'B inRoom');

  const C = await newPage('C', { width: 390, height: 844, mobile: true });
  await openMenu(C, `${BASE}/?room=${code}&debug=1`, 'Cara');
  if (!(await C.clickText('button', 'Join Game'))) throw new Error('no Join Game button for C');
  await C.waitFor('window.__ftw.state.inRoom', 20000, 'C inRoom');
  await sleep(1500);
  await A.shot('lobby');
  await C.shot('lobby-mobile');

  const players = [A, B, C];
  const ids = {};
  for (const p of players) ids[p.name] = (await p.state()).you;
  const nameById = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));

  // One-heart match keeps the browser gate bounded; multi-heart rules have unit coverage.
  await A.send({ t: 'host', action: 'settings', settings: { hearts: 1, turnSeconds: 10, petAbilities: false } });
  await A.send({ t: 'sit', seat: 0 });
  await B.send({ t: 'sit', seat: 3 });
  await C.send({ t: 'sit', seat: 5 });
  await A.send({ t: 'host', action: 'addBot' });
  await sleep(2500);
  await A.shot('seated');
  await B.shot('seated');
  await A.send({ t: 'host', action: 'start' });

  // Play until the match ends. B makes one wrong guess first; C stops answering after 2 words.
  const used = new Set();
  const wordsBy = { A: 0, B: 0, C: 0 };
  let bWrongDone = false;
  const shots = new Set();
  const handledTurn = new Set();
  const deadline = Date.now() + 240000;
  let ended = null;
  while (Date.now() < deadline) {
    const s = await A.state();
    const m = s.match;
    for (const c of m.chain) used.add(c.word);
    if (m.phase === 'ended') { ended = m; break; }
    if (m.phase === 'choosing') {
      const who = nameById[m.chooserId];
      const key = `choose-${m.round}`;
      if (who && !handledTurn.has(key)) {
        const page = players.find((p) => p.name === who);
        await page.waitFor(`!!document.querySelector('.letter-btn')`, 5000, 'letter picker');
        if (!shots.has('pick')) { shots.add('pick'); await page.shot('picker'); }
        await sleep(600);
        await page.eval(`document.querySelector('.letter-btn').click()`);
        handledTurn.add(key);
        log(`${who} picked a letter`);
      }
    } else if (m.phase === 'typing') {
      const who = nameById[m.typerId];
      const key = `type-${m.wordCount}-${m.round}-${m.typerId}`;
      if (who && !handledTurn.has(key)) {
        handledTurn.add(key);
        const page = players.find((p) => p.name === who);
        await sleep(700);
        if (who === 'B' && wordsBy.B >= 3) {
          await B.send({ t: 'stand' });
          log('B forfeits after three valid words so the scenario has a definite finish');
          continue;
        }
        if (who === 'C' && wordsBy.C >= 2) {
          log(`C lets the timer run out (prefix ${m.prefix})`);
          if (!shots.has('timeout')) { shots.add('timeout'); await sleep(3000); await C.shot('waiting-timeout'); }
          continue;
        }
        if (who === 'B' && !bWrongDone) {
          bWrongDone = true;
          await B.typeText('qzxvk');
          await B.enter();
          await sleep(900);
          await B.shot('wrong-word');
          log('B submitted a wrong word; mistakes now', (await B.state()).match.mistakes);
        }
        const word = dict.randomWithPrefix(m.prefix, used, Math.random, { minLen: 4, maxLen: 8 });
        if (!word) { log(`no word for ${m.prefix}`); continue; }
        await page.eval(`(() => { const i = document.querySelector('.word-field'); i.value = ${JSON.stringify(m.prefix)}; i.setSelectionRange(i.value.length, i.value.length); })()`);
        const suffix = word.slice(m.prefix.length);
        await page.typeText(suffix.slice(0, Math.ceil(suffix.length / 2)));
        if (!shots.has(`typing-${who}`)) {
          shots.add(`typing-${who}`);
          await sleep(300);
          await page.shot('typing-self');
          const other = players.find((p) => p !== page);
          await other.shot(`sees-${who}-typing`);
        }
        await page.typeText(suffix.slice(Math.ceil(suffix.length / 2)));
        await page.enter();
        used.add(word);
        wordsBy[who]++;
        log(`${who} played ${word} (prefix ${m.prefix})`);
        if (!shots.has('after-word')) { shots.add('after-word'); await sleep(700); await A.shot('after-word'); }
      }
    } else if (m.phase === 'roundEnd' && !shots.has('roundEnd')) {
      shots.add('roundEnd');
      await A.shot('round-end');
    }
    await sleep(250);
  }
  if (!ended) throw new Error('match did not end in time');
  log('match ended; winner', nameById[ended.winnerId] || ended.winnerId, 'words', ended.wordCount);
  await sleep(600);
  for (const p of players) await p.shot('ended');
  await sleep(6000);
  const after = await A.state();
  log('phase after end:', after.match.phase);
  result.notes.push(`winner=${nameById[ended.winnerId] || ended.winnerId}`, `words=${ended.wordCount}`, `after=${after.match.phase}`);
  const coins = await Promise.all(players.map((p) => p.eval(`JSON.parse(localStorage.getItem('ftw_profile_v1')||'{}').coins`)));
  result.notes.push(`coins=${coins.join('/')}`);
  result.ok = true;
} catch (err) {
  if (err === 'done') { /* scenario finished early */ } else {
  result.error = String(err.stack || err);
  for (const p of pages.values()) {
    try { await p.shot('failure'); } catch { /* ignore */ }
  }
  }
} finally {
  for (const p of pages.values()) {
    const errs = errorsOf(p);
    console.log(`--- ${p.name}: ${p.logs.length} console lines, ${errs.length} errors/warnings`);
    for (const e of errs.slice(0, 15)) console.log('   ', e.slice(0, 300));
  }
  console.log(JSON.stringify(result, null, 1));
  proc.kill();
  process.exit(result.ok ? 0 : 1);
}
