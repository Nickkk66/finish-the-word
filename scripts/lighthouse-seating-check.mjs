import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
const base=process.env.BASE||'http://127.0.0.1:8787',b=await browser();
try{
 const a=await b.page('keeper-desktop'),c=await b.page('keeper-mobile',390,844,true);
 await a.nav(`${base}/?debug=1`);await a.wait('window.__ftw?.world');await a.clickText('Create Private');await a.wait('window.__ftw.state.inRoom');
 const code=(await a.state()).code;
 await c.nav(`${base}/?debug=1&room=${code}`);await c.wait('window.__ftw?.world');await c.clickText('Join');await c.wait('window.__ftw.state.inRoom');
 for(const p of [a,c]){
   await p.eval('window.__ftw.world.teleportLocal({x:-31.85,y:0,z:-30.14})');await delay(300);
   await p.wait('document.querySelector(".w-prompt")?.textContent.includes("Enter lighthouse")');
   await p.eval('document.querySelector(".w-prompt").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');
   await p.wait('window.__ftw.state.zone==="lighthouse"');await delay(500);
 }
 await a.wait('window.__ftw.world.debugSnapshot().lighthouse.waterReady && window.__ftw.world.debugSnapshot().lighthouse.islandLoaded');
 assert.equal(await a.eval('window.__ftw.world.debugSnapshot().lighthouse.windowRenders'),0);
 const t=await a.eval('window.__ftw.world.debugSnapshot().lighthouse.waterTime');await delay(500);assert.notEqual(await a.eval('window.__ftw.world.debugSnapshot().lighthouse.waterTime'),t);
 await a.shot('room');await c.shot('room');
 // Use actual E/tap prompts; same equipped chairs appear for both clients.
 await a.send({t:'loadout',chair:'throne'});
 await a.eval('window.__ftw.world.teleportLocal({x:299,y:0,z:7.5,ry:Math.PI})');await delay(300);
 await a.wait('document.querySelector(".w-prompt")?.textContent.includes("Sit")');
 await a.key('e','KeyE',69);await a.wait('window.__ftw.state.players.get(window.__ftw.state.you).seat===8');
 await c.wait('window.__ftw.world.debugSnapshot().lighthouse.chairs.find(s=>s.id===8).chair==="throne"');
 await a.shot('seated-throne');
 await c.eval('window.__ftw.world.teleportLocal({x:305.33,y:0,z:4.83,ry:3.9})');await delay(300);
 await c.wait('document.querySelector(".w-prompt")?.textContent.includes("Sit")');
 await c.eval('document.querySelector(".w-prompt").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');
 await c.wait('window.__ftw.state.players.get(window.__ftw.state.you).seat===9');await c.shot('seated');
 assert.equal((await a.state()).match.phase,'lobby');
 const seated=await a.eval('window.__ftw.world.debugSnapshot().localPosition');
 assert.ok(seated[0]>290);await a.key('w','KeyW',87);assert.deepEqual(await a.eval('window.__ftw.world.debugSnapshot().localPosition'),seated);
 // Browser reload must preserve the occupied indoor chair during reconnect grace.
 await a.nav(`${base}/?debug=1&room=${code}`);await a.wait('window.__ftw?.world');await a.clickText('Join');await a.wait('window.__ftw.state.inRoom');
 await a.wait('window.__ftw.state.zone==="lighthouse" && window.__ftw.state.players.get(window.__ftw.state.you).seat===8');
 assert.ok((await a.eval('window.__ftw.world.debugSnapshot().localPosition'))[0]>290);
 await a.key(' ','Space',32);await a.wait('window.__ftw.state.players.get(window.__ftw.state.you).seat===-1');
 await c.wait('window.__ftw.world.debugSnapshot().lighthouse.chairs.find(s=>s.id===8).chair==="wooden"');
 assert.ok((await a.eval('window.__ftw.world.debugSnapshot().localPosition'))[0]>290);
 // Water genuinely loops and stops decoding outside the room.
 await a.wait('window.__ftw.world.debugSnapshot().lighthouse.waterTime>6',12000);
 await a.wait('window.__ftw.world.debugSnapshot().lighthouse.waterTime<2',5000);
 await a.eval('window.__ftw.world.setFirstPerson(true);window.__ftw.world.teleportLocal({x:300,y:0,z:-10,ry:Math.PI})');await delay(500);await a.shot('water-window');
 await a.eval('window.__ftw.world.teleportLocal({x:291,y:0,z:4,ry:-1.1})');await delay(500);await a.shot('island-window');
 await a.eval('void window.__ftw.actions.returnToIsland()');await a.wait('window.__ftw.state.zone==="island"');
 await a.wait('!window.__ftw.world.debugSnapshot().lighthouse.waterPlaying');
 assert.equal(await a.eval('window.__ftw.world.debugSnapshot().lighthouse.windowRenders'),0);
 assert.deepEqual(a.errors,[]);assert.deepEqual(c.errors,[]);
 console.log('PASS baked island image, looping downward water, zero window renders, desktop/mobile sitting, equipped chairs, remote occupancy, seated reconnect, stand and video pause');
}finally{await b.close();}
