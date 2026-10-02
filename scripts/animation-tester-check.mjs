import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
import {TIDE_FLIGHT as flight} from '../public/js/shared/tide-flight.js';
const base=process.env.BASE||'http://127.0.0.1:8793',b=await browser();
try {
 for(const [name,w,h,mobile] of [['animations-desktop',1440,900,false],['animations-mobile',390,844,true]]){
  const p=await b.page(name,w,h,mobile);await p.nav(base+'/?debug=1');await p.wait('window.__ftw?.world');
  await p.clickText('Create Private');await p.wait('window.__ftw.state.inRoom');
  await p.send({t:'unlock',code:'local-browser-review'});await p.wait('window.__ftw.state.isAdmin');
  const before=await p.eval('JSON.stringify(window.__ftw.state.match)');
  await p.click('[aria-label="Settings"]');await p.clickText('Open admin tools');await p.clickText('Test animations');
 await p.wait('!document.querySelector(".animation-tester").hidden');
  async function seek(mode,t){await p.eval(`(()=>{const m=document.querySelector('[aria-label="Animation to test"]');m.value=${JSON.stringify(mode)};m.dispatchEvent(new Event('change'));const s=document.querySelector('[aria-label="Animation time"]');s.value=${t};s.dispatchEvent(new Event('input'));})()`);await delay(180);}
  await seek('intro',3.25);await p.shot('forceful-launch');
  await seek('intro',7);assert.equal(await p.eval('window.__ftw.world.debugSnapshot().tide.airborne'),1);
  await seek('intro',10);await p.shot('forceful-freefall');
  await seek('intro',14);await p.wait('window.__ftw.world.debugSnapshot().tide.parachuteModels===1');assert.ok(await p.eval('window.__ftw.world.debugSnapshot().tide.ropeRadius>=.08'));assert.equal(await p.eval('window.__ftw.world.debugSnapshot().tide.parachutes'),1);assert.ok(await p.eval('window.__ftw.world.debugSnapshot().tide.canopyBanks.every(b=>b<.02)'),'canopy remains stable during rider sway');const y=await p.eval('window.__ftw.world.debugSnapshot().tide.riders[0].y');await delay(450);assert.equal(await p.eval('window.__ftw.world.debugSnapshot().tide.riders[0].y'),y,'seeking pauses the animation clock');await p.shot('parachute');
  await seek('intro',flight.seated+.15);assert.ok(await p.eval('window.__ftw.world.debugSnapshot().tide.riders.every(r=>r.airborne&&r.seated&&Math.abs(r.legAngle+1.5)<.01)'));await p.shot('seated-descent');
  await seek('intro',flight.land+.2);assert.ok(await p.eval('window.__ftw.world.debugSnapshot().tide.riders.every(r=>Math.abs(r.seatContact)<.02)'));await p.shot('landed');
  await seek('shark',6.5);await p.shot('warning-jump');
  await seek('shark',16);await p.shot('attack');
  await seek('shark',20);assert.ok(await p.eval('window.__ftw.world.debugSnapshot().tide.wrecks.events[0].fish>=4'));await p.shot('piranhas');
  await seek('outro',8);assert.equal(await p.eval('window.__ftw.world.debugSnapshot().tide.ending'),true);await p.shot('retreat');
  assert.equal(await p.eval('JSON.stringify(window.__ftw.state.match)'),before,'previews must not change real match');
  assert.equal(await p.eval('[...document.querySelectorAll(".tide-label")].some(e=>e.textContent.includes("YOU"))'),false);
  await p.clickText('Restore game','.animation-tester button');await p.wait('!window.__ftw.state.animationPreview');
  await p.click('[aria-label="Settings"]');await p.clickText('Open admin tools');await p.click('[aria-label="Show animation tester"]');
  assert.equal(await p.eval('document.querySelector(".animation-tester").hidden'),true);
  assert.deepEqual(p.errors,[]);
 }
 console.log('PASS: Admin show/hide, desktop/mobile launch, parachute, seated contact, shark, retreat, unchanged real match and restoration.');
}finally{await b.close();}
