import assert from 'node:assert/strict';
import { browser, delay } from './browser.mjs';

const b = await browser();
try {
  for (const [width, height] of [[1200, 850], [2210, 1800], [1779, 955]]) {
    const page = await b.page(`layout-${width}-${height}`, width, height);
    await page.nav(`${process.env.BASE || 'http://localhost:8787'}/?debug=1`);
    await page.wait('window.__ftw?.world');
    await page.clickText('Create Private');
    await page.wait('window.__ftw.state.inRoom');
    const layout = await page.eval(`(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
      return { viewport:[innerWidth,innerHeight], game:rect('#game'), side:rect('.side'), counters:rect('.counters') };
    })()`);
    assert.equal(layout.game.x, 0);
    assert.equal(layout.game.width, width);
    assert.ok(layout.side.bottom + 8 <= layout.counters.y, JSON.stringify(layout));
    await page.click('[aria-label="Pets"]');
    const pets = await page.eval(`(() => { const r = document.querySelector('.panel-pets').getBoundingClientRect(); return { top:r.top, bottom:r.bottom, height:r.height, tooltipListeners:document.querySelectorAll('.pets-grid .item-card').length }; })()`);
    assert.ok(pets.top >= 0 && pets.top < height * .23, JSON.stringify(pets));
    assert.ok(pets.bottom <= height, JSON.stringify(pets));
    if (width === 1200) {
      await page.eval('import("./js/profile.js").then(p => p.addPet("owl"))');
      await page.wait('document.querySelector(".pets-grid .item-card")');
      await page.eval('document.querySelector(".pets-grid .item-card").dispatchEvent(new PointerEvent("pointerenter"))');
      await delay(2100);
      assert.match(await page.eval('document.querySelector("#pet-stat-tooltip")?.textContent || ""'), /sec|guess|heart|No game ability/);
      assert.ok(await page.eval('document.querySelector(".pets-grid .item-art").getBoundingClientRect().width >= 120'));
    }
    await page.shot('pets');
    if (width === 1200) {
      await page.click('.panel-pets .panel-close');
      await page.click('[aria-label="Profile"]');
      const longest = await page.eval(`(() => { window.__ftw.profile.longestWord='characteristically'; window.__ftw.actions.refreshPanels(); const e=document.querySelector('.longest-word-stat .stat-value'); return {text:e.textContent,whiteSpace:getComputedStyle(e).whiteSpace,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight}; })()`);
      assert.equal(longest.text, 'CHARACTERISTICALLY');
      assert.equal(longest.whiteSpace, 'normal');
      assert.ok(longest.scrollHeight <= longest.clientHeight + 1, JSON.stringify(longest));
      const paid = await page.eval('import("./js/profile.js").then(p => { const before=p.profile.longestWord; p.recordWord("pneumonoultramicroscopics",250,1,true); return {before,after:p.profile.longestWord}; })');
      assert.equal(paid.after, paid.before, 'paid answers do not set the longest word');
    }
    assert.deepEqual(page.errors, []);
    console.log(`PASS layout ${width}×${height}`, layout, pets);
  }
} finally { await b.close(); }
