// The keeper's room: baked island stills and a prerecorded downward ocean loop.
import * as THREE from 'three';
import { woodTexture, stoneTexture } from './textures.js';
import { LIGHTHOUSE_ROOM, LIGHTHOUSE_SEATS } from '../shared/lighthouse.js';
import { buildChair, disposeObject } from './cosmetics.js';
import { enableShadows } from './materials.js';
export { LIGHTHOUSE_ROOM } from '../shared/lighthouse.js';

export function createLighthouseInterior(scene) {
  const room = new THREE.Group(); room.position.x=300; room.visible=false; scene.add(room);
  const platforms=[{x:300,y:-.2,z:0,w:28,h:.4,d:28,dx:0,dz:0}];
  const oak=new THREE.MeshLambertMaterial({map:woodTexture('#946c45')}), dark=new THREE.MeshLambertMaterial({map:woodTexture('#40302b')});
  const masonry=stoneTexture().clone();masonry.repeat.set(10,4);masonry.needsUpdate=true;
  const brass=new THREE.MeshLambertMaterial({color:'#d9b875'}), plaster=new THREE.MeshLambertMaterial({map:masonry,color:'#ded5be',side:THREE.BackSide});
  const teal=new THREE.MeshLambertMaterial({color:'#29595d'});
  function add(g,m,x,y,z,rx=0,ry=0,rz=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);o.castShadow=o.receiveShadow=true;room.add(o);return o;}
  const box=(w,h,d,m,x,y,z,ry=0)=>add(new THREE.BoxGeometry(w,h,d),m,x,y,z,0,ry);
  add(new THREE.CylinderGeometry(14,14,.4,48),dark,0,-.21,0);
  // Individually laid planks, clipped to the circular wall.
  for(let z=-13.5;z<=13.5;z+=.65){const width=2*Math.sqrt(13.9**2-z*z);box(width,.06,.62,oak,0,-.025,z);}
  add(new THREE.CylinderGeometry(14,14,14,48,1,true),plaster,0,7,0);
  add(new THREE.CylinderGeometry(14.1,14.1,.3,48),dark,0,14,0);
  for(const y of [.3,3.5,12.8])add(new THREE.TorusGeometry(13.75,.13,6,48),oak,0,y,0,Math.PI/2);
  for(let i=0;i<24;i++){const a=i*Math.PI/12;box(.14,3.3,.18,oak,Math.sin(a)*13.7,1.7,Math.cos(a)*13.7,a);}
  // Navigation table: rim, inset chart, pedestal, crossed feet and brass compass.
  add(new THREE.CylinderGeometry(4.2,4.2,.28,40),dark,-1,2.9,-1.5);
  add(new THREE.CylinderGeometry(4.03,4.03,.035,40),teal,-1,3.06,-1.5);
  add(new THREE.CylinderGeometry(.65,.95,2.6,16),oak,-1,1.45,-1.5);
  for(const a of [0,Math.PI/2])box(4,.23,.65,dark,-1,.18,-1.5,a);
  const chart=document.createElement('canvas');chart.width=512;chart.height=320;const ink=chart.getContext('2d');
  ink.fillStyle='#d8c798';ink.fillRect(0,0,512,320);ink.strokeStyle='#7f957e';ink.lineWidth=2;
  for(let i=0;i<8;i++){ink.beginPath();for(let x=0;x<512;x+=5){const y=35+i*35+Math.sin(x*.018+i)*11;x?ink.lineTo(x,y):ink.moveTo(x,y);}ink.stroke();}
  ink.fillStyle='#547868';ink.beginPath();ink.ellipse(265,160,88,63,-.4,0,Math.PI*2);ink.fill();ink.fillStyle='#53482e';ink.font='22px serif';ink.fillText('KEEPER’S CHART',24,30);ink.fillText('N ↑',435,55);
  const chartTex=new THREE.CanvasTexture(chart);chartTex.colorSpace=THREE.SRGBColorSpace;
  add(new THREE.PlaneGeometry(3,1.9),new THREE.MeshLambertMaterial({map:chartTex}),-1,3.09,-1.5,-Math.PI/2,0,.12);
  add(new THREE.TorusGeometry(.4,.045,8,24),brass,.7,3.12,-2.7,Math.PI/2);
  const chairs=LIGHTHOUSE_SEATS.map(seat=>{
    const group=new THREE.Group();group.position.set(seat.x-300,0,seat.z);group.rotation.y=seat.ry;room.add(group);
    return {id:seat.id,group,model:null,chair:null};
  });
  function setChair(id,chair='wooden'){
    const slot=chairs.find(s=>s.id===id);if(!slot||slot.chair===chair)return;
    if(slot.model){slot.model.removeFromParent();disposeObject(slot.model);}
    slot.chair=chair;slot.model=buildChair(chair);enableShadows(slot.model);slot.group.add(slot.model);
  }
  for(const seat of LIGHTHOUSE_SEATS)setChair(seat.id);
  const colliders=[{x:299,z:-1.5,r:4.3},...LIGHTHOUSE_SEATS.map(s=>({x:s.x,z:s.z,r:1.1}))];
  // Solid stair risers support every tread. The 30cm rise is within the motor's step limit.
  for(let i=0;i<20;i++){
    const top=(i+1)*.3,z=6-i*.6;
    box(2.4,top,.6,dark,10,top/2,z);box(2.5,.07,.63,oak,10,top+.035,z);
    platforms.push({x:310,y:top/2,z,w:2.4,h:top,d:.6,dx:0,dz:0,kind:'stairs'});
    for(const x of [8.85,11.15])if(i%2===0){box(.1,1.25,.1,brass,x,top+.65,z);}
  }
  // Continuous sloping rails, landing and a telescope looking toward the island.
  for(const x of [8.85,11.15])add(new THREE.BoxGeometry(.14,13.45,.14),brass,x,4.5,.3,-Math.atan2(11.4,5.7));
  box(3,.3,2.4,oak,9.7,5.85,-6.6);platforms.push({x:309.7,y:5.85,z:-6.6,w:3,h:.3,d:2.4,dx:0,dz:0,kind:'landing'});
  for(const x of [8.25,11.15])box(.2,5.8,.2,dark,x,2.9,-7.6);
  box(3,1.1,.14,teal,9.7,6.55,-7.75);
  for(const dx of [-.45,.45])add(new THREE.CylinderGeometry(.06,.09,1.7,8),brass,9.6+dx,6.85,-6.8,0,0,dx*.65);
  add(new THREE.CylinderGeometry(.2,.3,1.8,16),brass,9.6,7.7,-6.8,Math.PI/2,0,.25);
  // A wall cabinet with books and navigation instruments.
  box(3.3,3.2,.65,dark,-10,1.7,-5.5,-.6);
  for(let i=0;i<8;i++)box(.22,1.1,.35,i%2?teal:brass,-11+i*.25,2.2,-5.1);
  for(const y of [.8,1.55,2.85])box(3.2,.12,.85,oak,-10,y,-5.5,-.6);
  // Hanging lantern. No new light count changes when entering/leaving the room.
  box(.07,3,.07,brass,0,12.4,0);
  add(new THREE.CylinderGeometry(.55,.65,1.1,12),new THREE.MeshBasicMaterial({color:'#ffe3a6'}),0,10.5,0);
  for(const y of [9.9,11.1])add(new THREE.CylinderGeometry(.75,.75,.12,12),brass,0,y,0);
  const lamp=new THREE.PointLight('#ffdfa4',90,29,1.4);lamp.position.set(300,10,0);scene.add(lamp);
  // Door trim and inset panels.
  box(2.5,3.6,.2,dark,0,1.8,13.6);
  for(const y of [1,2.5])box(1.8,1.1,.1,teal,0,y,13.44);
  for(const x of [-1.4,1.4])box(.2,3.9,.3,brass,x,1.95,13.42);
  box(3,.18,.3,brass,0,3.9,13.42);add(new THREE.SphereGeometry(.13,10,8),brass,.9,1.65,13.3);
  const loader=new THREE.TextureLoader();
  const mediaUrl=name=>new URL(`../../assets/lighthouse/${name}`,import.meta.url).href;
  const island=loader.load(mediaUrl('island.png')),poster=loader.load(mediaUrl('water-poster.png'));
  for(const texture of [island,poster])texture.colorSpace=THREE.SRGBColorSpace;
  const video=document.createElement('video');
  video.src=mediaUrl('water-loop.webm');video.muted=true;video.loop=true;video.playsInline=true;video.preload='metadata';
  const water=new THREE.VideoTexture(video);water.colorSpace=THREE.SRGBColorSpace;
  const waterMaterials=[];
  for(const [a,y,kind] of [[-1.1,6,'island'],[Math.PI,6,'water'],[.8,9,'island']]){
    const at=r=>[Math.sin(a)*r,y,Math.cos(a)*r];
    box(3.3,3.6,.2,dark,...at(13.62),a);
    const material=new THREE.MeshBasicMaterial({map:kind==='water'?poster:island,side:THREE.DoubleSide});
    if(kind==='water')waterMaterials.push(material);
    add(new THREE.PlaneGeometry(2.9,3.15),material,...at(13.48),0,a+Math.PI);
    for(const offset of [-1.55,1.55])box(.14,3.5,.22,brass,Math.sin(a)*13.42+Math.cos(a)*offset,y,Math.cos(a)*13.42-Math.sin(a)*offset,a);
    for(const dy of [-1.7,1.7])box(3.25,.14,.3,oak,Math.sin(a)*13.42,y+dy,Math.cos(a)*13.42,a);
  }
  video.addEventListener('loadeddata',()=>{for(const material of waterMaterials){material.map=water;material.needsUpdate=true;}});
  let playing=false,retryAt=0;
  return {room,platforms,colliders,setChair,exit:{...LIGHTHOUSE_ROOM.exit},
    update(t,dt){
      lamp.intensity=room.visible?90:0;
      for(const slot of chairs)if(room.visible)slot.model.userData.update?.(t,dt);
      if(room.visible&&!playing&&performance.now()>retryAt){
        playing=true;video.play().catch(()=>{playing=false;retryAt=performance.now()+1500;});
      }else if(!room.visible&&playing){video.pause();playing=false;}
    },
    debug:()=>({windowRenders:0,windowMode:'baked',islandLoaded:!!island.image?.complete,
      waterReady:video.readyState>=2,waterPlaying:!video.paused,waterTime:video.currentTime,waterDuration:video.duration,
      stairs:20,chairs:chairs.map(s=>({id:s.id,chair:s.chair}))})};
}
