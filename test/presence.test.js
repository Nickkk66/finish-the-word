import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from './helpers.js';
import {IDLE_MS,MIN_IDLE_MS,PRESENCE_REPLY_MS} from '../public/js/shared/presence.js';
import {observeMovement} from '../src/movement-pattern.js';
import {presenceMethods} from '../src/presence.js';
test('randomized delay covers 2 minutes 15 seconds to 5 minutes without consuming game randomness',()=>{
 assert.equal(MIN_IDLE_MS,135000);assert.equal(IDLE_MS,300000);
 const context={crypto:{getRandomValues(a){a[0]=0;return a;}}};assert.equal(presenceMethods.presenceDelay.call(context),MIN_IDLE_MS);
 context.crypto.getRandomValues=a=>{a[0]=IDLE_MS-MIN_IDLE_MS;return a;};assert.equal(presenceMethods.presenceDelay.call(context),IDLE_MS);
});
test('idle challenge times out; ping, loadout and wrong responses cannot evade it',()=>{
 const r=createRoom();r.engine.presenceDelay=()=>MIN_IDLE_MS;const a=r.join('alice'),b=r.join('bob');
 r.clock.advance(MIN_IDLE_MS-1);r.send(a,{t:'ping',c:1});r.send(a,{t:'loadout',pet:'dragon'});assert.equal(a.all('presenceCheck').length,0);
 r.clock.advance(1);assert.equal(a.last('presenceCheck').remainingMs,PRESENCE_REPLY_MS);
 r.send(a,{t:'activity'});r.send(a,{t:'presenceReply',token:'wrong'});r.clock.advance(PRESENCE_REPLY_MS);
 assert.equal(a.closed.reason,'inactive');assert.equal(b.closed.reason,'inactive');assert.equal(r.engine.players.size,0);assert.equal(r.clock.pending,0);assert.deepEqual(r.errors,[]);
});
test('input and correct reply each draw a fresh random idle deadline',()=>{
 const r=createRoom();let delay=60000;r.engine.presenceDelay=()=>delay;const a=r.join('alice');
 r.clock.advance(59000);r.send(a,{t:'chat',text:'Hello!'});r.clock.advance(60000);const check=a.last('presenceCheck');
 delay=90000;r.clock.advance(10000);r.send(a,{t:'presenceReply',token:check.token});assert.equal(a.last('presenceCleared').token,check.token);
 r.clock.advance(89999);assert.equal(a.all('presenceCheck').length,1);r.clock.advance(1);assert.equal(a.all('presenceCheck').length,2);assert.deepEqual(r.errors,[]);
});
test('active turns pause checks, reconnect keeps them, cancellation restores remaining response time',()=>{
 const r=createRoom();r.engine.presenceDelay=()=>MIN_IDLE_MS;const a=r.join('alice'),b=r.join('bob');
 r.clock.advance(MIN_IDLE_MS);const check=a.last('presenceCheck');r.clock.advance(10000);
 r.send(a,{t:'sit',seat:0});r.send(b,{t:'sit',seat:1});r.send(a,{t:'host',action:'start'});r.engine.setPhase('typing',600000);
 assert.equal(a.last('presencePaused').token,check.token);r.clock.advance(60000);assert.ok(r.engine.players.has('alice'));assert.equal(r.engine.canAward('alice'),false);
 const again=r.join('alice');assert.equal(again.all('presenceCheck').length,0);
 r.send(again,{t:'host',action:'endMatch'});assert.equal(again.last('presenceCheck').remainingMs,20000);
 // Countdown is safe; keep this test in the lobby instead of automatically starting again.
 r.engine.setPhase('lobby');r.clock.advance(20000);assert.equal(again.closed.reason,'inactive');assert.deepEqual(r.errors,[]);
});
test('actual turn input clears a paused check and prevents an active player being kicked',()=>{
 const r=createRoom();r.engine.presenceDelay=()=>MIN_IDLE_MS;const a=r.join('alice'),b=r.join('bob');r.clock.advance(MIN_IDLE_MS);
 r.send(a,{t:'sit',seat:0});r.send(b,{t:'sit',seat:1});r.send(a,{t:'host',action:'start'});
 const m=r.engine.match,chooserId=m.chooserId,chooser=r.conns[chooserId];r.send(chooser,{t:'pick',letter:m.options[0]});
 assert.equal(r.engine.players.get(chooserId)?.presence,null);assert.equal(chooser.all('presenceCleared').length,1);assert.deepEqual(r.errors,[]);
});
test('overdue AFK opponents cannot win or earn money while removals wait for round end',()=>{
 for(const mode of ['classic','roulette']){
  const r=createRoom();r.engine.presenceDelay=()=>MIN_IDLE_MS;const a=r.join('alice'),b=r.join('bob');
  r.send(a,{t:'host',action:'settings',settings:{mode}});r.send(a,{t:'sit',seat:0});r.send(b,{t:'sit',seat:1});
  if(mode==='roulette')for(const [id,c]of [['alice',a],['bob',b]]){r.engine.players.get(id).accountCreatedAt=-100000000;r.send(c,{t:'bet',requestId:id,amount:25,balance:100});}
  r.send(a,{t:'host',action:'start'});r.engine.setPhase(mode==='classic'?'typing':'roulette',600000);r.clock.advance(MIN_IDLE_MS+10000);
  assert.ok(r.engine.players.has('alice'));assert.equal(r.engine.canAward('alice'),false);
  if(mode==='classic')r.engine.endMatch('alice');else r.engine.endRoulette('alice');
  assert.equal(a.last('win').id,null);assert.equal(a.all('reward').length+b.all('reward').length+a.all('rouletteReward').length+b.all('rouletteReward').length,0);assert.deepEqual(r.errors,[]);
 }
});
const point=i=>({x:10+Math.cos(i*Math.PI/8)*3,z:25+Math.sin(i*Math.PI/8)*3,y:0,ry:i*Math.PI/8,anim:'walk'});
test('sustained exact PC movement loop triggers removal; ordinary holding, varied timing and touch do not',()=>{
 const r=createRoom(),a=r.join('alice',{inputDevice:'desktop'});
 for(let i=0;i<600&&!a.closed;i++){r.clock.advance(150);r.send(a,{t:'move',...point(i%16)});}
 assert.equal(a.closed.reason,'automated_activity');assert.equal(r.engine.players.has('alice'),false);assert.deepEqual(r.errors,[]);
 for(const variant of ['touch','held','timing','path']){
  const p={inputDevice:variant==='touch'?'touch':'desktop'};let at=0,flag=false;
  for(let i=0;i<900;i++){at+=variant==='timing'?100+(i*37%113):150;const pos=variant==='held'?point(0):point(i%16);if(variant==='path')pos.x+=(i%17)*.021;flag||=observeMovement(p,pos,at);}
  assert.equal(flag,false,variant);
 }
});


