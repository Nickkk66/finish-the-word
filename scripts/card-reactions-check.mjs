import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
const b=await browser(),base=process.env.BASE||'http://127.0.0.1:8787';
try{
 const a=await b.page('card-reactions'),c=await b.page('card-reactions-peer');
 await a.nav(`${base}/?debug=1`);await a.wait('window.__ftw?.world');await a.clickText('Create Private');await a.wait('window.__ftw.state.inRoom');
 await c.nav(`${base}/?debug=1&room=${(await a.state()).code}`);await c.wait('window.__ftw?.world');await c.clickText('Join');await c.wait('window.__ftw.state.inRoom');
 await a.send({t:'sit',seat:0});await c.send({t:'sit',seat:1});await a.send({t:'host',action:'start'});await a.wait('window.__ftw.state.match.phase==="choosing"');
 let state=await a.state();const chooser=state.match.chooserId===state.you?a:c;await chooser.send({t:'pick',letter:state.match.options[0]});await a.wait('window.__ftw.state.match.phase==="typing"');state=await a.state();
 const actor=state.match.typerId===state.you?a:c;await actor.clickText('My cards','.turn-tools button');await actor.wait('!document.querySelector(".quick-card-tray").hidden');
 await actor.send({t:'stand'});await actor.wait('document.querySelector(".quick-card-tray").hidden');
 const reaction=await a.eval(`(async()=>{const {Avatar}=await import('./js/world/avatar.js');const a=new Avatar();const normal=a.headMesh.material.color.getHex();a.skip();const grey=a.headMesh.material.color.getHex();for(let i=0;i<190;i++)a.update(1/60,i/60);const restored=a.headMesh.material.color.getHex();a.setSeated(true);a.rouletteSleeping=true;a.update(.1,4);const surprised=a.faceExpression;a.update(.4,4.4);const ghost=a.faceExpression;a.rouletteSleeping=false;a.update(.1,4.5);return{normal,grey,restored,surprised,ghost,after:a.faceExpression};})()`);
 assert.notEqual(reaction.normal,reaction.grey);assert.equal(reaction.normal,reaction.restored);assert.equal(reaction.surprised,'surprised');assert.equal(reaction.ghost,'ghost');assert.equal(reaction.after,'normal');
 assert.deepEqual(a.errors,[]);assert.deepEqual(c.errors,[]);console.log('PASS card panel closes on lost heart, skip grey restores, surprised/ghost face restores');
}finally{await b.close();}
