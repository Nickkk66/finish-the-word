import assert from 'node:assert/strict';
import { browser, delay } from './browser.mjs';

const b = await browser();
try {
  const p = await b.page('lighthouse-check', 1280, 800);
  await p.nav(`${process.env.BASE || 'http://127.0.0.1:8787'}/?debug=1`);
  await p.wait('window.__ftw?.world');
  await p.clickText('Create Private');
  await p.wait('window.__ftw.state.inRoom');
  await p.click('[aria-label="Shop"]');
  assert.equal(await p.eval('document.querySelector(".panel-chairs")?.textContent.includes("Tables")'), false);
  assert.equal(await p.eval('window.__ftw.profile.ownedTables'), undefined);
  await p.click('.panel-close');

  await p.eval('window.__ftw.world.teleportLocal({x:-31.85,y:0,z:-30.14})');
  await p.wait('document.querySelector(".w-prompt")?.textContent.includes("Enter lighthouse")');
  await p.shot('entrance');
  await p.eval('document.querySelector(".w-prompt").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');
  await p.wait('window.__ftw.state.zone === "lighthouse"');
  await delay(800);
  await p.shot('interior');
  assert.equal(await p.eval('window.__ftw.world.debugSnapshot().grounded'), true);
  await p.eval('window.__ftw.world.teleportLocal({x:300,y:0,z:11.7})');
  await p.wait('document.querySelector(".w-prompt")?.textContent.includes("Leave lighthouse")');
  await p.eval('document.querySelector(".w-prompt").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');
  await p.wait('window.__ftw.state.zone === "island"');
  await delay(800);
  assert.ok((await p.eval('window.__ftw.world.debugSnapshot().localPosition[0]')) < 0);

  await p.eval('import("./js/profile.js").then(p=>p.grantCoins(100))');
  await p.eval('void window.__ftw.actions.enterRoulette(25)');
  await p.wait('!!document.querySelector(".confirm-details")');
  const confirmation = await p.eval('document.querySelector(".overlay.confirm").textContent');
  assert.match(confirmation, /25 coins/);
  assert.match(confirmation, /Standing up or leaving will not return it/);
  assert.doesNotMatch(confirmation, /Each doubling|returns your entry/);
  await p.shot('entry');
  await p.clickText('Cancel', '.overlay.confirm button');
  assert.deepEqual(p.errors, []);
  console.log('ok lighthouse door, walkable interior and return, mode-only tables, concise committed-entry confirmation');
} finally { await b.close(); }
