import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from './helpers.js';

function setup(entry = 0) {
  const r = createRoom({seed: 29});
  const a = r.join('alice'), b = r.join('bob');
  r.send(a,{t:'host',action:'settings',settings:{mode:'roulette',rouletteEntry:entry}});
  r.send(a,{t:'sit',seat:0}); r.send(b,{t:'sit',seat:1});
  return {r,a,b};
}
const bet = (r,conn,id,amount=25) => r.send(conn,{t:'bet',requestId:id,amount,balance:1000});

test('roulette entries require funds, seat and matching stake; replay debits once and refund is unique',()=>{
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

test('roulette hidden draw stays private, pass is once per bottle, stale actions fail and timeout drinks',()=>{
  const {r,a}=setup(); r.send(a,{t:'host',action:'start'});
  const m=r.engine.match; m.poisonSip=6;
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
  r.clock.advance(10000); assert.equal(m.roulette.event.action,'drink'); assert.equal(m.roulette.remaining,5);
  assert.deepEqual(r.errors,[]);
});

test('roulette poisons eliminate, pot is conserved and winner reward is paid exactly once',()=>{
  const {r,a,b}=setup(25); bet(r,a,'a');bet(r,b,'b');r.send(a,{t:'host',action:'start'});
  const m=r.engine.match; assert.equal(m.roulette.pot,50); m.poisonSip=1;
  const loser=m.typerId;
  r.send(r.conns[loser],{t:'roulette',action:'drink',turnId:m.turnId});
  r.clock.advance(2600);
  assert.equal(m.phase,'ended');assert.notEqual(m.winnerId,loser);
  assert.equal(r.conns[m.winnerId].last('rouletteReward').coins,50);
  assert.equal(r.conns[loser].last('rouletteReward').coins,0);
  r.engine.endRoulette(m.winnerId);
  assert.equal(r.conns[m.winnerId].all('rouletteReward').length,1);
  r.clock.advance(15000); assert.equal(r.engine.match.phase,'lobby');
  assert.equal(r.engine.players.get('alice').rouletteBet,null);assert.deepEqual(r.errors,[]);
});

test('changing roulette settings returns pending entries and abort returns active entries',()=>{
  const {r,a,b}=setup(25);bet(r,a,'a');bet(r,b,'b');
  r.send(a,{t:'host',action:'settings',settings:{rouletteEntry:100}});
  assert.equal(a.last('stakeRefund').coins,25);assert.equal(b.last('stakeRefund').coins,25);
  assert.equal(r.engine.match.phase,'lobby');
  r.clock.advance(1000);bet(r,a,'a2',100);bet(r,b,'b2',100);r.send(a,{t:'host',action:'start'});
  r.engine.endMatch(null);
  assert.equal(a.last('rouletteReward').coins,100);assert.equal(b.last('rouletteReward').coins,100);
  assert.deepEqual(r.errors,[]);
});

test('disconnect forfeits after grace, awards remaining player and reconnect replays debit and settlement receipts',()=>{
  const {r,a,b}=setup(25);bet(r,a,'a');bet(r,b,'b');r.send(a,{t:'host',action:'start'});
  r.engine.match.poisonSip=6;
  r.engine.disconnect(a);r.clock.advance(20000);
  assert.equal(b.last('rouletteReward').coins,50);
  const again=r.join('bob');assert.equal(again.last('rouletteReward').coins,50);
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
