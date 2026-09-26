import assert from 'node:assert/strict';
import { browser, delay } from './browser.mjs';
const base=process.env.BASE || 'http://127.0.0.1:8787', b=await browser();
try {
  const a=await b.page('roulette',1280,800), c=await b.page('roulette-mobile',390,844,true);
  await a.nav(`${base}/?debug=1`); await a.wait('window.__ftw?.world');
  await a.clickText('Create Private'); await a.wait('window.__ftw.state.inRoom');
  const code=(await a.state()).code;
  await c.nav(`${base}/?debug=1&room=${code}`); await c.wait('window.__ftw?.world');
  await c.clickText('Join'); await c.wait('window.__ftw.state.inRoom');
  for(const p of [a,c]) await p.eval('import("./js/profile.js").then(p=>p.grantCoins(100))');
  const before=await a.eval('window.__ftw.profile.coins')+await c.eval('window.__ftw.profile.coins');
  await a.click('[aria-label="Game Settings"]'); await a.click('.roulette-launch');
  await a.clickText('Enter Roulette','.overlay.confirm button');
  await a.wait('window.__ftw.state.settings.mode === "roulette"');
  await a.clickText('25', '.panel-gameSettings .seg-btn');
  await a.wait('window.__ftw.state.rouletteEntry === 25');
  await a.click('.panel-close'); await delay(250);
  await a.send({t:'sit',seat:0}); await c.send({t:'sit',seat:1});
  for(const p of [a,c]) {
    await p.wait('!document.querySelector(".roulette-actions .green").hidden');
    await p.clickText('Enter ·','.roulette-actions button');
    await p.clickText('Place entry', '.overlay.confirm button');
    await p.wait('window.__ftw.state.players.get(window.__ftw.state.you).rouletteBet === 25');
  }
  await a.clickText('Begin the ritual'); await a.wait('window.__ftw.state.match.phase === "roulette"');
  assert.equal(await a.eval('window.__ftw.state.match.roulette.pot'),50);
  assert.equal(await a.eval('window.__ftw.world.debugSnapshot().roulette.active'),true);
  await a.wait('window.__ftw.world.debugSnapshot().night > .99');
  await a.shot('night'); await c.shot('night');
  let passes=0,drinks=0;
  const end=Date.now()+60000;
  while(Date.now()<end){
    const st=await a.state(); if(st.match.phase==='ended')break;
    if(st.match.phase==='roulette') {
      const p=st.match.typerId===st.you?a:c;
      await p.wait('!document.querySelector(".roulette-actions .purple").hidden');
      if(!passes){await p.clickText('Pass ·','.roulette-actions button');passes++;}
      else {await p.clickText('Drink','.roulette-actions button');drinks++;}
      await a.wait('window.__ftw.state.match.phase !== "roulette"');
      if((await a.state()).match.roulette.event?.poisoned){await delay(1550);await a.shot('cursed');}
    }
    await delay(150);
  }
  await a.wait('window.__ftw.state.match.phase === "ended"');
  await delay(300);
  assert.equal(await a.eval('window.__ftw.profile.coins')+await c.eval('window.__ftw.profile.coins'),before);
  assert.deepEqual(a.errors,[]);assert.deepEqual(c.errors,[]);
  console.log(`ok Roulette: two browsers, paid entry, pot conservation, pass, ${drinks} drinks, poison, winner, desktop/mobile, no browser errors`);
} finally {await b.close();}
