import assert from 'node:assert/strict';
import { browser } from './browser.mjs';
const b = await browser();
try {
  const page = await b.page('admin-profile', 1120, 820);
  await page.nav(`${process.env.BASE || 'http://127.0.0.1:8788'}/?debug=1`);
  await page.wait('window.__ftw?.world');
  await page.clickText('Create Private');
  await page.wait('window.__ftw.state.inRoom');
  await page.eval("window.__ftw.actions.unlock('local-browser-review')");
  await page.wait('window.__ftw.state.isAdmin');
  await page.click('[aria-label="Settings"]');
  await page.clickText('Open admin tools');await page.click('[data-admin-section=accounts]');
  await page.eval("window.__ftw.actions.admin('getProfile',{id:window.__ftw.profile.id})");
  await page.wait('!!document.querySelector(\'[aria-label="Coins"]\')');
  assert.ok(await page.eval('document.querySelectorAll(".admin-profile-editor input[type=number]").length > 40'));
  await page.eval(`(() => {
    const money=document.querySelector('[aria-label="Coins"]'); money.value=2468;
    const pet=document.querySelector('[aria-label="Piggy · Tier 2"]'); pet.value=3;
  })()`);
  await page.clickText('Save profile changes');
  await page.wait('window.__ftw.profile.coins === 2468 && window.__ftw.profile.petTiers.piggy?.[2] === 3');
  await page.wait('window.__ftw.state.adminProfile?.saved && window.__ftw.state.adminProfile.profile.coins === 2468');
  await page.clickText('Advanced · appearance, equipment, settings and history (JSON)', 'summary');
  await page.eval(`(() => { const raw=document.querySelector('[aria-label="Full profile JSON"]'); const p=JSON.parse(raw.value); p.coins=1357; p.settings.prefillPrefix=false; raw.value=JSON.stringify(p); })()`);
  await page.clickText('Apply JSON and save profile');
  await page.wait('window.__ftw.profile.coins === 1357 && window.__ftw.profile.settings.prefillPrefix === false');
  assert.deepEqual(page.errors, []);
  await page.shot('admin-full-profile');
  console.log('PASS full admin profile view, money and tiered pet edits, advanced JSON, live delivery');
} finally { await b.close(); }
