import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
const b=await browser(),base=process.env.BASE||'http://127.0.0.1:8788';
try{
 const p=await b.page('meteor-debit',1280,900);await p.nav(base+'/?debug=1');await p.wait('window.__ftw?.world');await p.clickText('Create Private');await p.wait('window.__ftw.state.inRoom');await p.send({t:'host',action:'settings',settings:{mode:'roulette'}});await delay(17500);
 await p.eval(`window.debitSamples=[];window.__ftw.net.on('hazardDebit',()=>window.debitSamples.push({at:performance.now(),coins:window.__ftw.profile.coins}));window.__ftw.profile.coins=149;window.__ftw.world.teleportLocal({x:-20,y:0,z:4,ry:0})`);
 await p.wait('window.debitSamples.length>=8',15000);
 const samples=await p.eval('window.debitSamples');assert.deepEqual(samples.slice(0,8).map(v=>v.coins),[99,49,24,12,6,3,1,0]);for(let i=1;i<8;i++)assert.ok(samples[i].at-samples[i-1].at>=900&&samples[i].at-samples[i-1].at<1600);
 await p.eval('window.__ftw.world.teleportLocal({x:0,y:0,z:15,ry:0})');await delay(300);const count=await p.eval('window.debitSamples.length');await delay(1300);assert.equal(await p.eval('window.debitSamples.length'),count);assert.deepEqual(p.errors,[]);
 console.log('PASS live meteor damage: 149 → 99 → 49 → 24 → 12 → 6 → 3 → 1 → 0 at one-second intervals; exits stop damage.');
}finally{await b.close()}
