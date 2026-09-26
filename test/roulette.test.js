import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from './helpers.js';

function setup(entry = 25) {
  const r = createRoom({seed: 29});
  const a = r.join('alice'), b = r.join('bob');
  r.send(a,{t:'host',action:'settings',settings:{mode:'roulette',rouletteEntry:entry}});
  r.send(a,{t:'sit',seat:0}); r.send(b,{t:'sit',seat:1});
  return {r,a,b};
}
const bet = (r,conn,id,amount=25) => r.send(conn,{t:'bet',requestId:id,amount,balance:1000});

test('roulette entries require funds, seat and a minimum stake; replay debits once and refund is unique',()=>{
  const {r,a,b}=setup(25);
  assert.equal(r.engine.match.phase,'lobby');
  r.send(a,{t:'bet',requestId:'poor',amount:25,balance:24});
  assert.equal(a.last('betResult').ok,false);
  bet(r,a,'a'); const receipt=a.last('betResult').receipt;
  bet(r,a,'a'); assert.equal(a.last('betResult').receipt,receipt);
  assert.equal(r.engine.players.get('alice').rouletteBet.amount,25);
  bet(r,b,'b'); assert.equal(r.engine.match.phase,'countdown');
  r.send(a,{t:'stand'}); r.send(a,{t:'stand'});
  assert.equal(a.all('stakeRefund').length,1); assert.equal(a.last('stakeRefund').coins,25);
  assert.equal(r.engine.match.phase,'lobby'); assert.deepEqual(r.errors,[]);
});

test('roulette hidden draw stays private, pass is once per knockout round, stale actions fail and timeout drinks',()=>{
  const {r,a,b}=setup();bet(r,a,'a');bet(r,b,'b');r.send(a,{t:'host',action:'start'});
  const m=r.engine.match;
  assert.equal(m.phase,'roulette');
  assert.equal(m.duration,10000);
  assert.ok(!JSON.stringify(r.engine.matchView()).includes('poisonSip'));
  const id=m.typerId, conn=r.conns[id], turn=m.turnId;
  r.send(conn,{t:'roulette',action:'pass',turnId:turn-1}); assert.equal(m.phase,'roulette');
  r.send(conn,{t:'roulette',action:'pass',turnId:turn}); assert.equal(m.phase,'rouletteReveal');
  r.clock.advance(1700);
  r.send(r.conns[m.typerId],{t:'roulette',action:'pass',turnId:m.turnId}); r.clock.advance(1700);
  assert.equal(m.typerId,id);
  r.send(conn,{t:'roulette',action:'pass',turnId:m.turnId}); assert.equal(m.phase,'roulette');
  r.clock.advance(10000); assert.equal(m.roulette.event.action,'drink'); assert.ok(m.roulette.risk>1/6);
  assert.deepEqual(r.errors,[]);
});

test('roulette poisons eliminate, prize grows and winner reward is paid exactly once',()=>{
  const {r,a,b}=setup(25); bet(r,a,'a');bet(r,b,'b');r.send(a,{t:'host',action:'start'});
  const m=r.engine.match; assert.equal(m.roulette.pot,50); r.forced.push(0);
  const loser=m.typerId;
  r.send(r.conns[loser],{t:'roulette',action:'drink',turnId:m.turnId});
  r.clock.advance(4800);
  assert.equal(m.phase,'ended');assert.notEqual(m.winnerId,loser);
  assert.equal(r.conns[m.winnerId].last('rouletteReward').coins,52);
  assert.equal(r.conns[loser].last('rouletteReward').coins,0);
  r.engine.endRoulette(m.winnerId);
  assert.equal(r.conns[m.winnerId].all('rouletteReward').length,1);
  r.clock.advance(15000); assert.equal(r.engine.match.phase,'lobby');
  assert.equal(r.engine.players.get('alice').rouletteBet,null);assert.deepEqual(r.errors,[]);
});

test('players choose independent entries; host entry changes are ignored and abort refunds each exact stake',()=>{
  const {r,a,b}=setup();bet(r,a,'a',25);bet(r,b,'b',100);
  r.send(a,{t:'host',action:'settings',settings:{rouletteEntry:500}});
  assert.equal(a.all('stakeRefund').length,0);assert.equal(r.engine.rouletteEntry,25);
  assert.equal(r.engine.players.get('bob').rouletteBet.amount,100);
  r.send(a,{t:'host',action:'start'});assert.equal(r.engine.match.roulette.pot,125);
  r.engine.endMatch(null);
  assert.equal(a.last('rouletteReward').coins,25);assert.equal(b.last('rouletteReward').coins,100);
  assert.deepEqual(r.errors,[]);
});

