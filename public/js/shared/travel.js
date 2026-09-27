// Shared portal geometry. The server selects both the visual doorway and the arrival.
import { OBBY, LAYOUT } from './constants.js';
const angle=Math.atan2(37,35);
const outside={x:-37+Math.sin(angle)*5.8,y:.3,z:-35+Math.cos(angle)*5.8};
export const zoneAt = pos => pos?.x > 400 ? 'obby' : pos?.x > 250 ? 'lighthouse' : 'island';
export function portalRoute(zone,to,pos){
  if(zone===to||!['island','obby','lighthouse'].includes(to)||zone!=='island'&&to!=='island')return null;
  const distance=p=>pos?Math.hypot(pos.x-p.x,pos.z-p.z, pos.y-p.y):Infinity;
  if(zone==='island'){
    const door=to==='lighthouse'?outside:{x:LAYOUT.portal.x,y:.25,z:LAYOUT.portal.z};
    if(distance(door)>6)return null;
    return {door,arrival:to==='lighthouse'?{x:300,y:0,z:4,ry:Math.PI}:{...OBBY.spawn}};
  }
  const exits=zone==='lighthouse'?[{x:300,y:0,z:10.85}]:[{x:605,y:20,z:2},{x:600,y:30,z:-153}];
  const door=exits.sort((a,b)=>distance(a)-distance(b))[0];
  return {door:distance(door)<6?door:null,arrival:zone==='lighthouse'?{x:-30.8,y:0,z:-29.2,ry:angle}:{x:0,y:.25,z:72,ry:Math.PI}};
}
