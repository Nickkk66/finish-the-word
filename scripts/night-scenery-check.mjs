import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
const b=await browser(),base=process.env.BASE||'http://127.0.0.1:8787';
try{
 const p=await b.page('night-scenery');await p.nav(`${base}/?debug=1`);await p.wait('window.__ftw?.world');await p.clickText('Create Private');await p.wait('window.__ftw.state.inRoom');
 await p.send({t:'host',action:'settings',settings:{mode:'roulette'}});
 await p.wait('window.__ftw.world.debugSnapshot().roulette.trails>0');await p.shot('trails');
 await p.wait('!window.__ftw.world.debugSnapshot().roulette.cinematic');
 let s=await p.eval('window.__ftw.world.debugSnapshot()');assert.ok(s.scenery.broken);assert.equal(s.scenery.damagedFence,4);assert.ok(s.scenery.crateGlow.every(n=>n>0&&n<.3));
 await p.eval('window.__ftw.world.teleportLocal({x:-19,y:0,z:-16,ry:Math.PI})');await delay(500);await p.shot('destruction');
 const crates=await p.eval('import("./js/shared/catalog.js").then(m=>m.CARD_BOXES.map(d=>({x:d.x,z:d.z})))');
 await p.eval(`window.__ftw.world.teleportLocal({x:${crates[0].x},y:0,z:${crates[0].z+9},ry:Math.PI})`);await delay(500);await p.shot('crates');
 await p.eval('window.__ftw.world.teleportLocal({x:-15,y:0,z:-10,ry:3.9})');await delay(500);await p.shot('beam-a');await delay(1600);await p.shot('beam-b');
 const perf=await p.eval('new Promise(resolve=>{const samples=[];let last=performance.now();function frame(now){samples.push(now-last);last=now;if(samples.length<120)requestAnimationFrame(frame);else{samples.sort((a,b)=>a-b);resolve({median:samples[60],p95:samples[114],drawCalls:window.__ftw.world.debugSnapshot().drawCalls});}}requestAnimationFrame(frame);})');console.log('Night frame timing',perf);
 await p.send({t:'host',action:'settings',settings:{mode:'classic'}});await p.wait('window.__ftw.world.debugSnapshot().night<.01');s=await p.eval('window.__ftw.world.debugSnapshot()');assert.equal(s.scenery.broken,false);assert.equal(s.scenery.damagedFence,0);assert.ok(s.scenery.crateGlow.every(n=>n===0));await p.shot('restored');
 assert.deepEqual(p.errors,[]);console.log('PASS trails, broken board, fence damage, gentle crate glow, sweeping beam, mode-exit restoration');
}finally{await b.close();}
