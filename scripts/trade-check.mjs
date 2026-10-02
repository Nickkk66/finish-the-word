import assert from 'node:assert/strict';
import { browser } from './browser.mjs';

const base=process.env.BASE||'http://127.0.0.1:8787';
const b = await browser();
try {
  const a = await b.page('trade-sender', 1100, 800);
  const c = await b.page('trade-recipient', 390, 844, true);
  await a.nav(`${base}/?debug=1`);
  await a.wait('window.__ftw?.world');
  await a.eval(`import('./js/profile.js').then(({profile,replaceProfile}) => replaceProfile({...profile,coins:2000,ownedChairs:['wooden','glass']}))`);
  await a.clickText('Create Private');
  await a.wait('window.__ftw.state.inRoom');
  const code = (await a.state()).code;
  await c.nav(`${base}/?debug=1&room=${code}`);
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
  await a.eval(`window.__ftw.state.trade={id:'preview',stage:'open',peerName:'Trader',offer:{items:[]},peerOffer:{items:[]}};window.__ftw.actions.refreshPanels()`);
  assert.equal(await a.eval('!!document.querySelector(".trade-coins, .panel-trade input[type=number]")'),false);
  assert.doesNotMatch(await a.eval('document.querySelector(".panel-trade").textContent'),/Offer coins|0 coins/);
  const result=await a.eval(`(async()=>{const {profile,completeTrade}=await import('/js/profile.js');const before=profile.coins;completeTrade({receipt:'test-item-settlement',partner:'Trader',outgoing:{coins:999999,items:[]},incoming:{coins:99999999,items:[]}});const once=profile.coins;completeTrade({receipt:'test-item-settlement',partner:'Trader',outgoing:{items:[]},incoming:{items:[]}});return {before,once,twice:profile.coins};})()`);
  assert.deepEqual(result,{before:2000,once:2000,twice:2000});
  await a.shot('items-only');
  assert.deepEqual([...a.errors, ...c.errors], []);
  console.log('PASS guest trade gate, portrait picker layout, server age enforcement, items-only offers and immutable cash balance');
} finally { await b.close(); }
