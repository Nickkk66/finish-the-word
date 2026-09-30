import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECONNECT_GRACE_MS } from '../public/js/shared/constants.js';
import { createRoom } from './helpers.js';
import { LIGHTHOUSE_SEATS, LIGHTHOUSE_ROOM, lighthouseSeatPosition } from '../public/js/shared/lighthouse.js';

function enter(room,id){
  const conn=room.join(id);
  room.send(conn,{t:'move',x:-31.85,y:0,z:-30.14,ry:0});
  room.send(conn,{t:'celebrate',kind:'portal',to:'lighthouse'});room.clock.advance(1000);
  assert.equal(room.engine.players.get(id).zone,'lighthouse');return conn;
}
function near(room,conn,seat){room.send(conn,{t:'move',...lighthouseSeatPosition(seat,true)});}

test('lighthouse chairs have authoritative occupancy without starting an island game',()=>{
  const room=createRoom(),a=enter(room,'alice'),b=enter(room,'bob');
  near(room,a,8);near(room,b,8);room.send(a,{t:'sit',seat:8});room.send(b,{t:'sit',seat:8});
  assert.equal(room.engine.players.get('alice').seat,8);assert.equal(room.engine.players.get('bob').seat,-1);
  assert.equal(b.last('error').code,'seat_taken');
  near(room,b,9);room.send(b,{t:'sit',seat:9});room.clock.advance(10000);
  assert.equal(room.engine.match.phase,'lobby');assert.deepEqual(room.engine.readyPlayers(),[]);
  room.send(a,{t:'host',action:'start'});assert.equal(room.engine.match.phase,'lobby');
  const before={...room.engine.players.get('alice').pos};
  room.send(a,{t:'move',x:300,y:0,z:9,ry:0});assert.deepEqual(room.engine.players.get('alice').pos,before);
  room.send(a,{t:'celebrate',kind:'portal',to:'island'});assert.ok(a.last('travelRejected'));
  room.send(a,{t:'stand'});assert.deepEqual(room.engine.players.get('alice').pos,lighthouseSeatPosition(8,true));
  near(room,b,8);room.send(b,{t:'sit',seat:8});assert.equal(room.engine.players.get('bob').seat,8);
});

test('lighthouse seating rejects wrong zones, distant seats and elevated positions',()=>{
  const room=createRoom(),a=room.join('alice');
  room.send(a,{t:'sit',seat:8});assert.equal(room.engine.players.get('alice').seat,-1);
  const b=enter(room,'bob');room.send(b,{t:'sit',seat:0});assert.equal(room.engine.players.get('bob').seat,-1);
  room.send(b,{t:'sit',seat:12});assert.equal(room.engine.players.get('bob').seat,-1);
  room.send(b,{t:'move',...lighthouseSeatPosition(8,true),y:6});room.send(b,{t:'sit',seat:8});assert.equal(room.engine.players.get('bob').seat,-1);
});

test('lighthouse seats are excluded from roulette entry and island participants',()=>{
  const room=createRoom(),a=enter(room,'alice');near(room,a,8);room.send(a,{t:'sit',seat:8});
  room.send(a,{t:'host',action:'settings',settings:{mode:'roulette'}});
  room.send(a,{t:'bet',requestId:'inside',amount:25,balance:100});assert.equal(room.engine.players.get('alice').rouletteBet,null);
  room.send(a,{t:'host',action:'settings',settings:{mode:'classic'}});
  const b=room.join('bob'),c=room.join('cara');room.send(b,{t:'sit',seat:0});room.send(c,{t:'sit',seat:1});room.send(a,{t:'host',action:'start'});
  assert.equal(room.engine.match.phase,'choosing');assert.deepEqual(room.engine.match.participants.map(p=>p.id),['bob','cara']);
  assert.equal(room.engine.players.get('alice').seat,8);
});

test('expanded room permits its new perimeter and releases disconnected seats',()=>{
  const room=createRoom(),a=enter(room,'alice');
  room.send(a,{t:'move',x:312,y:0,z:0,ry:0});assert.equal(room.engine.players.get('alice').pos.x,312);
  room.send(a,{t:'move',x:314,y:0,z:0,ry:0});assert.equal(room.engine.players.get('alice').pos.x,312);
  near(room,a,8);room.send(a,{t:'sit',seat:8});room.engine.disconnect(a);assert.equal(room.engine.seatOwner(8),null);room.clock.advance(RECONNECT_GRACE_MS+1);assert.equal(room.engine.seatOwner(8),null);
  for(const seat of LIGHTHOUSE_SEATS){const stand=lighthouseSeatPosition(seat.id,true);assert.ok(Math.hypot(stand.x-300,stand.z)<LIGHTHOUSE_ROOM.radius);}
});
