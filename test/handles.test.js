import {createRoom} from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Accounts} from '../src/accounts.js';
function registry(){
 const db=new DatabaseSync(':memory:');const sql={exec(query,...args){const rows=db.prepare(query).all(...args);return rows;}};
 const a=new Accounts({storage:{sql}});
 return {a,db,async api(path,body,token){const response=await a.fetch(new Request(`https://test/api/handle/${path}`,{method:body?(path==='profile'?'PUT':'POST'):'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:response.status,...await response.json()};}};
}
test('unique handles ignore case, survive offline, free on rename and allow swaps',async()=>{
 const {api}=registry();
 const nick=await api('claim',{id:'identitynick',handle:'nick'}),jack=await api('claim',{id:'identityjack',handle:'jack'});
 assert.equal(nick.status,200);assert.equal(jack.status,200);
 assert.equal((await api('claim',{id:'someoneelse',handle:'NICK'})).status,409);
 assert.equal((await api('claim',{handle:'nick2'},nick.token)).status,200);
 assert.equal((await api('claim',{handle:'nick'},jack.token)).status,200);
 assert.equal((await api('claim',{handle:'jack'},nick.token)).status,200);
 assert.equal((await api('verify',null,nick.token)).name,'jack');
 assert.equal((await api('verify',null,jack.token)).name,'nick');
 assert.equal((await api('claim',{id:'someoneelse',handle:'nick2'})).status,200);
});
test('racing first claims have one winner and cannot steal identities or inject names',async()=>{
 const {api}=registry();
 const claims=await Promise.all([api('claim',{id:'identityone',handle:'One'}),api('claim',{id:'identitytwo',handle:'ONE'})]);
 assert.deepEqual(claims.map(c=>c.status).sort(),[200,409]);
 const winner=claims.find(c=>c.status===200);
 assert.equal((await api('claim',{id:winner.id,handle:'different'})).status,409);
 assert.equal((await api('claim',{handle:'bad<name'},winner.token)).status,400);
 assert.equal((await api('claim',{handle:'bot-Nick'},winner.token)).status,400);
 assert.equal((await api('claim',{handle:'Other'},'0'.repeat(64))).status,401);
});
test('guest handle adopts into account, cannot be stolen using copied profile and saves cannot rename',async()=>{
 const {a,api}=registry();
 const guest=await api('claim',{id:'accountidentity',handle:'nick'});
 async function account(path,body,token){const r=await a.fetch(new Request(`https://test/api/account/${path}`,{method:body?(path==='profile'?'PUT':'POST'):'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,...await r.json()};}
 const body={username:'private_login',password:'password',profile:{id:guest.id,name:'nick'}};
 assert.equal((await account('register',body)).status,409);
 const registered=await account('register',{...body,handleToken:guest.token});assert.equal(registered.status,200);
 assert.equal((await api('verify',null,guest.token)).status,401);
 assert.equal((await api('claim',{handle:'Nick2'},registered.token)).status,200);
 assert.equal((await account('profile',{revision:1,profile:{...registered.profile,name:'jack'}},registered.token)).status,200);
 assert.equal((await account('me',null,registered.token)).profile.name,'Nick2');
});


test('late room rename notifications cannot restore a released handle',()=>{
 const r=createRoom(),a=r.join('alice');
 r.engine.updateHandle('alice','nick2',3);r.engine.updateHandle('alice','nick',2);
 assert.equal(r.engine.players.get('alice').name,'nick2');assert.equal(a.last('player').p.name,'nick2');
});
