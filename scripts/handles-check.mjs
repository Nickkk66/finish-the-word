import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
const base=process.env.BASE||'http://127.0.0.1:8787', b=await browser();
try{
 const a=await b.page('handles-nick'),other=await b.page('handles-jack',390,844,true);
 for(const p of [a,other]){await p.nav(base+'/?debug=1');await p.wait('window.__ftw?.world');}
 const suffix=Date.now().toString(36),nick='nick'+suffix,jack='jack'+suffix,nick2='nick2'+suffix;
 assert.equal(await a.eval(`window.__ftw.actions.rename('${nick}')`),true);
 assert.equal(await other.eval(`window.__ftw.actions.rename('${jack}')`),true);
 assert.equal(await other.eval(`window.__ftw.actions.rename('${nick.toUpperCase()}')`),false);
 assert.equal(await other.eval("(async()=>{const {profile}=await import('/js/profile.js');return profile.name;})()"),jack);
 await a.clickText('Create Private');await a.wait('window.__ftw.state.inRoom');const code=(await a.state()).code;
 await other.eval(`document.querySelector('.code-input').value='${code}'`);await other.clickText('Join');await other.wait('window.__ftw.state.inRoom');
 for(const [p,handle]of [[a,nick2],[other,nick],[a,jack]])assert.equal(await p.eval(`window.__ftw.actions.rename('${handle}')`),true);
 await a.wait(`window.__ftw.state.players.get(window.__ftw.state.you)?.name==='${jack}'`);
 await other.wait(`window.__ftw.state.players.get(window.__ftw.state.you)?.name==='${nick}'`);
 assert.equal(new Set((await a.state()).players.map(p=>p.name.toLowerCase())).size,2);
 await a.send({t:'loadout',name:'FORGED'});await delay(120);assert.equal(await a.eval('window.__ftw.state.players.get(window.__ftw.state.you).name'),jack);
 await a.eval('window.__ftw.actions.leave()');
 await a.eval(`window.__ftw.actions.accountRegister({username:'user${suffix}',password:'test-password'})`);
 assert.equal(await a.eval('window.__ftw.state.account.status'),'saved');
 await a.eval('window.__ftw.actions.accountLogout()');
 assert.equal(await a.eval('window.__ftw.state.account.status'),'guest');
 assert.equal(await a.eval(`window.__ftw.actions.rename('${jack}')`),false,'offline account retains its handle');
 await a.clickText('Create Private');await a.wait('window.__ftw.state.inRoom');
 assert.notEqual(await a.eval('window.__ftw.state.players.get(window.__ftw.state.you).name'),jack);
 assert.deepEqual(a.errors.filter(e=>!e.includes('409 (Conflict)')),[]);assert.deepEqual(other.errors.filter(e=>!e.includes('409 (Conflict)')),[]);
 console.log('PASS: Duplicate feedback, exact handle swap, room broadcasts, forged-name rejection, account adoption, offline reservation and guest play after logout.');
}catch(error){throw error;}finally{await b.close();}
