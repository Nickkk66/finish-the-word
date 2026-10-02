import test from 'node:test';import assert from 'node:assert/strict';import {createRoom} from './helpers.js';import {cloudProfile,restrictSecretBacks} from '../src/accounts.js';import {tradeInventory,tradeOffer} from '../public/js/shared/trade.js';
test('secret gifts cannot be forged through loadout, profile or trade and an admin can grant them',()=>{
 const r=createRoom(),a=r.join('alice',{back:'secret_crown',profile:{ownedBacks:['none','secret_crown'],equippedBack:'secret_crown'}}),p=r.engine.players.get('alice');assert.equal(p.back,'none');assert.deepEqual(p.profile.ownedBacks,['none']);
 r.send(a,{t:'loadout',back:'secret_helmet',profile:{ownedBacks:['none','secret_helmet'],equippedBack:'secret_helmet'}});assert.equal(p.back,'none');assert.deepEqual(p.profile.ownedBacks,['none']);
 assert.deepEqual(tradeInventory({ownedBacks:['secret_crown','cape']}).backs,['cape']);assert.equal(tradeOffer({items:[{kind:'back',id:'secret_crown'}]}).items.length,0);
 r.engine.editPlayer('profile',{id:'alice',profile:{ownedBacks:['none','secret_crown'],equippedBack:'secret_crown'}});assert.equal(p.back,'secret_crown');r.clock.advance(1000);r.send(a,{t:'loadout',back:'secret_crown',profile:p.profile});assert.equal(p.back,'secret_crown');assert.ok(p.profile.ownedBacks.includes('secret_crown'));assert.deepEqual(r.errors,[]);
});
test('normal cloud saves can retain an admin gift but cannot add another',()=>{
 const p=cloudProfile({ownedBacks:['none','secret_crown','secret_scythe'],equippedBack:'secret_scythe'});restrictSecretBacks(p,['secret_crown']);assert.deepEqual(p.ownedBacks,['none','secret_crown']);assert.equal(p.equippedBack,'none');
});

test('all three head-mounted goggles remain admin-only and cannot be traded or forged',()=>{
 for(const id of ['secret_goggles_shield','secret_goggles_split','secret_goggles_racer']){
  const r=createRoom(),a=r.join('alice',{back:id,profile:{ownedBacks:['none',id],equippedBack:id}}),p=r.engine.players.get('alice');
  assert.equal(p.back,'none');assert.deepEqual(tradeInventory({ownedBacks:[id]}).backs,[]);
  r.engine.editPlayer('profile',{id:'alice',profile:{ownedBacks:['none',id],equippedBack:id}});
  assert.equal(p.back,id);assert.deepEqual(r.errors,[]);
 }
});
