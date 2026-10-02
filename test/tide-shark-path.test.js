import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharkPath,wreckBodyPose} from '../public/js/shared/tide-shark-path.js';
import {WRECK} from '../public/js/shared/tide-wreck.js';
const water=3,pos={x:0,z:22,yaw:Math.PI},body=wreckBodyPose(WRECK.grab,pos,7.4,water),path=createSharkPath(body.head,water,pos.yaw);
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
test('shark arcs retain continuous positions and velocities at every stage',()=>{
 for(const knot of path.knots.slice(1,-1)){
  const a=path.sample(knot.t-1e-5),b=path.sample(knot.t+1e-5);
  assert.ok(distance(a.position,b.position)<.001,'position at '+knot.t);
  assert.ok(distance(a.velocity,b.velocity)<.02,'direction/speed at '+knot.t);
 }
});
test('warning leap follows an arc, dives on reentry, then returns to a separate attack',()=>{
 assert.ok(path.sample(6.7).position[1]>water+6);
 assert.ok(path.sample(WRECK.jump).velocity[1]>0);assert.ok(path.sample(WRECK.land).velocity[1]<0);
 assert.ok(path.sample(7.85).position[1]<water-2);
 assert.ok(path.sample(9).position[1]>water-1);
 assert.ok(path.sample(WRECK.grab).velocity[1]>0,'attack rises to meet the head');
});
test('bite meets the swimmer head; carry and dive keep moving along the same path',()=>{
 assert.ok(distance(path.sample(WRECK.grab).position,Object.values(body.head))<1e-8);
 const carry=path.sample(WRECK.drag),dive=path.sample(WRECK.sink),end=path.sample(WRECK.gone);
 assert.ok(distance(carry.position,Object.values(body.head))>5);
 assert.ok(distance(dive.position,Object.values(body.head))>distance(carry.position,Object.values(body.head)));
 assert.ok(end.position[1]<water-10);
 // The carried head exits around the rim into open water, never through the
 // supporting column behind the swimmer. Check the whole curve, not just knots.
 const rimDistance=Math.hypot(body.head.x-pos.x,body.head.z-pos.z);
 for(let t=WRECK.grab;t<WRECK.gone;t+=.02){
  const [x,,z]=path.sample(t).position;
  assert.ok(Math.hypot(x-pos.x,z-pos.z)>=rimDistance-.001,'carry clears the platform at '+t);
 }
});
