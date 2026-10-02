import { test } from 'node:test';
import assert from 'node:assert/strict';
import {roulettePayoutCap,fireDamage} from '../public/js/shared/roulette.js';
import { createRoom } from './helpers.js';

function setup(entry = 25) {
  const r = createRoom({seed: 29});
  const a = r.join('alice'), b = r.join('bob');
  r.engine.players.get('alice').accountCreatedAt = -100_000_000;
  r.engine.players.get('bob').accountCreatedAt = -100_000_000;
  r.send(a,{t:'host',action:'settings',settings:{mode:'roulette',rouletteEntry:entry}});
  r.send(a,{t:'sit',seat:0}); r.send(b,{t:'sit',seat:1});
  return {r,a,b};
}
const bet = (r,conn,id,amount=25) => r.send(conn,{t:'bet',requestId:id,amount,balance:1000});

test('roulette entries require funds and a seat; standing commits the entry and reseating uses it',()=>{
  const {r,a,b}=setup(25);
  assert.equal(r.engine.match.phase,'lobby');
  r.send(a,{t:'bet',requestId:'poor',amount:25,balance:24});
  assert.equal(a.last('betResult').ok,false);
  bet(r,a,'a'); const receipt=a.last('betResult').receipt;
  bet(r,a,'a'); assert.equal(a.last('betResult').receipt,receipt);
  assert.equal(r.engine.players.get('alice').rouletteBet.amount,25);
  bet(r,b,'b'); assert.equal(r.engine.match.phase,'countdown');
  r.send(a,{t:'stand'}); r.send(a,{t:'stand'});
  assert.equal(a.all('stakeRefund').length,0);
  assert.equal(r.engine.players.get('alice').rouletteBet.amount,25);
  assert.equal(r.engine.match.phase,'lobby'); assert.deepEqual(r.errors,[]);
  r.clock.advance(1000);r.send(a,{t:'sit',seat:0});
  assert.equal(r.engine.match.phase,'countdown');
  assert.equal(a.all('betResult').filter(result=>result.ok).length,2,'the repeated request reuses the one receipt');
  r.send(a,{t:'host',action:'settings',settings:{mode:'classic'}});
  assert.equal(r.engine.settings.mode,'roulette','the host cannot switch modes to reclaim their own entry');
  assert.equal(a.last('error').code,'entry_committed');
});

test('roulette hidden draw stays private, pass is once per match, stale actions fail and timeout drinks',()=>{
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
  r.clock.advance(10000); assert.equal(m.roulette.event.action,'drink'); assert.equal(m.roulette.risk,.1);
  assert.deepEqual(r.errors,[]);
});

test('a knockout does not give an earlier passer a second pass',()=>{
  const {r,a,b}=setup(),c=r.join('carol');
  r.send(c,{t:'sit',seat:2});
  bet(r,a,'a');bet(r,b,'b');bet(r,c,'c');r.send(a,{t:'host',action:'start'});
  const m=r.engine.match, passer=m.typerId;
  r.send(r.conns[passer],{t:'roulette',action:'pass',turnId:m.turnId});r.clock.advance(1700);
  r.engine.random=()=>0;
  r.send(r.conns[m.typerId],{t:'roulette',action:'drink',turnId:m.turnId});r.clock.advance(4800);
  assert.equal(m.phase,'roulette');
  r.engine.random=()=>.999;
  r.send(r.conns[m.typerId],{t:'roulette',action:'drink',turnId:m.turnId});r.clock.advance(4800);
  assert.equal(m.typerId,passer);
  r.send(r.conns[passer],{t:'roulette',action:'pass',turnId:m.turnId});
  assert.equal(m.phase,'roulette');
  assert.equal(m.roulette.passed.has(passer),true);
});

test('roulette poisons eliminate, prize grows and winner reward is paid exactly once',()=>{
  const {r,a,b}=setup(25); bet(r,a,'a');bet(r,b,'b');r.send(a,{t:'host',action:'start'});
  const m=r.engine.match; assert.equal(m.roulette.pot,40); r.forced.push(0);
  const loser=m.typerId;
  r.send(r.conns[loser],{t:'roulette',action:'drink',turnId:m.turnId});
  r.clock.advance(4800);
  assert.equal(m.phase,'ended');assert.notEqual(m.winnerId,loser);
  assert.equal(r.conns[m.winnerId].last('rouletteReward').coins,40);
  assert.equal(r.conns[loser].last('rouletteReward').coins,0);
  r.engine.endRoulette(m.winnerId);
  assert.equal(r.conns[m.winnerId].all('rouletteReward').length,1);
  r.clock.advance(15000); assert.equal(r.engine.match.phase,'lobby');
  assert.equal(r.engine.players.get('alice').rouletteBet,null);assert.deepEqual(r.errors,[]);
});

