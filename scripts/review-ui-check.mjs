import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
const base=process.env.BASE||'http://127.0.0.1:8787',b=await browser();
try {
 for(const [name,width,height,mobile]of [['review-desktop',1440,900,false],['review-short',1280,650,false],['review-mobile',390,844,true]]) {
  const p=await b.page(name,width,height,mobile);
  await p.nav(`${base}/?debug=1`);await p.wait('window.__ftw?.world');
  await p.clickText('Create Private');await p.wait('window.__ftw.state.inRoom');
  async function separated() {
   await p.wait('(()=>{const c=document.querySelector(".chat").getBoundingClientRect(),s=document.querySelector(".side").getBoundingClientRect();return s.top>=c.bottom+15;})()');
   const r=await p.eval('(()=>{const c=document.querySelector(".chat").getBoundingClientRect(),s=document.querySelector(".side").getBoundingClientRect();return {chat:c.bottom,side:s.top,bottom:s.bottom};})()');
   assert.ok(r.side>=r.chat+15);assert.ok(r.bottom<=height-10);
  }
  await separated();
  if(mobile){await p.click('.chat-toggle');await separated();}
  await p.shot('sidebar-below-chat');
  await p.send({t:'host',action:'settings',settings:{allowSwearing:true}});
  await p.wait('window.__ftw.state.settings.allowSwearing');
  await p.send({t:'chat',text:'fuck shit bitch cunt'});
  await p.wait('document.querySelector(".chat-log").textContent.includes("fuck shit bitch cunt")');
  await delay(700);await p.send({t:'host',action:'settings',settings:{allowSwearing:false}});
  await p.wait('!window.__ftw.state.settings.allowSwearing');
  await p.send({t:'chat',text:'fuck bitch'});await p.wait('document.querySelector(".chat-log").textContent.includes("#### #####")');
  if(mobile) {
   await p.click('.chat-toggle');
   await p.eval(`(async()=>{
    const {createTideHud}=await import('/js/ui/word-tide.js');const state=window.__ftw.state;
    const match={...state.match,matchId:'layout-preview',mode:'word_tide',phase:'tideAnswer',round:1,participants:[{id:state.you,alive:true,hearts:5,maxHearts:5}],tide:{category:{prompt:'Name an animal people keep as a pet'},rise:4,winners:[],towers:{[state.you]:{}}}};
    const hud=createTideHud({send:()=>{},start:()=>{},onHint:()=>{}});document.querySelector('.hud').hidden=true;document.querySelector('.game-ui').append(hud.el);hud.update({...state,match,deadline:performance.now()+20000},true);
   })()`);
   await p.wait('document.querySelector(".side").getBoundingClientRect().top>document.querySelector(".tide-question:not(:empty)").getBoundingClientRect().bottom+15');
   await p.shot('tide-question-clearance');
  }
  if(!mobile&&height===900) {
   await p.send({t:'host',action:'settings',settings:{mode:'roulette'}});
   await p.wait('window.__ftw.world.debugSnapshot().roulette.cinematic');
   assert.ok(await p.eval('document.querySelector(".roulette-intro")'));
   assert.equal((await p.state()).match.startedAt,null);
   await delay(2700);await p.shot('mode-cutscene');
   await p.wait('!window.__ftw.world.debugSnapshot().roulette.cinematic');
   await p.wait('!document.querySelector(".roulette-intro")');
   assert.equal(await p.eval('window.__ftw.world.debugSnapshot().roulette.craters'),4);
   await p.eval('window.__ftw.world.setRoulette(true,{...window.__ftw.state.match,matchId:"new-round",startedAt:Date.now()},25,"roulette")');
   assert.equal(await p.eval('window.__ftw.world.debugSnapshot().roulette.cinematic'),false,'a new match cannot replay the mode intro');
  }
  assert.deepEqual(p.errors,[]);
 }
 console.log('PASS: Desktop, short-screen and mobile sidebar clearance, expanded chat, swearing toggle, mode-only Last Sip cutscene and no match replay.');
} finally {await b.close();}
