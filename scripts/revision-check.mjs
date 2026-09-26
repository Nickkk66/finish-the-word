// Browser regression check for the settings, account-independent UI and admin controls.
import assert from 'node:assert/strict';
import { browser, delay } from './browser.mjs';

const b = await browser();
try {
  const p = await b.page('revision', 1280, 800);
  await p.nav(`${process.env.BASE || 'http://127.0.0.1:8787'}/?debug=1`);
  await p.wait('window.__ftw?.world');
  await p.clickText('Create Private');
  await p.wait('window.__ftw.state.inRoom');

  await p.click('[aria-label="Cards"]');
  await p.clickText('Use card', '.collection-card button');
  await p.wait('!!document.querySelector(".overlay.notice")');
  assert.match(await p.eval('document.querySelector(".overlay.notice").textContent'), /don.t own/i);
  await p.shot('card-notice');
  await p.key('Escape', 'Escape', 27);
  assert.equal(await p.eval('document.querySelector(".overlay.notice")?.classList.contains("leaving")'), true);
  await delay(220);
  assert.equal(await p.eval('!!document.querySelector(".overlay.notice")'), false);
  await p.eval('import("./js/profile.js").then(({grantCoins}) => grantCoins(2000))');
  await p.wait('window.__ftw.profile.coins >= 2000');
  await p.clickText('Open · 1,500', '.block-card button');
  await p.clickText('Buy', '.overlay.confirm button');
  await p.wait('!!document.querySelector(".card-mystery")');
  await p.shot('card-mystery');
  await p.wait('!!document.querySelector(".card-reveal-front:not([hidden])")');
  assert.equal(await p.eval('!!document.querySelector(".card-reveal-front .card-rarity")'), true);
  await p.shot('card-reveal');
  await p.clickText('Collect', '.card-reveal button');
  await delay(220);

  await p.click('[aria-label="Game Settings"]');
  await p.clickText('Mode:', '.panel-gameSettings button');
  await p.wait('!!document.querySelector(".overlay.choice")');
  await p.shot('mode-choice');
  await p.clickText('Blitz', '.overlay.choice button');
  await p.wait('window.__ftw.state.settings.mode === "blitz"');
  assert.equal(await p.eval('window.__ftw.state.settings.hearts'), 1);
  await p.clickText('3', '.panel-gameSettings .seg-btn');
  await p.wait('window.__ftw.state.settings.mode === "custom"');
  assert.equal(await p.eval('window.__ftw.state.settings.hearts'), 3);
  await p.clickText('Table:', '.panel-gameSettings button');
  await p.wait('!!document.querySelector(".overlay.choice")');
  await p.key('Escape', 'Escape', 27);
  await delay(220);
  await p.click('.panel-close');
  await delay(220);

  await p.send({ t: 'unlock', code: 'local-ui-test-only' });
  await p.wait('window.__ftw.state.isAdmin');
  await p.click('[aria-label="Settings"]');
  await p.clickText('Open admin tools');
  await p.wait('!!document.querySelector(".panel-settings input[type=number]")');
  await p.eval('document.querySelector(".panel-settings input[type=number]").value = 120');
  await p.clickText('Set coins');
  await p.wait('window.__ftw.profile.coins === 120');
  await p.eval('document.querySelector(".panel-settings input[type=number]").value = -20');
  await p.clickText('Add / remove coins');
  await p.wait('window.__ftw.profile.coins === 100');
  await p.clickText('Close admin tools');
  assert.equal(await p.eval('document.querySelector(".panel-settings input[type=number]")?.getClientRects().length || 0'), 0);
  await p.click('.panel-close');
  await delay(220);
  await p.click('[aria-label="Profile"]');
  await p.clickText('Chairs', '.profile-tabs button');
  assert.match(await p.eval('document.querySelector(".profile-tab-content").textContent'), /Wooden/);
  await p.shot('profile-chairs');
  assert.deepEqual(p.errors, []);
  console.log('ok card notice, popup exit, native game choices, custom rules, admin coins, profile chairs');
} finally { await b.close(); }
