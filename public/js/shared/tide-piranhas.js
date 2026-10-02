import {WRECK} from './tide-wreck.js';
const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};

// Circle in from a distance, dart at an actual fragment, and breach the surface.
// Each fish uses a different attack phase so the school stays visible throughout.
export function piranhaPose(seconds,index,origin,water,targets=[]) {
 const age=seconds-WRECK.fish;
 function point(at){
  const phase=at/2.4+index*.17,cycle=phase-Math.floor(phase);
  const strike=(1-Math.cos(cycle*Math.PI*2))*.5;
  const a=index*Math.PI/4+at*1.15,r=11-6*ease((at+index*.06)/1.4)+Math.sin(at*2+index)*.7;
  const target=targets.length?targets[(index*2+Math.floor(phase))%targets.length]:origin;
  const x=origin.x+Math.sin(a)*r,z=origin.z+Math.cos(a)*r;
  return {x:x+(target.x-x)*strike,y:water+.35+Math.sin(cycle*Math.PI)**4*2.0,z:z+(target.z-z)*strike};
 }
 const p=point(Math.max(0,age)),before=point(Math.max(0,age-.01)),after=point(Math.max(0,age)+.01);
 const dx=after.x-before.x,dy=after.y-before.y,dz=after.z-before.z;
 return {...p,yaw:Math.atan2(dx,dz),pitch:-Math.atan2(dy,Math.hypot(dx,dz)),roll:Math.sin(age*9+index)*.1,
  visible:seconds>=WRECK.fish&&seconds<WRECK.swarmEnd};
}
