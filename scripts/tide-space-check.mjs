import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
const base=process.env.BASE||'http://127.0.0.1:8793',b=await browser();
try {
 const a=await b.page('tide-space',1440,900),c=await b.page('tide-space-peer',390,844,true);
 await a.nav(base+'/?debug=1');await a.wait('window.__ftw?.world');await a.clickText('Create Private');await a.wait('window.__ftw.state.inRoom');
 await c.nav(`${base}/?debug=1&room=${(await a.state()).code}`);await c.wait('window.__ftw?.world');await c.clickText('Join');await c.wait('window.__ftw.state.inRoom');
 await a.send({t:'host',action:'settings',settings:{mode:'word_tide'}});await a.wait('window.__ftw.state.match.phase === "tideAnswer"',30000);
 await a.eval('document.querySelector(".tide-input").focus()');await a.type('sea');await a.key(' ','Space',32,' ');
 assert.equal(await a.eval('document.querySelector(".tide-input").value'),'sea ');
 assert.equal(await a.eval('window.__ftw.state.match.participants.find(p=>p.id===window.__ftw.state.you).alive'),true,'Space in an answer remains text');
 await a.click('[aria-label="Settings"]');await a.eval('document.activeElement.blur()');await a.key(' ','Space',32,' ');await delay(150);
 assert.equal(await a.eval('window.__ftw.state.match.participants.find(p=>p.id===window.__ftw.state.you).alive'),true,'Space in settings cannot forfeit');
 await a.click('.panel-close');await delay(250);await a.eval('document.activeElement.blur()');await a.key(' ','Space',32,' ');
 await a.wait('document.querySelector(".overlay.confirm")');
 assert.equal(await a.eval('window.__ftw.state.match.participants.find(p=>p.id===window.__ftw.state.you).alive'),true,'Space asks before forfeiting');
 await a.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,autoRepeat:true});
 assert.equal(await a.eval('document.querySelectorAll(".overlay.confirm").length'),1,'repeated Space cannot create duplicate confirmations');
 await a.clickText('Keep playing','.overlay.confirm button');await a.wait('!document.querySelector(".overlay.confirm:not(.leaving)")');await delay(250);
 await a.eval('document.activeElement.blur()');await a.key(' ','Space',32,' ');await a.wait('document.querySelector(".overlay.confirm:not(.leaving)")');
 await a.clickText('Stand up','.overlay.confirm button');
 await a.wait('!window.__ftw.state.match.participants.find(p=>p.id===window.__ftw.state.you).alive');
 assert.ok(await a.eval('window.__ftw.state.match.tide.towers[window.__ftw.state.you].wreck'));
 await a.wait('window.__ftw.world.debugSnapshot().tide.wrecks.loaded');await a.shot('space-forfeit');
 assert.deepEqual(a.errors,[]);assert.deepEqual(c.errors,[]);
 console.log('PASS: Space types multiword answers, remains safe in settings, asks before giving up, supports cancellation, and runs the normal shark sequence after confirmation.');
}finally{await b.close();}
