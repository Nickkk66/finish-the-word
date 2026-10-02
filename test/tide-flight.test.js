import test from 'node:test';
import assert from 'node:assert/strict';
import {TIDE_FLIGHT as f,tideLaunchHeight,tideLaunchVelocity,tideFlightPose} from '../public/js/shared/tide-flight.js';
const origin={x:0,y:0,z:0},rider={x:0,y:7.63,z:22,yaw:Math.PI};
test('Tide launch has an immediate impulse and a continuous parachute catch',()=>{
 assert.equal(tideLaunchHeight(0),0);
 assert.ok(tideLaunchHeight(.2)>15,'must be a forceful launch instead of a slow lift');
 const before=tideFlightPose(f.deploy-.0001,origin,rider,0),after=tideFlightPose(f.deploy,origin,rider,0);
 assert.ok(Math.abs(before.y-after.y)<.01,'parachute deployment cannot teleport the rider');
 for(const seat of [1,2,3,4]){
  const before=tideFlightPose(f.deploy-.0001,origin,rider,seat),at=tideFlightPose(f.deploy,origin,rider,seat),after=tideFlightPose(f.deploy+.0001,origin,rider,seat);
  for(const axis of ['x','y','z']){
   assert.ok(Math.abs(before[axis]-after[axis])<.01,`continuous ${axis} position for seat ${seat}`);
   assert.ok(Math.abs((at[axis]-before[axis])/.0001-(after[axis]-at[axis])/.0001)<.03,`continuous ${axis} velocity for seat ${seat}`);
  }
 }
});
test('Tide rider tucks before reaching the chair and finishes at the same platform transform',()=>{
 const tucked=tideFlightPose(f.seated,origin,rider,0);
 assert.equal(tucked.seated,true);assert.equal(tucked.seatBlend,1);assert.ok(tucked.landingAltitude>0);
 const last=tideFlightPose(f.land-.0001,origin,rider,0);
 assert.equal(last.seated,true);assert.ok(Math.abs(last.x-rider.x)<.001&&Math.abs(last.y-rider.y)<.001&&Math.abs(last.z-rider.z)<.001);
 assert.equal(tideFlightPose(f.land,origin,rider,0),null);
});


test('free fall keeps its launch motion and the opening canopy slows descent continuously',()=>{
 const falling=tideFlightPose(10,origin,rider,0);assert.ok(falling.descending&&falling.fallingBlend>.9);
 const dt=.0001,at=t=>tideFlightPose(t,origin,rider,0).y;
 const before=(at(f.deploy)-at(f.deploy-dt))/dt,after=(at(f.deploy+dt)-at(f.deploy))/dt;
 assert.ok(Math.abs(before-after)<.01);assert.ok(Math.abs(before-tideLaunchVelocity(f.deploy-f.launch))<.01);
 let previous=at(f.deploy);for(let t=f.deploy+.1;t<f.land;t+=.1){const y=at(t);assert.ok(y<=previous+.001&&y>=rider.y);previous=y;}
});

test('free fall is faster while the established parachute descent is preserved',()=>{
 assert.ok(f.deploy<10.4,'chute opens sooner after the quicker fall');
 assert.ok(tideLaunchVelocity(f.deploy-f.launch)<-23,'free fall is faster before opening');
 const at=t=>tideFlightPose(t,origin,rider,0).y;
 // After the catch, the old canopy path started at 48.18 with velocity -3 and
 // took 10.7 seconds to reach the chair. Keep that pace instead of speeding it up.
 const catchEnd=f.land-10.7,dt=.0001;
 assert.ok(Math.abs(at(catchEnd)-48.18)<.02);
 assert.ok(Math.abs((at(catchEnd+dt)-at(catchEnd-dt))/(2*dt)+3)<.01);
 assert.ok(Math.abs(f.land-catchEnd-10.7)<.001);
});
