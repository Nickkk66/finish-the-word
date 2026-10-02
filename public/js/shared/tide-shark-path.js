import {WRECK} from './tide-wreck.js';
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};

// The same local pitch/yaw convention as the avatar's YXZ root transform.
export function wreckBodyPose(seconds,pos,floor,water,reduced=false) {
 const falling=ease((seconds-WRECK.shake)/(WRECK.water-WRECK.shake)),swimming=ease((seconds-WRECK.water)/(WRECK.breach-WRECK.water));
 // Keep the swimmer beyond the full shark's turning envelope. The head sits
 // almost five units closer to the platform than the swimming body's origin.
 const distance=seconds<WRECK.water?14*falling:14-swimming*1.8;
 const bob=seconds>=WRECK.water?Math.sin(seconds*5)*.1*(1-ease((seconds-WRECK.breach)/.6)):0;
 const shake=seconds<WRECK.shake?Math.sin(seconds*29)*(reduced?.008:.04):0;
 const y=floor+.23+(water-.15-floor-.23)*falling+bob,pitch=Math.PI*.46*falling;
 const pose={x:pos.x-Math.sin(pos.yaw)*distance,y,z:pos.z-Math.cos(pos.yaw)*distance,yaw:pos.yaw,pitch,tilt:shake,seated:true,visible:seconds<WRECK.drag};
 const h=4.625+.5*(1-falling),lx=-h*Math.sin(shake),ly=h*Math.cos(shake),lz=ly*Math.sin(pitch);
 pose.head={x:pose.x+lx*Math.cos(pos.yaw)+lz*Math.sin(pos.yaw),y:pose.y+ly*Math.cos(pitch),z:pose.z-lx*Math.sin(pos.yaw)+lz*Math.cos(pos.yaw)};
 return pose;
}

// Positions and velocities join through cubic Hermite arcs. Animate the mouth for
// the entire sequence, including cruise, so changing stages never shifts the model.
export function createSharkPath(head,water,yaw) {
 const angle=yaw+1.12,A={x:-Math.sin(angle),z:-Math.cos(angle)},B={x:Math.cos(angle),z:-Math.sin(angle)};
 const point=(a,b,y)=>[head.x+A.x*a+B.x*b,water+y,head.z+A.z*a+B.z*b];
 const outward={x:-Math.sin(yaw),z:-Math.cos(yaw)},side={x:Math.cos(yaw),z:-Math.sin(yaw)};
 const exitPoint=(across,out,y)=>[head.x+side.x*across+outward.x*out,water+y,head.z+side.z*across+outward.z*out];
 const knots=[
  [WRECK.water,58,0,-.65],[5.7,40,0,-.65],[WRECK.jump,38,0,-.35],
  [WRECK.land,26,4,-.65],[7.85,22,7,-3.1],[9,16,10,-.65],
  [WRECK.breach,8,8,-.65],[13,2.8,3.8,-2],
  [WRECK.grab,0,0,head.y-water],
 ].map(([t,a,b,y])=>({t,p:point(a,b,y)}));
 knots.push({t:WRECK.drag,p:exitPoint(7,3.5,1.3)},{t:WRECK.sink,p:exitPoint(20,13,-1.6)},{t:WRECK.gone,p:exitPoint(30,25,-13)});
 for(let i=0;i<knots.length;i++){
  const lo=knots[Math.max(0,i-1)],hi=knots[Math.min(knots.length-1,i+1)];
  knots[i].v=hi.p.map((v,k)=>(v-lo.p[k])/(hi.t-lo.t));
 }
 const velocity=(i,a,b,y)=>{knots[i].v=[A.x*a+B.x*b,y,A.z*a+B.z*b];};
 velocity(1,-6,0,0);velocity(2,-7,0,22);velocity(3,-8,5,-22);velocity(4,-7,4,0);
 // Carry tangentially past the rim before turning out to sea. Continuing straight
 // through the bite would intersect the platform just behind the swimmer's head.
 const exitVelocity=(i,across,out,y)=>{knots[i].v=[side.x*across+outward.x*out,y,side.z*across+outward.z*out];};
 exitVelocity(8,4,0,3);exitVelocity(9,6,5,-.8);exitVelocity(10,10,10,-3.5);exitVelocity(11,10,12,-12);
 return {knots,sample(seconds){
  if(seconds<=knots[0].t)return {position:[...knots[0].p],velocity:[...knots[0].v]};
  if(seconds>=knots.at(-1).t)return {position:[...knots.at(-1).p],velocity:[...knots.at(-1).v]};
  const i=knots.findIndex(p=>p.t>seconds),a=knots[i-1],b=knots[i],span=b.t-a.t,u=(seconds-a.t)/span,u2=u*u,u3=u2*u;
  const position=a.p.map((p,k)=>(2*u3-3*u2+1)*p+(u3-2*u2+u)*span*a.v[k]+(-2*u3+3*u2)*b.p[k]+(u3-u2)*span*b.v[k]);
  const velocity=a.p.map((p,k)=>((6*u2-6*u)*p+(3*u2-4*u+1)*span*a.v[k]+(-6*u2+6*u)*b.p[k]+(3*u2-2*u)*span*b.v[k])/span);
  return {position,velocity};
 }};
}
