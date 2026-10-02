import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
const b=await browser(),base=process.env.BASE||'http://127.0.0.1:8788';
try{
 const a=await b.page('tide-host'),c=await b.page('tide-player'),s=await b.page('tide-spectator',390,844,true);
 for(const p of [a,c,s]){
  await p.cdp('Page.addScriptToEvaluateOnNewDocument',{source:`window.reviewSockets=[];const RealSocket=WebSocket;window.WebSocket=class extends RealSocket{constructor(...args){super(...args);window.reviewSockets.push(this);}};`});
  await p.nav(base+'/?debug=1');await p.wait('window.__ftw?.world');
  await p.eval(`import('/js/profile.js').then(p=>p.setName('Check'+Math.random().toString(36).slice(2,10)))`);
 }
 await a.clickText('Create Private');await a.wait('window.__ftw.state.inRoom');const code=(await a.state()).code;
 await c.nav(base+'/?debug=1&room='+code);await c.wait('window.__ftw?.world');await c.clickText('Join');await c.wait('window.__ftw.state.inRoom');
 await a.eval("window.__ftw.actions.hostSettings({mode:'word_tide'})");await a.wait('window.__ftw.state.match.phase==="tideIntro"');
 assert.equal(await a.eval('window.__ftw.world.debugSnapshot().tide.cinematic'),true);
 await s.nav(base+'/?debug=1&room='+code);await s.wait('window.__ftw?.world');await s.clickText('Join');await s.wait('window.__ftw.state.inRoom&&window.__ftw.world.debugSnapshot().tide.active');
 assert.equal(await s.eval('window.__ftw.state.match.skipIntro'),true);
 assert.equal(await s.eval('document.body.classList.contains("tide-cinema")'),false);
 assert.equal(await s.eval('window.__ftw.world.debugSnapshot().tide.cinematic'),false);
 await s.wait('!document.querySelector(".tide-spectator").hidden');
 await s.click('[aria-label="Watch next player"]');await delay(200);const first=await s.eval('window.__ftw.world.debugSnapshot().tide.spectatorId');
 await s.click('[aria-label="Watch next player"]');await delay(200);const second=await s.eval('window.__ftw.world.debugSnapshot().tide.spectatorId');assert.notEqual(first,second);
 const follow=await s.eval('window.__ftw.world.debugSnapshot().cameraPosition');await s.clickText('View: Follow');await delay(200);
 assert.equal(await s.eval('window.__ftw.world.debugSnapshot().tide.spectatorView'),'overhead');assert.notDeepEqual(await s.eval('window.__ftw.world.debugSnapshot().cameraPosition'),follow);
 assert.equal(await s.eval('document.documentElement.scrollWidth<=innerWidth'),true);await s.shot('mobile-overhead');
 await a.wait('window.__ftw.state.match.phase==="tideAnswer"',30000);
 await a.eval(`(async()=>{const p=await import('/js/profile.js');p.adjustCoins('set',5000,'hint-review-start');const socket=reviewSockets.at(-1),handle=socket.onmessage;window.heldHints=[];window.releaseHint=ev=>handle(ev);socket.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.t==='hint'&&m.ok)heldHints.push(ev);else handle(ev);};window.__ftw.actions.hint();})()`);
 await a.wait('heldHints.length===1');assert.equal(await a.eval('window.__ftw.profile.coins'),5000);
 await a.eval('window.__ftw.state.hintPending=null;window.__ftw.actions.hint()');
 await delay(250);assert.equal(await a.eval('heldHints.length'),1); // Server refuses a new request in this round.
 await a.wait('window.__ftw.state.match.phase!=="tideAnswer"||window.__ftw.state.match.turnId!==JSON.parse(heldHints[0].data).turnId',35000);
 await a.eval('releaseHint(heldHints[0]);releaseHint(heldHints[0]);releaseHint(heldHints[0])');assert.equal(await a.eval('window.__ftw.profile.coins'),4000);
 await a.eval('reviewSockets.at(-1).close()');await a.wait('reviewSockets.length===2&&window.__ftw.net.state==="open"');
 assert.equal(await a.eval('window.__ftw.profile.coins'),4000);
 assert.equal(await a.eval('window.__ftw.world.debugSnapshot().tide.cinematic'),false);
 await a.send({t:'host',action:'endMatch'});await a.wait('window.__ftw.state.match.cancelled&&window.__ftw.profile.coins===5000');
 // Return to Classic and verify switching moves the actual table-game camera too.
 await a.send({t:'host',action:'settings',settings:{mode:'classic',turnSeconds:20}});
 await a.wait('window.__ftw.state.settings.mode==="classic"&&window.__ftw.state.match.phase==="lobby"',20000);
 await a.send({t:'sit',seat:0});await c.send({t:'sit',seat:1});await a.send({t:'host',action:'start'});
 await a.wait('window.__ftw.state.match.phase==="choosing"');
 await s.wait('!document.querySelector(".game-spectator").hidden');
 await s.clickText('Watch players','.game-spectator button');
 const classicBefore=await s.eval('window.__ftw.world.debugSnapshot()');
 await s.click('.game-spectator [aria-label="Watch next player"]');await delay(250);
 const classicAfter=await s.eval('window.__ftw.world.debugSnapshot()');assert.notEqual(classicAfter.spectatorId,classicBefore.spectatorId);assert.notDeepEqual(classicAfter.cameraPosition,classicBefore.cameraPosition);
 await s.clickText('View: Follow','.game-spectator button');await delay(200);assert.equal(await s.eval('window.__ftw.world.debugSnapshot().spectatorView'),'overhead');await s.shot('classic-overhead');await s.clickText('Exit spectator view','.game-spectator button');assert.equal(await s.eval('window.__ftw.world.debugSnapshot().spectatorId'),null);
 for(const p of [a,c,s])assert.deepEqual(p.errors,[]);
 console.log('PASS mid-intro join skips cinematic; mobile survivor switching and actual overhead camera; server purchase spam rejected; delayed/duplicate/reconnected payment charged exactly once; cancellation returns exactly the charge.');
}finally{await b.close()}
