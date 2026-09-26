import assert from 'node:assert/strict';
import { browser, delay } from './browser.mjs';
const base=process.env.BASE||'http://127.0.0.1:8787',b=await browser();
try{
 const p=await b.page('meteor-night');await p.nav(`${base}/?debug=1`);await p.wait('window.__ftw?.world');await p.clickText('Create Private');await p.wait('window.__ftw.state.inRoom');
 await p.send({t:'host',action:'settings',settings:{mode:'roulette'}});await p.wait('window.__ftw.world.debugSnapshot().roulette.active');
 await p.wait('!window.__ftw.world.debugSnapshot().roulette.cinematic');
 assert.equal(await p.eval('document.querySelectorAll(".w-fire-warning").length'),0);
 assert.ok(await p.eval('window.__ftw.world.debugSnapshot().roulette.burningTrees>0'));
 const before=await p.eval('window.__ftw.profile.coins');
 console.log('Night scene ready; waiting for the real three-minute server meteor.');
 await p.wait('window.__ftw.world.debugSnapshot().roulette.meteor',185000);
 assert.equal(await p.eval('window.__ftw.world.debugSnapshot().roulette.cinematic'),false);
 await p.shot('falling');await delay(2700);
 const meteor=await p.eval('window.__ftw.world.debugSnapshot().roulette.meteor');
 await p.eval(`window.__ftw.world.teleportLocal({x:${meteor.x},y:0,z:${meteor.z}})`);
 await delay(700);await p.shot('collect');
 await p.key('e','KeyE',69);
 await p.wait('!window.__ftw.world.debugSnapshot().roulette.meteor');
 assert.equal(await p.eval('window.__ftw.profile.coins'),before+150);
 await p.send({t:'collectMeteor',id:meteor.id});await delay(400);
 assert.equal(await p.eval('window.__ftw.profile.coins'),before+150);
 assert.deepEqual(p.errors,[]);console.log('PASS: three-minute meteor, no cutscene, collect prompt, +150 coins exactly once.');
}finally{await b.close();}
