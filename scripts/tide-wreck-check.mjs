import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {browser,delay} from './browser.mjs';
import {WRECK} from '../public/js/shared/tide-wreck.js';
const b=await browser();
try{
 for(const mobile of [false,true]){
  const p=await b.page(mobile?'wreck-mobile':'wreck-desktop',mobile?390:1440,mobile?844:900,mobile);
  await p.nav(`${process.env.BASE||'http://127.0.0.1:8787'}/?debug=1`);await p.wait('window.__ftw?.world');await p.eval("document.querySelector('.menu').style.display='none'");
  const harness=await readFile(new URL('../public/dev/tide-wreck.js',import.meta.url),'utf8');
  await p.eval(`(async()=>{const {NOOB_LOOK}=await import('/js/shared/catalog.js'),{TIDE}=await import('/js/shared/word-tide.js');const world=window.__ftw.world;window.world=world;${harness.slice(harness.indexOf('for(const [i,id]')).replaceAll("document.querySelector('#play').onclick=()=>window.preview();document.querySelector('#rescue').onclick=()=>window.preview(0,true);document.querySelector('#end').onclick=()=>window.preview(0,false,true);",'')}})()`);
  await p.wait('window.world?.debugSnapshot().tide.wrecks.loaded');
  for(const [seconds,stage]of [[.2,'shake'],[.9,'break'],[1.7,'fall'],[3.4,'swim'],[6.5,'warningJump'],[8.7,'stalk'],[12,'breach'],[14.5,'grab'],[16,'drag'],[17.4,'sink'],[19,'gone'],[22,'gone'],[24,'gone'],[26.1,'gone']]){
   await p.eval(`window.preview(${seconds})`);await delay(60);
   const e=await p.eval('window.world.debugSnapshot().tide.wrecks.events[0]');
   assert.equal(e.stage,stage);assert.equal(e.bloodVisible,seconds>=14);assert.ok(e.pieces>4);assert.equal(e.chairVisible,seconds<.8);
   if(seconds>=2.3&&seconds<18)assert.equal(e.sharkVisible,true);
   if(seconds<14)assert.equal(e.detachedHead,false);
   if(seconds>=14&&seconds<18){assert.equal(e.detachedHead,true);assert.equal(e.headVisible,false);}
   if(seconds>=15.5){assert.equal(e.bodyPieces,15);assert.equal(e.accessoryVisible,true);}
   if(seconds>=WRECK.fish&&seconds<WRECK.swarmEnd){assert.equal(e.fish,mobile?4:8);const water=await p.eval('window.world.debugSnapshot().tide.water');assert.ok(e.fishPositions.filter(p=>p[1]>water+.3).length>=(mobile?1:2));}
   if(seconds>=18&&seconds<WRECK.cameraEnd)assert.equal(await p.eval('window.world.debugSnapshot().tide.wrecks.cameraKey'),e.key,'camera holds on the piranhas');
   if(seconds>=WRECK.cameraEnd)assert.equal(await p.eval('window.world.debugSnapshot().tide.wrecks.cameraKey'),null,'camera returns to spectating');
   if(seconds<18)assert.equal(await p.eval('window.world.debugSnapshot().tide.water'),3);
   if(['break','swim','warningJump','stalk','breach','grab','drag','gone'].includes(stage))await p.shot(stage);
  }
  await p.eval('window.preview(3.4)');await delay(60);const wakeBefore=await p.eval('window.world.debugSnapshot().tide.wrecks.events[0].wakeTime');await delay(220);assert.ok(await p.eval('window.world.debugSnapshot().tide.wrecks.events[0].wakeTime')>wakeBefore,'foam flows even at the same path position');
  const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  async function sample(t){await p.eval(`window.preview(${t})`);await delay(60);return p.eval('window.world.debugSnapshot().tide.wrecks.events[0]');}
  for(const boundary of [6,7.4,11,14,15.5,17]){
   const before=await sample(boundary-.0001),after=await sample(boundary+.0001);
   assert.ok(dist(before.shark,after.shark)<.03,`shark position continuous at ${boundary}`);
   const dot=Math.abs(before.sharkQuaternion.reduce((n,v,i)=>n+v*after.sharkQuaternion[i],0));
   assert.ok(2*Math.acos(Math.min(1,dot))<.01,`shark rotation continuous at ${boundary}`);
   if(boundary===14){
    assert.ok(dist(before.avatarHeadCenter,after.headCenter)<.02,'head starts at its actual location without teleporting');
    assert.ok(dist(after.mouth,after.headCenter)<.001,'head is held at the shark mouth');
   }
  }
  for(const t of [7.4,7.85,13.9,14.2,15,17,20,22]){await sample(t);await p.shot('arc-'+t);}
  await p.eval('window.preview(1.5,true)');await delay(60);assert.equal(await p.eval('window.world.debugSnapshot().tide.wrecks.events.length'),0);
  await p.eval('window.preview(5,false,true)');await delay(60);assert.equal(await p.eval('window.world.debugSnapshot().tide.wrecks.events.length'),0);
  await p.eval('window.world.setTide(null)');await delay(60);assert.equal(await p.eval('window.world.debugSnapshot().tide.wrecks.events.length'),0);
  assert.deepEqual(p.errors,[]);
 }
 console.log('PASS: Bundled shark, real chair fragments, distant fin, warning jump, second approach, lingering block debris, safe heart losses, winner and cleanup on desktop/mobile.');
}finally{await b.close();}
