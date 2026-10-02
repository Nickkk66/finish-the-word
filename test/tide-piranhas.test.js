import test from 'node:test';
import assert from 'node:assert/strict';
import {piranhaPose} from '../public/js/shared/tide-piranhas.js';
import {WRECK} from '../public/js/shared/tide-wreck.js';
const origin={x:3,z:28},water=9,targets=[{x:2,z:30},{x:5,z:26}];
test('piranhas arrive before the bite and stay through the camera hold',()=>{
 assert.equal(piranhaPose(WRECK.fish-.01,0,origin,water).visible,false);
 assert.equal(piranhaPose(WRECK.grab,0,origin,water).visible,true);
 assert.equal(piranhaPose(WRECK.cameraEnd+1,0,origin,water).visible,true);
 assert.equal(piranhaPose(WRECK.swarmEnd,0,origin,water).visible,false);
 for(let t=WRECK.grab;t<WRECK.cameraEnd;t+=.1){
  assert.ok(Array.from({length:8},(_,i)=>piranhaPose(t,i,origin,water,targets)).filter(p=>p.y>water+.3).length>=2,'at least two fish breach the surface at '+t);
 }
});
test('piranha strikes reach fragments without teleporting between targets',()=>{
 const hit=piranhaPose(WRECK.fish+1.2,0,origin,water,targets);
 assert.ok(Math.hypot(hit.x-targets[0].x,hit.z-targets[0].z)<.001);
 const a=piranhaPose(WRECK.fish+2.4-.0001,0,origin,water,targets),b=piranhaPose(WRECK.fish+2.4+.0001,0,origin,water,targets);
 assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.01);
});
