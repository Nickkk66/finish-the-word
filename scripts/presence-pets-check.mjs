import assert from 'node:assert/strict';
import { browser, delay } from './browser.mjs';
const base = process.env.BASE || 'http://127.0.0.1:8787';
const b = await browser();
try {
  const pages = [await b.page('presence-pets', 1440, 900), await b.page('presence-pets-mobile', 390, 844, true)];
  await Promise.all(pages.map(async page => {
    await page.nav(`${base}/?debug=1`); await page.wait('window.__ftw?.world');
    await page.clickText('Create Private'); await page.wait('window.__ftw.state.inRoom');
    await page.eval(`(async()=>{const p=await import('/js/profile.js');p.grantPetTier('dragon',1,'preview-dragon');window.__ftw.actions.refreshPanels();})()`);
    await page.click('[aria-label="Pets"]');
    await page.wait('document.querySelector(".pets-grid .pet-abilities")');
    const text = await page.eval('document.querySelector(".pets-grid .pet-abilities").textContent');
    assert.match(text, /CLASSIC:.*50%: next player gets 3s/);
    assert.match(text, /THE LAST SIP:.*−25% poison risk/); assert.match(text, /WORD TIDE:.*20%: protect a heart/);
    await page.eval('document.querySelector(".pets-grid .item-card").scrollIntoView({block:"start"})');
    await page.wait('document.querySelector(".pets-grid .model-thumb").naturalWidth > 0');
    await page.shot('pet-abilities');
    await page.eval(`(async()=>{
      const {createPresenceCheck}=await import('/js/ui/presence.js');
      const handlers={};window.__presenceMessages=[];
      window.__presenceUi=createPresenceCheck({net:{on:(name,fn)=>handlers[name]=fn,send:msg=>{window.__presenceMessages.push(msg);return true;}},inRoom:()=>true});
      window.__presenceHandlers=handlers;handlers.presenceCheck({token:'test-token',remainingMs:30000});
    })()`);
    const original = await page.eval('({left:document.querySelector(".presence-card").style.left,top:document.querySelector(".presence-card").style.top})');
    await page.click('.presence-confirm');
    assert.equal(await page.eval('window.__presenceMessages.length'), 0, 'synthetic fixed-location click is ignored');
    await delay(6200);
    const moved = await page.eval('({left:document.querySelector(".presence-card").style.left,top:document.querySelector(".presence-card").style.top})');
    assert.notDeepEqual(moved, original);
    const bounds = await page.eval('(()=>{const r=document.querySelector(".presence-card").getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight};})()');
    assert.ok(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= bounds.w && bounds.bottom <= bounds.h);
    const seconds=Number((await page.eval('document.querySelector(".presence-clock").textContent')).replace('s',''));assert.ok(seconds>0&&seconds<=24);
    await page.shot('moving-clock');
    const point = await page.eval('(()=>{const r=document.querySelector(".presence-confirm").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');
    await page.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await page.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    assert.equal(await page.eval('window.__presenceMessages.filter(m=>m.t==="presenceReply").length'), 1);
    await page.eval('window.__presenceHandlers.presenceCleared({token:"test-token"})');
    assert.equal(await page.eval('!!document.querySelector(".presence-overlay")'), false);
    await page.eval('window.__presenceHandlers.presenceCheck({token:"expired",remainingMs:250})'); await delay(400);
    assert.equal(await page.eval('document.querySelector(".presence-confirm").disabled'), true);
    await page.eval('window.__presenceUi.hide()');
    const closeReasons = await page.eval(`(async()=>{
      const {createNet}=await import('/js/net.js'), Original=window.WebSocket, reasons=[];
      let socket;
      try {
        window.WebSocket=class {static OPEN=1;constructor(){socket=this;}close(){}};
        for(const code of [4001,4003,4004]) {
          const net=createNet();net.onState((state,reason)=>{if(state==='closed')reasons.push(reason);});
          net.connect('CHECK',()=>({}));socket.onclose({code});net.close();
        }
      } finally {window.WebSocket=Original;}
      return reasons.filter(r=>r!=='user');
    })()`);
    assert.deepEqual(closeReasons, ['kicked', 'inactive', 'room_shutdown']);
    assert.deepEqual(page.errors, []);
  }));
  console.log('PASS: Desktop/mobile pet ability rows, random popup positions, visible countdown, trusted response, acknowledgement, expired deadline, cleanup and distinct shutdown/kick/inactivity reasons.');
} finally { await b.close(); }
