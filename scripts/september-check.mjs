import assert from 'node:assert/strict';
import { browser,delay } from './browser.mjs';
const b=await browser(),base=process.env.BASE||'http://127.0.0.1:8787';
try{
 const a=await b.page('september-desktop'),c=await b.page('september-mobile',390,844,true);
 await a.nav(`${base}/?debug=1`);await a.wait('window.__ftw?.world');await a.clickText('Create Private');await a.wait('window.__ftw.state.inRoom');
 const code=(await a.state()).code;
 await c.nav(`${base}/?debug=1&room=${code}`);await c.wait('window.__ftw?.world');await c.clickText('Join');await c.wait('window.__ftw.state.inRoom');
 const id=(await a.state()).you;
 await a.eval('window.__ftw.world.teleportLocal({x:-30.6,y:0,z:-31.8,ry:3.9})');await delay(400);
 await a.wait('document.querySelector(".w-prompt")?.textContent.includes("Enter lighthouse")');
 const before=await a.eval('window.__ftw.world.debugSnapshot().localPosition');
 await a.eval('document.querySelector(".w-prompt").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');
 await a.wait('window.__ftw.world.debugSnapshot().travelLocked');
 await a.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
 await delay(250);
 const local=await a.eval('window.__ftw.world.debugSnapshot()');assert.deepEqual(local.localPosition,before);
 const rendered=local.playerPositions.find(p=>p.id===id).render;assert.ok(Math.hypot(rendered[0]-before[0],rendered[2]-before[2])>.1);
 const remote=await c.eval(`window.__ftw.world.debugSnapshot().portalAnimations.includes(${JSON.stringify(id)})`);assert.equal(remote,true);
 await a.cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
 await a.wait('window.__ftw.state.zone==="lighthouse"');await delay(700);await a.shot('room');
 assert.equal(await a.eval('window.__ftw.world.debugSnapshot().lighthouse.windowRenders'),0);
 await a.wait('window.__ftw.world.debugSnapshot().lighthouse.waterPlaying');
 await a.eval('window.__ftw.world.teleportLocal({x:310,y:0,z:7,ry:Math.PI})');await delay(200);
 await a.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
 await a.wait('window.__ftw.world.debugSnapshot().localPosition[1]>=5.7',6000);
 await a.cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});await delay(150);
 await a.shot('stairs');assert.ok((await a.eval('window.__ftw.world.debugSnapshot().localPosition')).every(Number.isFinite));
 // UI return from the landing must fade in place instead of crossing the room.
 await a.eval('void window.__ftw.actions.returnToIsland()');await a.wait('window.__ftw.state.zone==="island"');await delay(500);
 await c.eval('window.__ftw.world.teleportLocal({x:-31.85,y:0,z:-30.14})');await delay(400);
 await c.wait('document.querySelector(".w-prompt")?.textContent.includes("Enter lighthouse")');await c.eval('document.querySelector(".w-prompt").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');await c.wait('window.__ftw.state.zone==="lighthouse"');await delay(800);await c.shot('room');
 await c.eval('void window.__ftw.actions.returnToIsland()');await c.wait('window.__ftw.state.zone==="island"');await delay(500);
 // Only accepted cardUsed broadcasts start the camera, on both clients.
 for(const p of [a,c])await p.send({t:'loadout',cards:{time_tax:2,skip:2,heart:1}});
 await a.send({t:'sit',seat:0});await c.send({t:'sit',seat:1});await delay(150);await a.send({t:'host',action:'start'});
 await a.wait('window.__ftw.state.match.phase==="choosing"');let state=await a.state();const chooser=state.match.chooserId===state.you?a:c;
 await chooser.send({t:'pick',letter:state.match.options[0]});await a.wait('window.__ftw.state.match.phase==="typing"');state=await a.state();const actor=state.match.typerId===state.you?a:c,target=state.match.participants.find(p=>p.id!==state.match.typerId).id;
 await actor.send({t:'useCard',requestId:'bad-card',turnId:state.match.turnId-1,cardId:'skip',targetId:target});await delay(120);assert.equal(await a.eval('window.__ftw.world.debugSnapshot().cardPlay.played'),0);
 const request={t:'useCard',requestId:'good-card',turnId:state.match.turnId,cardId:'skip',targetId:target};await actor.send(request);
 await a.wait('window.__ftw.world.debugSnapshot().cardPlay.active');assert.equal(await c.eval('window.__ftw.world.debugSnapshot().cardPlay.played'),1);await a.shot('card');
 await actor.send(request);await delay(1300);assert.equal(await a.eval('window.__ftw.world.debugSnapshot().cardPlay.played'),1);assert.equal(await a.eval('window.__ftw.world.debugSnapshot().cardPlay.active'),false);
 // Forge a travel packet during the game; server must not move anyone.
 await actor.send({t:'celebrate',kind:'portal',to:'lighthouse'});await delay(200);assert.equal((await actor.state()).zone,'island');
 assert.deepEqual(a.errors,[]);assert.deepEqual(c.errors,[]);
 console.log('PASS directed off-center travel, remote animation, movement lock, desktop/mobile rooms, baked windows, walked all stairs, distant return, accepted/rejected/replayed cards and active-match travel rejection');
}finally{await b.close();}
