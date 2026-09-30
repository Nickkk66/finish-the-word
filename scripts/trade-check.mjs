import assert from 'node:assert/strict';
import { browser } from './browser.mjs';

const b = await browser();
try {
  const a = await b.page('trade-sender', 1100, 800);
  const c = await b.page('trade-recipient', 390, 844, true);
  await a.nav('http://127.0.0.1:8787/?debug=1');
  await a.wait('window.__ftw?.world');
  await a.eval(`import('./js/profile.js').then(({profile,replaceProfile}) => replaceProfile({...profile,coins:2000,ownedChairs:['wooden','glass']}))`);
  await a.clickText('Create Private');
  await a.wait('window.__ftw.state.inRoom');
  const code = (await a.state()).code;
  await c.nav(`http://127.0.0.1:8787/?debug=1&room=${code}`);
  await c.wait('window.__ftw?.world');
  await c.clickText('Join');
  await c.wait('window.__ftw.state.inRoom');
  await a.click('[aria-label="Trade"]');
  assert.match(await a.eval('document.querySelector(".panel-trade")?.textContent'), /Sign in to trade/);
  await a.eval('window.__ftw.state.account={status:"saved",createdAt:Date.now()-90000000};window.__ftw.actions.refreshPanels()');
  assert.equal(await a.eval('document.querySelector(".trade-request-avatar svg")?.getAttribute("viewBox")'), '0 0 140 112');
  await a.shot('request-picker');
  await a.clickText('Request trade', '.panel-trade button');
  await a.wait('[...document.querySelectorAll(".toast")].some(e=>e.textContent.includes("24 hours"))');
  assert.equal(await a.eval('window.__ftw.state.trade'), null);
  assert.deepEqual([...a.errors, ...c.errors], []);
  console.log('PASS guest trade gate, portrait picker layout, and server age enforcement');
} finally { await b.close(); }
