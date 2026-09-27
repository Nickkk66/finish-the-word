// The keeper's room. Window textures are actual exterior cameras, rendered one at a time.
import * as THREE from 'three';
import { woodTexture, stoneTexture } from './textures.js';
import { LIGHTHOUSE } from './layout.js';

export const LIGHTHOUSE_ROOM = Object.freeze({
  center: { x: 300, z: 0 }, spawn: { x: 300, y: 0, z: 4, ry: Math.PI },
  exit: { x: 300, y: 2.3, z: 9.1 }, radius: 10.1,
});
export function createLighthouseInterior(scene) {
  const room = new THREE.Group(); room.position.x=300; room.visible=false; scene.add(room);
  const platforms=[{x:300,y:-.2,z:0,w:23,h:.4,d:23,dx:0,dz:0}];
  const oak=new THREE.MeshLambertMaterial({map:woodTexture('#946c45')}), dark=new THREE.MeshLambertMaterial({map:woodTexture('#40302b')});
  const masonry=stoneTexture().clone();masonry.repeat.set(10,4);masonry.needsUpdate=true;
  const brass=new THREE.MeshLambertMaterial({color:'#d9b875'}), plaster=new THREE.MeshLambertMaterial({map:masonry,color:'#ded5be',side:THREE.BackSide});
  const teal=new THREE.MeshLambertMaterial({color:'#29595d'});
  function add(g,m,x,y,z,rx=0,ry=0,rz=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);o.castShadow=o.receiveShadow=true;room.add(o);return o;}
  const box=(w,h,d,m,x,y,z,ry=0)=>add(new THREE.BoxGeometry(w,h,d),m,x,y,z,0,ry);
  add(new THREE.CylinderGeometry(11.7,11.7,.4,48),dark,0,-.21,0);
  // Individually laid planks, clipped to the circular wall.
  for(let z=-11;z<=11;z+=.65){const width=2*Math.sqrt(11.5**2-z*z);box(width,.06,.62,oak,0,-.025,z);}
  add(new THREE.CylinderGeometry(11.7,11.7,14,48,1,true),plaster,0,7,0);
  add(new THREE.CylinderGeometry(11.8,11.8,.3,48),dark,0,14,0);
  for(const y of [.3,3.5,12.8])add(new THREE.TorusGeometry(11.45,.13,6,48),oak,0,y,0,Math.PI/2);
  for(let i=0;i<24;i++){const a=i*Math.PI/12;box(.14,3.3,.18,oak,Math.sin(a)*11.4,1.7,Math.cos(a)*11.4,a);}
  // Navigation table: rim, inset chart, pedestal, crossed feet and brass compass.
  add(new THREE.CylinderGeometry(3,3,.28,40),dark,-1,2.9,-1.5);
  add(new THREE.CylinderGeometry(2.83,2.83,.035,40),teal,-1,3.06,-1.5);
  add(new THREE.CylinderGeometry(.65,.95,2.6,16),oak,-1,1.45,-1.5);
  for(const a of [0,Math.PI/2])box(4,.23,.65,dark,-1,.18,-1.5,a);
  const chart=document.createElement('canvas');chart.width=512;chart.height=320;const ink=chart.getContext('2d');
  ink.fillStyle='#d8c798';ink.fillRect(0,0,512,320);ink.strokeStyle='#7f957e';ink.lineWidth=2;
  for(let i=0;i<8;i++){ink.beginPath();for(let x=0;x<512;x+=5){const y=35+i*35+Math.sin(x*.018+i)*11;x?ink.lineTo(x,y):ink.moveTo(x,y);}ink.stroke();}
  ink.fillStyle='#547868';ink.beginPath();ink.ellipse(265,160,88,63,-.4,0,Math.PI*2);ink.fill();ink.fillStyle='#53482e';ink.font='22px serif';ink.fillText('KEEPER’S CHART',24,30);ink.fillText('N ↑',435,55);
  const chartTex=new THREE.CanvasTexture(chart);chartTex.colorSpace=THREE.SRGBColorSpace;
  add(new THREE.PlaneGeometry(3,1.9),new THREE.MeshLambertMaterial({map:chartTex}),-1,3.09,-1.5,-Math.PI/2,0,.12);
  add(new THREE.TorusGeometry(.4,.045,8,24),brass,.7,3.12,-2.7,Math.PI/2);
  for(const [x,z,a] of [[-4,-1.5,Math.PI/2],[2,-1.5,-Math.PI/2],[-1,-4.6,0]]){
    box(1.7,.22,1.65,dark,x,1.8,z,a);box(1.55,.12,1.5,teal,x,1.97,z,a);
    for(const dx of [-.6,.6])for(const dz of [-.55,.55])box(.16,1.7,.16,oak,x+dx,.9,z+dz);
    box(1.7,1.4,.17,oak,x-Math.sin(a)*.75,2.6,z-Math.cos(a)*.75,a);
  }
  // Solid stair risers support every tread. The 30cm rise is within the motor's step limit.
  for(let i=0;i<20;i++){
    const top=(i+1)*.3,z=6-i*.6;
    box(2.4,top,.6,dark,7,top/2,z);box(2.5,.07,.63,oak,7,top+.035,z);
    platforms.push({x:307,y:top/2,z,w:2.4,h:top,d:.6,dx:0,dz:0,kind:'stairs'});
    for(const x of [5.85,8.15])if(i%2===0){box(.1,1.25,.1,brass,x,top+.65,z);}
  }
  // Continuous sloping rails, landing and a telescope looking toward the island.
  for(const x of [5.85,8.15])add(new THREE.BoxGeometry(.14,13.45,.14),brass,x,4.5,.3,-Math.atan2(11.4,5.7));
  box(3,.3,2.4,oak,6.7,5.85,-6.6);platforms.push({x:306.7,y:5.85,z:-6.6,w:3,h:.3,d:2.4,dx:0,dz:0,kind:'landing'});
  for(const x of [5.25,8.15])box(.2,5.8,.2,dark,x,2.9,-7.6);
  box(3,1.1,.14,teal,6.7,6.55,-7.75);
  for(const dx of [-.45,.45])add(new THREE.CylinderGeometry(.06,.09,1.7,8),brass,6.6+dx,6.85,-6.8,0,0,dx*.65);
  add(new THREE.CylinderGeometry(.2,.3,1.8,16),brass,6.6,7.7,-6.8,Math.PI/2,0,.25);
  // A wall cabinet with books and navigation instruments.
  box(3.3,3.2,.65,dark,-7,1.7,-5.5,-.6);
  for(let i=0;i<8;i++)box(.22,1.1,.35,i%2?teal:brass,-8+i*.25,2.2,-5.1);
  for(const y of [.8,1.55,2.85])box(3.2,.12,.85,oak,-7,y,-5.5,-.6);
  // Hanging lantern. No new light count changes when entering/leaving the room.
  box(.07,3,.07,brass,0,12.4,0);
  add(new THREE.CylinderGeometry(.55,.65,1.1,12),new THREE.MeshBasicMaterial({color:'#ffe3a6'}),0,10.5,0);
  for(const y of [9.9,11.1])add(new THREE.CylinderGeometry(.75,.75,.12,12),brass,0,y,0);
  const lamp=new THREE.PointLight('#ffdfa4',90,29,1.4);lamp.position.set(300,10,0);scene.add(lamp);
  // Door trim and inset panels.
  box(2.5,3.6,.2,dark,0,1.8,11.1);
  for(const y of [1,2.5])box(1.8,1.1,.1,teal,0,y,10.94);
  for(const x of [-1.4,1.4])box(.2,3.9,.3,brass,x,1.95,10.92);
  box(3,.18,.3,brass,0,3.9,10.92);add(new THREE.SphereGeometry(.13,10,8),brass,.9,1.65,10.8);
  const windows=[];
  for(const [a,y] of [[-1.1,6],[Math.PI,6],[.8,9]]){
    const target=new THREE.WebGLRenderTarget(384,384,{depthBuffer:true});target.texture.colorSpace=THREE.SRGBColorSpace;
    const cam=new THREE.PerspectiveCamera(65,1,.2,700);
    const at=(r)=>[Math.sin(a)*r,y,Math.cos(a)*r];
    box(3.3,3.6,.2,dark,...at(11.22),a);
    // Front faces point into the room; side panels are not opaque fake glass.
    add(new THREE.PlaneGeometry(2.9,3.15),new THREE.MeshBasicMaterial({map:target.texture,side:THREE.DoubleSide}),...at(11.08),0,a);
    for(const offset of [-1.55,1.55])box(.14,3.5,.22,brass,Math.sin(a)*11.02+Math.cos(a)*offset,y,Math.cos(a)*11.02-Math.sin(a)*offset,a);
    for(const dy of [-1.7,1.7])box(3.25,.14,.3,oak,Math.sin(a)*11.02,y+dy,Math.cos(a)*11.02,a);
    windows.push({a,y,target,cam});
  }
  let last=-Infinity,index=0,renders=0;
  const frustum=new THREE.Frustum(),viewMatrix=new THREE.Matrix4();
  return {room,platforms,exit:{...LIGHTHOUSE_ROOM.exit},
    updateWindows(renderer,terrain,camera,now){
      lamp.intensity=room.visible?90:0;
      if(!room.visible||now-last<200)return;last=now;
      frustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      let w;
      for(let i=0;i<windows.length;i++){
        const candidate=windows[index++%windows.length];
        if(frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(300+Math.sin(candidate.a)*11.08,candidate.y,Math.cos(candidate.a)*11.08),2.5))){w=candidate;break;}
      }
      if(!w)return;
      // Match room bearings to actual lighthouse bearings, with modest viewer parallax.
      const a=w.a+Math.atan2(-LIGHTHOUSE.x,-LIGHTHOUSE.z);
      w.cam.position.set(LIGHTHOUSE.x+Math.sin(a)*6.5+(camera.position.x-300)*.12,w.y+1,LIGHTHOUSE.z+Math.cos(a)*6.5+camera.position.z*.12);
      w.cam.lookAt(w.cam.position.x+Math.sin(a)*60,Math.max(0,w.y-3),w.cam.position.z+Math.cos(a)*60);
      const target=renderer.getRenderTarget(),shadow=renderer.shadowMap.autoUpdate;
      const xr=renderer.xr.enabled;
      try{room.visible=false;renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;terrain.setSkyFocus(w.cam.position);scene.updateMatrixWorld();w.cam.updateMatrixWorld();renderer.setRenderTarget(w.target);renderer.render(scene,w.cam);renders++;}
      finally{room.visible=true;renderer.setRenderTarget(target);renderer.shadowMap.autoUpdate=shadow;renderer.xr.enabled=xr;terrain.setSkyFocus(camera.position);scene.updateMatrixWorld();}
    },debug:()=>({windowRenders:renders,stairs:20})};
}