test('Double Sip uses a fixed 60% risk and adds the winner’s multiplied entry to the pool once',()=>{
  const {r,a,b}=setup();bet(r,a,'a');bet(r,b,'b');r.send(a,{t:'host',action:'start'});
  const m=r.engine.match, first=m.typerId;
  r.forced.push(.61);
  r.send(r.conns[first],{t:'roulette',action:'double',turnId:m.turnId});
  assert.equal(m.roulette.event.poisoned,false);
  r.clock.advance(4800);
  assert.equal(m.roulette.doubleSurvivors.has(first),true);
  r.forced.push(0);
  r.send(r.conns[m.typerId],{t:'roulette',action:'drink',turnId:m.turnId});
  r.clock.advance(4800);
  assert.equal(m.winnerId,first);
  const reward=r.conns[first].last('rouletteReward');
  assert.equal(reward.coins,Math.min(roulettePayoutCap(m.roulette.basePot),m.roulette.pot+Math.floor(25*m.roulette.multiplier)));
  assert.match(reward.bonuses[0].label,/double sip/);
  assert.equal(r.conns[first].all('rouletteReward').length,1);
  assert.deepEqual(r.errors,[]);
});

test('Double Sip kills below 60% even when ordinary poison risk is low',()=>{
  const {r,a,b}=setup();bet(r,a,'a');bet(r,b,'b');r.send(a,{t:'host',action:'start'});
  const m=r.engine.match, loser=m.typerId;
  r.forced.push(.5);
  r.send(r.conns[loser],{t:'roulette',action:'double',turnId:m.turnId});
  assert.equal(m.roulette.event.poisoned,true);
  r.clock.advance(4800);
  assert.notEqual(m.winnerId,loser);
  assert.equal(r.conns[m.winnerId].last('rouletteReward').coins,m.roulette.pot);
});

test('players choose independent entries; host entry changes are ignored and abort refunds each exact stake',()=>{
  const {r,a,b}=setup();bet(r,a,'a',25);bet(r,b,'b',100);
  r.send(a,{t:'host',action:'settings',settings:{rouletteEntry:500}});
  assert.equal(a.all('stakeRefund').length,0);assert.equal(r.engine.rouletteEntry,25);
  assert.equal(r.engine.players.get('bob').rouletteBet.amount,100);
  r.send(a,{t:'host',action:'start'});assert.equal(r.engine.match.roulette.pot,40);
  r.engine.endMatch(null);
  assert.equal(a.last('rouletteReward').coins,25);assert.equal(b.last('rouletteReward').coins,100);
  assert.deepEqual(r.errors,[]);
});

test('owner cancellation returns each roulette entry once and cannot award a winner',()=>{
  const {r,a,b}=setup();bet(r,a,'a',25);bet(r,b,'b',100);
  r.send(a,{t:'host',action:'start'});
  const matchId=r.engine.match.matchId;
  r.send(b,{t:'host',action:'endMatch'});
  assert.equal(r.engine.match.matchId,matchId);
  r.send(a,{t:'host',action:'endMatch'});
  assert.ok(['lobby','countdown'].includes(r.engine.match.phase));
  assert.equal(a.last('matchRefund').coins,25);
  assert.equal(b.last('matchRefund').coins,100);
  assert.equal(a.all('rouletteReward').length,0);
  assert.equal(b.all('rouletteReward').length,0);
  r.send(a,{t:'host',action:'endMatch'});
  assert.equal(a.all('matchRefund').length,1);
  assert.deepEqual(r.errors,[]);
});

test('disconnect forfeits after grace, awards remaining player and reconnect replays debit and settlement receipts',()=>{
  const {r,a,b}=setup(25);bet(r,a,'a');bet(r,b,'b');r.send(a,{t:'host',action:'start'});
  r.engine.random=()=>.99;
  r.engine.disconnect(a);r.clock.advance(20000);
  assert.equal(b.last('rouletteReward').coins,40);
  const again=r.join('bob');assert.equal(again.last('rouletteReward').coins,40);
  assert.equal(again.last('betResult').receipt,b.last('betResult').receipt);
  assert.deepEqual(r.errors,[]);
});

