import assert from 'node:assert/strict';
import { browser } from './browser.mjs';

const b = await browser();
try {
  const a = await b.page('double-sip', 1100, 780);
  const c = await b.page('double-sip-peer', 820, 700);
  await a.nav('http://127.0.0.1:8787/?debug=1');
  await a.wait('window.__ftw?.world');
  await a.clickText('Create Private');
  await a.wait('window.__ftw.state.inRoom');
  const code = (await a.state()).code;
  await c.nav(`http://127.0.0.1:8787/?debug=1&room=${code}`);
  await c.wait('window.__ftw?.world');
  await c.clickText('Join');
  await c.wait('window.__ftw.state.inRoom');
  await a.send({ t:'host', action:'settings', settings:{ mode:'roulette' } });
  await a.wait('window.__ftw.state.settings.mode==="roulette"');
  await a.wait('!window.__ftw.world.debugSnapshot().roulette.cinematic', 12000);
  await a.send({ t:'sit', seat:0 });
  await c.send({ t:'sit', seat:1 });
  for (const [page, id] of [[a, 'a'], [c, 'c']]) {
    await page.send({ t:'bet', requestId:id, amount:25, balance:500 });
    await page.wait('window.__ftw.state.players.get(window.__ftw.state.you)?.rouletteBet===25');
  }
  await a.send({ t:'host', action:'start' });
  await a.wait('window.__ftw.state.match.phase==="roulette"');
  const actor = (await a.state()).match.typerId === (await a.state()).you ? a : c;
  await actor.wait('[...document.querySelectorAll(".roulette-actions button")].some(e=>e.textContent.includes("Double Sip")&&!e.hidden)');
  await actor.clickText('Double Sip', '.roulette-actions button');
  await actor.wait('window.__ftw.state.match.roulette.event?.action==="double"');
  assert.equal(await actor.eval('document.querySelector(".risk-readout strong")?.textContent'), '60.0%');
  assert.ok((await actor.eval('document.querySelector(".risk-readout")?.style.getPropertyValue("--risk-color")')).includes('hsl(25'));
  await actor.shot('risk');
  assert.deepEqual([...a.errors, ...c.errors], []);
  console.log('PASS Double Sip action and 60% risk presentation');
} finally { await b.close(); }
