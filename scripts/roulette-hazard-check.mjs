import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
const b=await browser();
try {
 const p=await b.page('roulette-fire');await p.nav(`${process.env.BASE||'http://127.0.0.1:8787'}/?debug`);await p.wait('window.__ftw?.world');await p.clickText('Create Private');await p.wait('window.__ftw.state.inRoom');
 await p.send({t:'host',action:'settings',settings:{mode:'roulette'}});await p.wait('window.__ftw.world.debugSnapshot().roulette.active');await p.wait('!window.__ftw.world.debugSnapshot().roulette.cinematic');
 const coins=await p.eval('window.__ftw.profile.coins');
 await p.eval('window.__ftw.world.teleportLocal({x:-18,y:0,z:4})');
 await p.wait(`window.__ftw.profile.coins === ${coins-25}`,9000);await p.shot('damage');
 await p.eval('window.__ftw.world.teleportLocal({x:0,y:0,z:26})');await delay(5500);
 assert.equal(await p.eval('window.__ftw.profile.coins'),coins-25);
 assert.deepEqual(p.errors,[]);console.log('ok live fire debit, warning and stopping outside crater');
}finally{await b.close();}