test('disconnect forfeits after grace, awards remaining player and reconnect replays debit and settlement receipts',()=>{
  const {r,a,b}=setup(25);bet(r,a,'a');bet(r,b,'b');r.send(a,{t:'host',action:'start'});
  r.engine.random=()=>.99;
  r.engine.disconnect(a);r.clock.advance(20000);
  assert.equal(b.last('rouletteReward').coins,52);
  const again=r.join('bob');assert.equal(again.last('rouletteReward').coins,52);
  assert.equal(again.last('betResult').receipt,b.last('betResult').receipt);
  assert.deepEqual(r.errors,[]);
});

test('pending entry is returned after disconnect and replayed on rejoining after grace',()=>{
  const {r,a}=setup(25);bet(r,a,'pending');r.engine.disconnect(a);r.clock.advance(20000);
  assert.equal(r.engine.players.has('alice'),false);
  const again=r.join('alice');
  assert.equal(again.last('betResult').amount,25);assert.equal(again.last('stakeRefund').coins,25);
  assert.deepEqual(r.errors,[]);
});

test('Custom preserves the selected word rules and a new preset replaces them',()=>{
  const r=createRoom(),a=r.join('alice'),b=r.join('bob');
  r.send(a,{t:'host',action:'settings',settings:{mode:'long'}});
  r.send(a,{t:'host',action:'settings',settings:{mode:'custom',hearts:3}});
  assert.equal(r.engine.settings.baseMode,'long');
  r.send(a,{t:'sit',seat:0});r.send(b,{t:'sit',seat:1});r.send(a,{t:'host',action:'start'});
  assert.equal(r.engine.match.mode,'custom');assert.equal(r.engine.match.minLength,5);
  r.clock.advance(1000);r.send(a,{t:'host',action:'settings',settings:{mode:'classic'}});
  assert.equal(r.engine.settings.baseMode,undefined);assert.equal(r.engine.settings.hearts,2);
  assert.deepEqual(r.errors,[]);
});

test('each completed turn multiplies prize and risk, including passes; risk caps at 95 percent',()=>{
 const {r,a,b}=setup();bet(r,a,'a');bet(r,b,'b');r.send(a,{t:'host',action:'start'});
 const m=r.engine.match;r.engine.random=()=>.999;
 const start=m.roulette.risk;
 r.send(r.conns[m.typerId],{t:'roulette',action:'pass',turnId:m.turnId});r.clock.advance(1700);
 assert.equal(m.roulette.pot,52);assert.equal(m.roulette.risk,start*1.25);
 for(let i=0;i<12;i++){r.send(r.conns[m.typerId],{t:'roulette',action:'drink',turnId:m.turnId});r.clock.advance(4800);}
 assert.equal(m.roulette.risk,.95);assert.ok(m.roulette.pot>90);assert.deepEqual(r.errors,[]);
});

test('fire charges only after 5 continuous seconds on the ground inside a crater, stops on exit or disconnect',()=>{
 const r=createRoom(),a=r.join('alice');r.send(a,{t:'host',action:'settings',settings:{mode:'roulette'}});r.clock.advance(7000);
 const move=(x=-20,y=0,z=4)=>r.send(a,{t:'move',x,y,z,ry:0,anim:'idle'});
 move();r.clock.advance(4999);assert.equal(a.all('hazardDebit').length,0);
 r.clock.advance(1);assert.equal(a.last('hazardDebit').amount,25);
 r.clock.advance(5000);assert.equal(a.all('hazardDebit').length,2);
 move(0,0,26);r.clock.advance(10000);assert.equal(a.all('hazardDebit').length,2);
 move();r.clock.advance(4000);move(0,0,26);r.clock.advance(1000);move();r.clock.advance(4999);assert.equal(a.all('hazardDebit').length,2);
 r.clock.advance(1);assert.equal(a.all('hazardDebit').length,3);
 move(-20,5,4);r.clock.advance(6000);assert.equal(a.all('hazardDebit').length,3);
 move();r.engine.disconnect(a);r.clock.advance(6000);assert.equal(a.all('hazardDebit').length,3);
 const again=r.join('alice');assert.equal(again.all('hazardDebit').length,3,'reconnect replays receipts, not additional charges');
 r.clock.advance(11999);assert.equal(again.all('hazardDebit').length,3,'intro grants time before fire starts');
 r.clock.advance(1);assert.equal(again.all('hazardDebit').length,4);
 assert.deepEqual(r.errors,[]);
});

