import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const b=await browser(),base=process.env.BASE||'http://127.0.0.1:8788';
try{
 const p=await b.page('chat-roster-reward',1440,1000);
 await p.nav(base+'/?debug=1');await p.wait('window.__ftw?.world');
 const start=await p.eval('window.__ftw.profile.freePlayMs');await delay(2100);assert.equal(await p.eval('window.__ftw.profile.freePlayMs'),start);
 await p.eval(`(async()=>{const {setName}=await import('/js/profile.js');setName('Check'+Math.random().toString(36).slice(2,10))})()`);await p.clickText('Create Private');await p.wait('window.__ftw.state.inRoom');await delay(2500);
 assert.ok(await p.eval('window.__ftw.profile.freePlayMs')>start);
 const review=await p.eval(`(async()=>{const {createPlayerList}=await import('/js/ui/playerList.js'),{setSetting}=await import('/js/profile.js');const root=document.createElement('div');root.id='roster-review';root.style.cssText='position:fixed;inset:0;z-index:99999;padding:30px;background:linear-gradient(#a9ddf5 0 35%,#58a546 35%);font-family:var(--font);overflow:auto';root.innerHTML='<h1>Choose a player list</h1><p>Three working styles. Pick one in game: Settings → Player list.</p>';const grid=document.createElement('main');grid.style.cssText='display:flex;gap:30px;flex-wrap:wrap';root.append(grid);document.body.append(root);const state=window.__ftw.state,players=new Map([['a',{id:'a',name:'nickygswagg',connected:true,seat:0,wins:42}],['b',{id:'b',name:'Moonbeam',connected:true,seat:1,wins:17}],['c',{id:'c',name:'BlazeFan',connected:true,seat:2,wins:8}],['d',{id:'d',name:'Waiting',connected:true,seat:3,wins:5}],['e',{id:'e',name:'Exploring',connected:true,seat:-1,wins:2}]]),sample={...state,you:'a',hostId:'a',players,match:{mode:'classic',phase:'typing',typerId:'b',participants:[{id:'a',alive:true,hearts:2,maxHearts:3},{id:'b',alive:true,hearts:3,maxHearts:3},{id:'c',alive:false,hearts:0,maxHearts:3}]}};for(const style of ['compact','portrait','ribbon']){setSetting('playerListStyle',style);const section=document.createElement('section');section.innerHTML='<h2>'+style[0].toUpperCase()+style.slice(1)+'</h2>';const list=createPlayerList();list.update(sample);list.el.style.cssText='position:relative;inset:auto';section.append(list.el);grid.append(section)}return root.innerHTML})()`);
 await p.shot('three-player-list-styles');
 const css=['base','hud','v2'].map(v=>readFileSync(`public/css/${v}.css`,'utf8')).join('\n');
 await p.eval("document.getElementById('roster-review').remove();window.__ftw.actions.preference('playerListStyle','portrait')");
 assert.equal(await p.eval("document.querySelector('.plist').dataset.style"),'portrait');
 const chat=await p.eval(`(()=>{const input=document.querySelector('.chat-input'),button=document.querySelector('.emote-button'),a=getComputedStyle(input),b=getComputedStyle(button);return{input:a.backgroundColor,button:b.backgroundColor,color:a.color,buttonColor:b.color,svg:!!button.querySelector('svg')}})()`);
 assert.equal(chat.input,chat.button);assert.equal(chat.color,chat.buttonColor);assert.ok(chat.svg);
 await p.eval(`(async()=>{const {playHatch}=await import('/js/ui/hatch.js');playHatch(document.getElementById('ui'),{block:{name:'Starter Block',color:'#ffc930'},petId:'dragon',count:1,onEquip:()=>{},thumbnail:window.__ftw.actions.thumbnail});document.querySelector('.hatch').click()})()`);
 await p.wait('document.querySelector(".hatch-pet-art img")?.src.startsWith("data:")');assert.equal(await p.eval('!!document.querySelector(".hatch-emoji")'),false);await p.shot('actual-pet-hatch');await p.clickText('Nice!');
 await p.eval('window.__ftw.actions.leave()');await p.wait('!window.__ftw.state.inRoom');const stopped=await p.eval('window.__ftw.profile.freePlayMs');await delay(2100);assert.equal(await p.eval('window.__ftw.profile.freePlayMs'),stopped);
 assert.deepEqual(p.errors,[]);
 const mobile=await b.page('roster-mobile',390,844,true);await mobile.nav(base+'/review.html#rosters');await mobile.wait('document.querySelectorAll(".roster-frame").length===4');await mobile.shot('style-comparison');
 console.log('PASS connected-only free progress, no offline credit, matching chat button, three live roster styles, actual pet hatch model; desktop/mobile screenshots saved.');
}finally{await b.close()}
