import assert from 'node:assert/strict';
import { browser, delay } from './browser.mjs';
import { createDictionary } from '../src/dictionary.js';
import WORDS from '../src/words.js';
const dict=createDictionary(WORDS),b=await browser(),base=process.env.BASE||'http://127.0.0.1:8787';
try {
 const a=await b.page('planner-desktop'),c=await b.page('planner-mobile',390,844,true);
 await a.nav(`${base}/?debug=1`);await a.wait('window.__ftw?.world');await a.clickText('Create Private');await a.wait('window.__ftw.state.inRoom');
 await c.nav(`${base}/?debug=1&room=${(await a.state()).code}`);await c.wait('window.__ftw?.world');await c.clickText('Join');await c.wait('window.__ftw.state.inRoom');
 for(const p of [a,c]){
  await p.eval(`(async()=>{const {addCard,profile}=await import('./js/profile.js');for(let i=0;i<3;i++)for(const id of ['time_tax','pressure','skip','heart'])addCard(id);window.__ftw.net.send({t:'loadout',cards:profile.cards});})()`);
 }
 await a.send({t:'host',action:'settings',settings:{turnSeconds:20,hearts:1}});await a.send({t:'sit',seat:0});await c.send({t:'sit',seat:1});await a.send({t:'host',action:'start'});
 await a.wait('window.__ftw.state.match.phase==="choosing"');let state=await a.state();const chooser=state.match.chooserId===state.you?a:c;
 await chooser.send({t:'pick',letter:state.match.options[0]});await a.wait('window.__ftw.state.match.phase==="typing"');
 async function submit(){const s=await a.state();const p=s.match.typerId===s.you?a:c;const word=dict.randomWithPrefix(s.match.prefix,new Set(s.match.chain.map(w=>w.word)),()=>.2,{minLen:s.match.minLength,maxLen:12});await p.send({t:'submit',word});await a.wait(`window.__ftw.state.match.turnId!==${s.match.turnId}`);}
 for(const [index,style] of ['pocket','deck'].entries()){
  state=await a.state();const actor=state.match.typerId===state.you?c:a,actorId=(await actor.state()).you,target=state.match.typerId;
  await actor.clickText('My cards','.turn-tools button');await actor.wait('!document.querySelector(".quick-card-tray").hidden');
  await actor.clickText(style==='deck'?'B · Deck':'A · Pocket','.quick-card-tray button');
  await actor.clickText('Time Tax','button.quick-card');
  await actor.clickText(state.players.find(p=>p.id===target).name,'.quick-card-targets button');
  await actor.wait('window.__ftw.state.cardQueue?.cardId==="time_tax"');
  assert.equal(await (actor===a?c:a).eval('window.__ftw.state.cardQueue??null'),null);
  await actor.shot(`tray-${style}`);
  await actor.clickText('×','.quick-card-tray button');
  await submit();await a.wait('window.__ftw.state.match.phase==="cardReveal"');
  await delay(style==='deck'?1800:650);await actor.shot(`animation-${style}`);await (actor===a?c:a).shot(`view-${style}`);
  for(const p of [a,c])assert.equal(await p.eval('window.__ftw.world.debugSnapshot().cardPlay.style'),style);
  await a.wait('window.__ftw.state.match.phase==="typing"');await delay(500);
  for(const p of [a,c])assert.equal((await p.eval('window.__ftw.world.debugSnapshot().cardPlay.landed')).length,index+1);
  assert.equal((await actor.state()).match.typerId,actorId);
  if(index===0) await submit();
 }
 await a.shot('landed');await c.shot('landed');
 // Forged immediate play has no effect, and a reload restores history.
 state=await a.state();await a.send({t:'useCard',requestId:'forged',turnId:state.match.turnId,cardId:'skip',targetId:state.you});await delay(150);
 assert.equal(await a.eval('window.__ftw.world.debugSnapshot().cardPlay.played'),2);
 await c.cdp('Page.reload');await c.wait('window.__ftw?.world');await c.clickText('Join');await c.wait('window.__ftw.state.inRoom');
 assert.equal((await c.eval('window.__ftw.world.debugSnapshot().cardPlay.landed')).length,2);
 // A winning Heartbreaker receipt must supersede the match-end loadout debounce.
 state=await a.state();const winner=state.match.typerId===state.you?c:a;
 const winnerId=(await winner.state()).you;
 await winner.eval(`window.__ftw.actions.useCard('heart',${JSON.stringify(state.match.typerId)})`);
 await winner.wait('window.__ftw.state.cardQueue?.cardId==="heart"');
 await submit();await winner.wait('window.__ftw.state.match.phase==="ended"');
 await winner.wait('window.__ftw.profile.cards.heart===2');await delay(500);
 await winner.cdp('Page.reload');await winner.wait('window.__ftw?.world');await winner.clickText('Join');await winner.wait('window.__ftw.state.inRoom');
 assert.equal(await winner.eval('window.__ftw.profile.cards.heart'),2);
 assert.equal((await winner.state()).match.winnerId,winnerId);
 for(const p of [a,c])assert.deepEqual(p.errors,[]);
 console.log('PASS private compact planner, both styles, fixed reveal, persistent multiple cards, replay rejection, reconnect history, desktop/mobile');
} finally { await b.close(); }
