// Authoritative room footprint and globally distinct seat IDs (island seats remain 0–7).
import { SEAT_COUNT } from './constants.js';
export const LIGHTHOUSE_ROOM=Object.freeze({
  center:{x:300,z:0},spawn:{x:300,y:0,z:8,ry:Math.PI},
  exit:{x:300,y:2.3,z:12.1},door:{x:300,y:0,z:13.15},radius:12.8,
  table:{x:299,z:-1.5,radius:4.2},
});
export const LIGHTHOUSE_SEATS=Object.freeze(Array.from({length:8},(_,i)=>{
  const angle=i*Math.PI/4,r=6.15;
  return {id:SEAT_COUNT+i,angle,x:299+Math.sin(angle)*r,y:0,z:-1.5+Math.cos(angle)*r,ry:angle+Math.PI};
}));
export const TOTAL_WORLD_SEATS=SEAT_COUNT+LIGHTHOUSE_SEATS.length;
export const lighthouseSeat=id=>LIGHTHOUSE_SEATS.find(s=>s.id===id);
export function lighthouseSeatPosition(id,standing=false){
  const s=lighthouseSeat(id);if(!s)return null;
  const offset=standing?2.8:-.15;
  return {x:s.x+Math.sin(s.angle)*offset,y:0,z:s.z+Math.cos(s.angle)*offset,ry:standing?s.angle:s.ry};
}
