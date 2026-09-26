import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PlayerEntity} from '../public/js/world/player.js';

test('remote interpolation stays smooth through a delayed packet and settles when walking stops',()=>{
  const p=Object.create(PlayerEntity.prototype);
  Object.assign(p,{pos:new THREE.Vector3(),prev:new THREE.Vector3(),moveTarget:new THREE.Vector3(),yaw:0,speed:0,snapCount:2,snaps:[
    {t:0,x:0,y:0,z:0,ry:0,anim:'walk'}, {t:100,x:1.6,y:0,z:0,ry:0,anim:'walk'},
  ]});
  let previous=0;
  for(let t=100;t<=600;t+=1000/60){p.interpolate(1/60,t);assert.ok(p.pos.x>=previous);assert.ok(p.pos.x-previous<.5);previous=p.pos.x;}
  assert.ok(p.pos.x<=4 && p.pos.x>3.9,'extrapolation is capped at 150 ms');
  p.snaps.push({t:610,x:4,y:0,z:0,ry:0,anim:'idle'});p.snapCount=3;
  for(let t=610;t<1800;t+=1000/60)p.interpolate(1/60,t);
  assert.ok(Math.abs(p.pos.x-4)<.01);assert.equal(p.anim,'idle');
});
