import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Accounts,cloudProfile} from '../src/accounts.js';
function fixture(){const db=new DatabaseSync(':memory:');const sql={exec(query,...args){return db.prepare(query).all(...args);}};const accounts=new Accounts({storage:{sql}});return {db,sql,accounts,async call(path,body){return accounts.fetch(new Request('https://internal'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));}};}
function save(f,id,coins,wins,history=[]){const profile=cloudProfile({id,name:id,coins,wins,tradeHistory:history},id);f.sql.exec('INSERT INTO accounts (username,salt,password_hash,profile,revision,created_at) VALUES (?,?,?,?,1,?)',id,'unused','unused',JSON.stringify(profile),Date.now());}
const offer=(id,qty=1)=>({items:[{kind:'card',id,qty}]});
test('global trade audit deduplicates completion and filters either participant across rooms',async()=>{
 const f=fixture(),now=Date.now();
 const make=(id,room,people,at)=>({id,room,at,people:people.map(id=>({id,name:id})),offers:Object.fromEntries(people.map(id=>[id,offer('time_tax')]))});
 const first=make('trade-one','ROOM1',['alice','bob'],now),second=make('trade-two','ROOM2',['carol','bob'],now+100);
 await f.call('/trade-log',first);await f.call('/trade-log',first);await f.call('/trade-log',second);
 const global=await(await f.call('/admin-trades',{})).json();assert.deepEqual(global.trades.map(t=>t.id),['trade-two','trade-one']);assert.equal(global.trades[0].source,'server');
 const alice=await(await f.call('/admin-trades',{id:'alice'})).json();assert.deepEqual(alice.trades.map(t=>t.id),['trade-one']);
 const bob=await(await f.call('/admin-trades',{id:'bob'})).json();assert.equal(bob.trades.length,2);
 const nobody=await(await f.call('/admin-trades',{id:'nobody'})).json();assert.equal(nobody.trades.length,0);
 // Records persist when the Durable Object is reconstructed over its storage.
 const resumed=new Accounts({storage:{sql:f.sql}});const r=await resumed.fetch(new Request('https://internal/admin-trades',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));assert.equal((await r.json()).trades.length,2);f.db.close();
});
test('saved trade histories remain visible without duplicating modern server records',async()=>{
 const f=fixture(),now=Date.now();save(f,'alice',10,2,[{at:now-20000,partner:'bob',outgoing:offer('time_tax'),incoming:offer('skip')},{tradeId:'modern',partnerId:'bob',at:now,partner:'bob',outgoing:offer('skip'),incoming:offer('time_tax')}]);save(f,'bob',20,5);
 await f.call('/trade-log',{id:'modern',room:'ROOM1',at:now,people:[{id:'alice',name:'alice'},{id:'bob',name:'bob'}],offers:{alice:offer('skip'),bob:offer('time_tax')}});
 const result=await(await f.call('/admin-trades',{id:'bob'})).json();assert.equal(result.trades.length,2);assert.equal(result.trades[1].source,'saved');assert.equal(result.trades[1].people[1].id,'bob');f.db.close();
});
test('admin account listing returns sortable coins and wins and sorts before limiting',async()=>{
 const f=fixture();for(let i=0;i<102;i++)save(f,'user'+i,i,102-i);
 const coins=await(await f.call('/admin-profiles',{action:'list',sort:'coins',direction:'desc'})).json();assert.equal(coins.users.length,100);assert.equal(coins.users[0].coins,101);assert.equal(coins.users[0].wins,1);
 const wins=await(await f.call('/admin-profiles',{action:'list',sort:'wins',direction:'desc'})).json();assert.equal(wins.users[0].name,'user0');assert.equal(wins.users[0].wins,102);
 const ascending=await(await f.call('/admin-profiles',{action:'list',sort:'coins',direction:'asc'})).json();assert.equal(ascending.users[0].coins,0);
 const search=await(await f.call('/admin-profiles',{action:'list',search:'user101'})).json();assert.equal(search.users.length,1);assert.equal(search.users[0].coins,101);f.db.close();
});
test('trade audit endpoints are not exposed to public account requests',async()=>{
 const f=fixture();for(const path of ['/trade-log','/admin-trades']){const response=await f.accounts.fetch(new Request('https://example.com'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));assert.notEqual(response.status,200);}f.db.close();
});