test('pending Roulette settings do not create invisible fire during an active word match',()=>{
 const r=createRoom(),a=r.join('alice'),b=r.join('bob'),c=r.join('carol');
 r.send(a,{t:'sit',seat:0});r.send(b,{t:'sit',seat:1});r.send(a,{t:'host',action:'start'});
 r.send(a,{t:'host',action:'settings',settings:{mode:'roulette'}});
 r.send(c,{t:'move',x:-20,y:0,z:4,ry:0,anim:'idle'});
 r.clock.advance(7000);assert.equal(c.all('hazardDebit').length,0);assert.equal(r.engine.fireMode,false);
 r.engine.endMatch(null);r.clock.advance(7000);assert.equal(r.engine.fireMode,true);
 r.clock.advance(11999);assert.equal(c.all('hazardDebit').length,0);
 r.clock.advance(1);assert.equal(c.all('hazardDebit').length,1);
 r.send(a,{t:'host',action:'settings',settings:{mode:'classic'}});r.clock.advance(6000);
 assert.equal(c.all('hazardDebit').length,1);assert.deepEqual(r.errors,[]);
});

test('poison discount uses the actual individual stake and caps at 40 percent of base risk',()=>{
 const {r,a,b}=setup();bet(r,a,'a',25);bet(r,b,'b',100);r.send(a,{t:'host',action:'start'});
 const m=r.engine.match;m.roulette.risk=.55;r.engine.rouletteTurn('bob');
 let view=r.engine.matchView().roulette;assert.equal(view.baseRisk,.55);assert.ok(Math.abs(view.reduction-.22)<1e-9);assert.equal(view.risk,.33);
 r.engine.random=()=>.4;r.engine.rouletteAction('bob','drink');assert.equal(m.roulette.event.poisoned,false);
 r.clock.advance(4800);m.roulette.risk=.55;r.engine.rouletteTurn('alice');r.engine.rouletteAction('alice','drink');assert.equal(m.roulette.event.poisoned,true);
 m.stakes.alice=100;m.stakes.bob=100;assert.equal(r.engine.matchView().roulette.reduction,0);
 m.stakes.alice=25;m.stakes.bob=1e9;m.typerId='bob';assert.equal(r.engine.matchView().roulette.risk,.33);
 assert.deepEqual(r.errors,[]);
});

test('individual entries reject fractional, negative, below minimum, unsafe or unaffordable amounts',()=>{
 for(const amount of [-10,0,24,25.5,1001,Number.MAX_SAFE_INTEGER+1]){const {r,a}=setup();bet(r,a,'bad',amount);assert.equal(a.last('betResult').ok,false);}
 const {r,a}=setup();bet(r,a,'valid',777);assert.equal(a.last('betResult').amount,777);
});

test('night meteor arrives every three minutes, requires landing and proximity and rewards only one collector',()=>{
 const r=createRoom(),a=r.join('alice'),b=r.join('bob');r.send(a,{t:'host',action:'settings',settings:{mode:'roulette'}});
 r.clock.advance(179999);assert.equal(r.engine.meteor,null);r.clock.advance(1);const meteor=r.engine.meteor;assert.ok(meteor);assert.equal(a.last('meteor').meteor.landsIn,2400);
 r.send(a,{t:'collectMeteor',id:meteor.id});assert.equal(a.all('meteorReward').length,0);
 r.send(a,{t:'move',x:meteor.x,y:0,z:meteor.z,ry:0,anim:'idle'});r.send(a,{t:'collectMeteor',id:meteor.id});assert.equal(a.all('meteorReward').length,0);
 r.clock.advance(2400);r.send(b,{t:'collectMeteor',id:meteor.id});assert.equal(b.all('meteorReward').length,0);
 r.send(a,{t:'collectMeteor',id:meteor.id});assert.equal(a.last('meteorReward').coins,150);assert.equal(r.engine.meteor,null);
 r.send(b,{t:'move',x:meteor.x,y:0,z:meteor.z,ry:0,anim:'idle'});r.send(b,{t:'collectMeteor',id:meteor.id});assert.equal(b.all('meteorReward').length,0);
 r.send(a,{t:'collectMeteor',id:meteor.id});assert.equal(a.all('meteorReward').length,1);
 const again=r.join('alice');assert.equal(again.last('meteorReward').receipt,meteor.id);
 r.clock.advance(177600);assert.ok(r.engine.meteor);assert.notEqual(r.engine.meteor.id,meteor.id);
 const c=r.join('carol');assert.equal(c.last('welcome').meteor.id,r.engine.meteor.id);
 r.send(again,{t:'host',action:'settings',settings:{mode:'classic'}});assert.equal(r.engine.meteor,null);r.clock.advance(180000);assert.equal(r.engine.meteor,null);
 assert.deepEqual(r.errors,[]);
});
