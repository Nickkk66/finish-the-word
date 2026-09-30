import assert from 'node:assert/strict';
import { browser, delay } from './browser.mjs';

const b = await browser();
try {
  const base = process.env.BASE || 'http://localhost:8787';
  const host = await b.page('sip-spectator-host', 1280, 800);
  const first = await b.page('sip-spectator-first', 1280, 800);
  const second = await b.page('sip-spectator-second', 1280, 800);
  await host.nav(`${base}/?debug=1`); await host.wait('window.__ftw?.world');
  await host.clickText('Create Private'); await host.wait('window.__ftw.state.inRoom');
  const code = (await host.state()).code;
  for (const page of [first, second]) {
    await page.nav(`${base}/?debug=1&room=${code}`);
    await page.wait('window.__ftw?.world');
    await page.clickText('Join');
    await page.wait('window.__ftw.state.inRoom');
  }
  await host.click('[aria-label="Game Settings"]');
  await host.clickText('Mode:', '.panel-gameSettings button');
  await host.clickText('The Last Sip', '.overlay.choice button');
  await host.shot('rules');
  await host.clickText('Enter Last Sip', '.overlay.confirm button');
  await host.wait('window.__ftw.state.settings.mode === "roulette"');
  await first.send({ t: 'sit', seat: 0 });
  await second.send({ t: 'sit', seat: 1 });
  for (const page of [first, second]) {
    await page.wait('!document.querySelector(".roulette-actions .green").hidden');
    await page.clickText('Enter ·', '.roulette-actions button');
    await page.clickText('Place entry', '.overlay.confirm button');
    await page.wait('window.__ftw.state.players.get(window.__ftw.state.you).rouletteBet === 300');
  }
  const hostState = await host.state();
  assert.equal(hostState.players.find(p => p.id === hostState.you).seat, -1);
  await host.clickText('Begin the ritual');
  await host.wait('window.__ftw.state.match.phase === "roulette"');
  await host.wait('window.__ftw.world.debugSnapshot().roulette.cinematic');
  assert.ok(await host.eval('!!document.querySelector(".roulette-intro")'));
  await delay(3000);
  await host.shot('cinematic');
  assert.deepEqual(host.errors, []);
  console.log('PASS unseated owner sees Last Sip cutscene and meteors');
} finally { await b.close(); }