test('generic key spam and unchanged movement cannot postpone a check forever',()=>{
 const r=createRoom(),a=r.join('alice',{inputDevice:'desktop'});
 for(let i=0;i<310;i++){r.clock.advance(1000);r.send(a,{t:'activity'});r.send(a,{t:'move',x:10,y:0,z:25,ry:0,anim:'idle'});}
 assert.equal(a.all('presenceCheck').length,1);assert.ok(r.engine.players.get('alice').presence);assert.deepEqual(r.errors,[]);
});


test('recently engaged players retain reward eligibility while waiting for turns and animations',()=>{
 const r=createRoom();r.engine.presenceDelay=()=>MIN_IDLE_MS;const a=r.join('alice'),b=r.join('bob');
 r.send(a,{t:'sit',seat:0});r.send(b,{t:'sit',seat:1});r.send(a,{t:'host',action:'start'});
 r.engine.noteActivity(r.engine.players.get('alice'),true);r.engine.setPhase('typing',600000);r.clock.advance(MIN_IDLE_MS+10000);
 assert.equal(r.engine.canAward('alice'),true);assert.equal(r.engine.canAward('bob'),false);
 r.clock.advance(IDLE_MS);assert.equal(r.engine.canAward('alice'),false);assert.ok(r.engine.players.has('alice'));assert.deepEqual(r.errors,[]);
});