test('pending entry is forfeited after leaving and cannot be refunded on rejoining',()=>{
  const {r,a}=setup(25);bet(r,a,'pending');r.engine.disconnect(a);r.clock.advance(20000);
  assert.equal(r.engine.players.has('alice'),false);
  const again=r.join('alice');
  assert.equal(again.last('betResult').amount,25);
  assert.equal(again.last('stakeRefund'),undefined);
  assert.equal(r.engine.players.get('alice').rouletteBet,null);
  assert.deepEqual(r.errors,[]);
});

test('room table follows the selected mode rather than a player loadout or admin override',()=>{
  const r=createRoom(),a=r.join('alice'),b=r.join('bob');
  assert.equal(r.engine.roomTable(),'classic');
  r.send(a,{t:'loadout',table:'galaxy'});
  assert.equal(r.engine.roomTable(),'classic');
  r.send(a,{t:'host',action:'settings',settings:{mode:'blitz'}});
  assert.equal(r.engine.roomTable(),'lava');
  r.send(a,{t:'host',action:'settings',settings:{mode:'roulette'}});
  assert.equal(r.engine.roomTable(),'poker');
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

test('prize and risk grow only after each living player acts',()=>{
 const {r,a,b}=setup();bet(r,a,'a');bet(r,b,'b');r.send(a,{t:'host',action:'start'});
 const m=r.engine.match;r.engine.random=()=>.999;
 const start=m.roulette.risk;
 r.send(r.conns[m.typerId],{t:'roulette',action:'pass',turnId:m.turnId});r.clock.advance(1700);
 assert.equal(m.roulette.pot,40);assert.equal(m.roulette.risk,start);
 r.send(r.conns[m.typerId],{t:'roulette',action:'drink',turnId:m.turnId});r.clock.advance(4800);
 assert.equal(m.roulette.risk,.1);
 assert.equal(m.roulette.pot,41);
 r.send(r.conns[m.typerId],{t:'roulette',action:'drink',turnId:m.turnId});r.clock.advance(4800);
 assert.equal(m.roulette.risk,.1);
 for(let i=0;i<22;i++){r.send(r.conns[m.typerId],{t:'roulette',action:'drink',turnId:m.turnId});r.clock.advance(4800);}
 assert.equal(m.roulette.risk,.95);assert.equal(m.roulette.pot,45);assert.deepEqual(r.errors,[]);
});

test('one full circuit gives the same multiplier with two or five players', () => {
  for (const count of [2, 5]) {
    const { r, a, b } = setup();
    const seated = [a, b];
    for (let i = 2; i < count; i++) {
      const id = `extra${i}`, conn = r.join(id);
      r.engine.players.get(id).accountCreatedAt = 1;
      r.send(conn, { t: 'sit', seat: i });
      seated.push(conn);
    }
    seated.forEach((conn, i) => bet(r, conn, `stake${i}`));
    r.send(a, { t: 'host', action: 'start' });
    const m = r.engine.match;
    r.engine.random = () => .999;
    for (let i = 0; i < count; i++) {
      r.send(r.conns[m.typerId], { t: 'roulette', action: 'drink', turnId: m.turnId });
      r.clock.advance(4800);
    }
    assert.equal(m.roulette.loops, 1);
    assert.equal(m.roulette.multiplier, 1.04);
  }
});

test('fire charges every continuous second, stops on exit, jumping and disconnect',()=>{
 const r=createRoom(),a=r.join('alice');r.send(a,{t:'host',action:'settings',settings:{mode:'roulette'}});r.clock.advance(17000);
 const move=(x=-20,y=0,z=4)=>r.send(a,{t:'move',x,y,z,ry:0,anim:'idle'});
 move();r.clock.advance(999);assert.equal(a.all('hazardDebit').length,0);r.clock.advance(1);assert.equal(a.last('hazardDebit').amount,50);assert.equal(a.last('hazardDebit').belowMinimum,'halve');
 r.clock.advance(1000);assert.equal(a.all('hazardDebit').length,2);move(0,0,26);r.clock.advance(10000);assert.equal(a.all('hazardDebit').length,2);
 move();r.clock.advance(500);move(0,0,26);r.clock.advance(1000);move();r.clock.advance(999);assert.equal(a.all('hazardDebit').length,2);r.clock.advance(1);assert.equal(a.all('hazardDebit').length,3);
 move(-20,5,4);r.clock.advance(6000);assert.equal(a.all('hazardDebit').length,3);move();r.engine.disconnect(a);r.clock.advance(6000);assert.equal(a.all('hazardDebit').length,3);
 const again=r.join('alice');assert.equal(again.all('hazardDebit').length,3);r.send(again,{t:'host',action:'settings',settings:{mode:'roulette'}});r.send(again,{t:'move',x:-20,y:0,z:4,ry:0,anim:'idle'});r.clock.advance(17999);assert.equal(again.all('hazardDebit').length,3);r.clock.advance(1);assert.equal(again.all('hazardDebit').length,4);assert.deepEqual(r.errors,[]);
});

test('pending Roulette settings do not create invisible fire during an active word match',()=>{
 const r=createRoom(),a=r.join('alice'),b=r.join('bob'),c=r.join('carol');
 r.send(a,{t:'sit',seat:0});r.send(b,{t:'sit',seat:1});r.send(a,{t:'host',action:'start'});
 r.send(a,{t:'host',action:'settings',settings:{mode:'roulette'}});
 r.send(c,{t:'move',x:-20,y:0,z:4,ry:0,anim:'idle'});
 r.clock.advance(7000);assert.equal(c.all('hazardDebit').length,0);assert.equal(r.engine.fireMode,false);
 r.engine.endMatch(null);r.clock.advance(7000);assert.equal(r.engine.fireMode,true);
 r.clock.advance(17999);assert.equal(c.all('hazardDebit').length,0);
 r.clock.advance(1);assert.equal(c.all('hazardDebit').length,1);
 r.send(a,{t:'host',action:'settings',settings:{mode:'classic'}});r.clock.advance(6000);
 assert.equal(c.all('hazardDebit').length,1);assert.deepEqual(r.errors,[]);
});

test('poison discount applies only above the table average',()=>{
 const {r,a,b}=setup();bet(r,a,'a',25);bet(r,b,'b',100);r.send(a,{t:'host',action:'start'});
 const m=r.engine.match;m.roulette.risk=.55;r.engine.rouletteTurn('bob');
 let view=r.engine.matchView().roulette;assert.equal(view.baseRisk,.55);assert.ok(view.reduction===0);assert.ok(view.risk===.55);
 r.engine.random=()=>.56;r.engine.rouletteAction('bob','drink');assert.equal(m.roulette.event.poisoned,false);
 r.clock.advance(4800);m.roulette.risk=.55;r.engine.random=()=>.49;r.engine.rouletteTurn('alice');r.engine.rouletteAction('alice','drink');assert.equal(m.roulette.event.poisoned,true);
 m.stakes.alice=100;m.stakes.bob=100;assert.equal(r.engine.matchView().roulette.reduction,0);
 m.stakes.alice=25;m.stakes.bob=1e9;m.typerId='bob';assert.ok(Math.abs(r.engine.matchView().roulette.risk-.44)<1e-8);
 assert.deepEqual(r.errors,[]);
});

test('individual entries reject fractional, negative, below minimum, unsafe or unaffordable amounts',()=>{
 for(const amount of [-10,0,24,25.5,1001,Number.MAX_SAFE_INTEGER+1]){const {r,a}=setup();bet(r,a,'bad',amount);assert.equal(a.last('betResult').ok,false);}
 const {r,a}=setup();bet(r,a,'valid',777);assert.equal(a.last('betResult').amount,777);
});

test('Death Wish starts at 50 percent risk and grows its prize faster than The Last Sip',()=>{
 const {r,a,b}=setup();
 r.send(a,{t:'host',action:'settings',settings:{mode:'roulette_deadly'}});
 bet(r,a,'a',25);bet(r,b,'b',100);r.send(a,{t:'host',action:'start'});
 const m=r.engine.match;
 assert.equal(m.mode,'roulette_deadly');assert.equal(m.roulette.risk,.5);
 assert.equal(m.roulette.pot,40);assert.equal(r.engine.roomTable(),'poker');
 r.engine.rouletteTurn('bob');
 assert.ok(r.engine.matchView().roulette.risk===.5);
 r.engine.random=()=>.99;r.engine.rouletteAction('bob','drink');r.clock.advance(4800);
 assert.equal(m.roulette.multiplier,1);assert.equal(m.roulette.pot,40);
 assert.equal(m.roulette.risk,.5);
 r.engine.endMatch(null);assert.equal(a.last('rouletteReward').coins,25);assert.equal(b.last('rouletteReward').coins,100);
 assert.deepEqual(r.errors,[]);
});

test('night meteor arrives every three minutes, requires landing and proximity and rewards only one collector',()=>{
 const r=createRoom(),a=r.join('alice'),b=r.join('bob');r.send(a,{t:'host',action:'settings',settings:{mode:'roulette'}});
 r.clock.advance(179999);assert.equal(r.engine.meteor,null);r.clock.advance(1);const meteor=r.engine.meteor;assert.ok(meteor);assert.equal(a.last('meteor').meteor.landsIn,12400);
 assert.equal(a.last('chat').tone,'alert');assert.equal(b.last('chat').tone,'alert');
 r.send(a,{t:'collectMeteor',id:meteor.id});assert.equal(a.all('meteorReward').length,0);
 r.send(a,{t:'move',x:meteor.x,y:0,z:meteor.z,ry:0,anim:'idle'});r.send(a,{t:'collectMeteor',id:meteor.id});assert.equal(a.all('meteorReward').length,0);
 r.clock.advance(12400);r.send(b,{t:'collectMeteor',id:meteor.id});assert.equal(b.all('meteorReward').length,0);
 r.send(a,{t:'collectMeteor',id:meteor.id});assert.equal(a.last('meteorReward').coins,150);assert.equal(r.engine.meteor,null);
 assert.deepEqual(b.last('meteor').collected,{id:meteor.id,x:meteor.x,z:meteor.z,by:'alice'});
 r.send(b,{t:'move',x:meteor.x,y:0,z:meteor.z,ry:0,anim:'idle'});r.send(b,{t:'collectMeteor',id:meteor.id});assert.equal(b.all('meteorReward').length,0);
 r.send(a,{t:'collectMeteor',id:meteor.id});assert.equal(a.all('meteorReward').length,1);
 const again=r.join('alice');assert.equal(again.last('meteorReward').receipt,meteor.id);
 r.send(again,{t:'activity'});r.send(b,{t:'activity'});r.clock.advance(167600);assert.ok(r.engine.meteor);assert.notEqual(r.engine.meteor.id,meteor.id);
 const c=r.join('carol');assert.equal(c.last('welcome').meteor.id,r.engine.meteor.id);
 r.send(again,{t:'host',action:'settings',settings:{mode:'classic'}});assert.equal(r.engine.meteor,null);r.clock.advance(180000);assert.equal(r.engine.meteor,null);
 assert.deepEqual(r.errors,[]);
});

test('all prize growth, Double Sip and pet bonuses stay inside the funded house cap',()=>{
 for(const mode of ['roulette','roulette_deadly'])for(const pet of ['piggy','bear',null])for(const loops of [0,1,10,100]){
  const {r,a,b}=setup();r.send(a,{t:'host',action:'settings',settings:{mode}});r.send(a,{t:'loadout',pet});bet(r,a,'a',100);bet(r,b,'b',100);r.send(a,{t:'host',action:'start'});
  const m=r.engine.match;for(let i=0;i<loops;i++){m.roulette.cycle=new Set(['alice','bob']);r.engine.completeRouletteCircuit();}
  m.roulette.doubleSurvivors=new Set(['alice']);r.engine.endRoulette('alice');const total=[a,b].reduce((sum,c)=>sum+c.last('rouletteReward').coins,0);assert.ok(total<=180,'total payouts are at most 90% of 200 deposited coins');assert.equal(b.last('rouletteReward').coins,0);assert.deepEqual(r.errors,[]);
 }
});
test('fire halves small balances all the way to zero and charges 50 otherwise',()=>{
 assert.equal(fireDamage(100),50);let balance=49;const values=[];while(balance){balance-=fireDamage(balance);values.push(balance)}assert.deepEqual(values,[24,12,6,3,1,0]);assert.equal(fireDamage(0),0);
});
test('purple meteor warns ten seconds before falling and damages its own footprint',()=>{
 const r=createRoom(),a=r.join('alice');r.send(a,{t:'host',action:'settings',settings:{mode:'roulette'}});r.clock.advance(180000);const m=r.engine.meteor;assert.equal(a.last('meteor').meteor.fallsIn,10000);assert.match(a.last('chat').text,/10 seconds/);
 r.send(a,{t:'move',x:m.x,y:0,z:m.z,ry:0,anim:'idle'});r.clock.advance(13399);assert.equal(a.all('hazardDebit').length,0);r.clock.advance(1);assert.equal(a.last('hazardDebit').amount,50);r.clock.advance(1000);assert.equal(a.all('hazardDebit').length,2);r.send(a,{t:'move',x:0,y:0,z:26,ry:0,anim:'idle'});r.clock.advance(2000);assert.equal(a.all('hazardDebit').length,2);
});
