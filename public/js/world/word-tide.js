import * as THREE from 'three';
import { TIDE, tidePosition } from '../shared/word-tide.js';
import { BLOCKS, CARD_BOXES } from '../shared/catalog.js';
import { buildLuckyBlock, buildCardBox, buildChair, disposeObject } from './cosmetics.js';
import { Label } from './labels.js';
import { mulberry32 } from './math.js';
import { sfx } from '../audio.js';

const COLORS = ['#67e2cb','#ffb897','#a4bcff','#ffe38d','#e9b3ee','#90ddd9','#beea93','#ffb8cb'];
const clamp = v => Math.max(0,Math.min(1,v));
const ease = v => { v=clamp(v);return v*v*(3-2*v); };
const BASE = 3, BH = TIDE.blockHeight;
const mat = color => new THREE.MeshLambertMaterial({color});
function mesh(geometry, material, parent, x=0,y=0,z=0) { const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);m.castShadow=true;m.receiveShadow=true;return m; }
function box(parent,w,h,d,color,x=0,y=0,z=0){return mesh(new THREE.BoxGeometry(w,h,d),mat(color),parent,x,y,z);}
function palm(parent,x,y,z,scale=1,lean=0) {
 const root=new THREE.Group();root.position.set(x,y,z);root.scale.setScalar(scale);root.rotation.z=lean;parent.add(root);
 const trunkMat=mat('#a67444'), leafMat=mat('#2b9360'), leafLight=mat('#69bc69');
 for(let i=0;i<7;i++)mesh(new THREE.CylinderGeometry(.34-i*.022,.41-i*.022,1.3,6),trunkMat,root,Math.sin(i*.13)*.6,i*1.15,0);
 for(let i=0;i<7;i++) {
  const leaf=new THREE.Group();leaf.position.set(.5,7.4,0);leaf.rotation.y=i*Math.PI*2/7;root.add(leaf);
  for(let j=0;j<4;j++){const l=mesh(new THREE.ConeGeometry(.8-j*.1,2.2,3),j%2?leafLight:leafMat,leaf,0,-j*j*.11,j*1.2+.65);l.rotation.x=1.2+j*.17;l.rotation.z=Math.PI;}
 }
 for(let i=0;i<3;i++)mesh(new THREE.IcosahedronGeometry(.38),mat('#916b37'),root,.5+Math.sin(i*2)*.45,7.1,Math.cos(i*2)*.45);
 return root;
}
function letterBlocks(parent) {
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const g=canvas.getContext('2d');
 for(let i=0;i<32;i++){const x=i%8*128,y=Math.floor(i/8)*128;g.fillStyle='#fffdf0';g.fillRect(x,y,128,128);g.fillStyle='#d4e5d8';g.fillRect(x,y+119,128,9);g.strokeStyle='#d4e5d8';g.lineWidth=4;g.strokeRect(x+3,y+3,122,122);if(i<26){g.font='700 91px Fredoka, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#16434a';g.fillText(String.fromCharCode(65+i),x+64,y+66);}}
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 const geometry=new THREE.BoxGeometry(3.5,BH*.97,3.5),glyph=new THREE.InstancedBufferAttribute(new Float32Array(20000),1);geometry.setAttribute('tideGlyph',glyph);
 const material=new THREE.MeshLambertMaterial({map});
 material.onBeforeCompile=shader=>{shader.vertexShader='attribute float tideGlyph;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv=(vMapUv+vec2(mod(tideGlyph,8.0),3.0-floor(tideGlyph/8.0)))/vec2(8.0,4.0);\n#endif');};
 const blocks=new THREE.InstancedMesh(geometry,material,20000);blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);blocks.frustumCulled=false;blocks.count=0;blocks.castShadow=blocks.receiveShadow=true;parent.add(blocks);return {blocks,glyph};
}
function ocean(parent) {
 const m=new THREE.ShaderMaterial({uniforms:{time:{value:0},flash:{value:0}},side:THREE.DoubleSide,
 vertexShader:`uniform float time;varying vec3 wp;varying float crest;void main(){vec3 p=position;p.z+=sin(p.x*.055+time*.8)*.27+sin(p.y*.09-time*.6)*.19;crest=p.z;vec4 w=modelMatrix*vec4(p,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`uniform float time;uniform float flash;varying vec3 wp;varying float crest;void main(){float lines=sin(wp.x*.11+wp.z*.16+sin(wp.z*.07-time)*3.+sin(wp.x*.06+time*.7)*2.+time)*.5+.5;float glint=pow(lines,34.)*.09;float dist=length(wp.xz);vec3 c=mix(vec3(.035,.40,.48),vec3(.10,.65,.62),clamp(1.-dist/240.,0.,1.));c+=glint+crest*.055;c=mix(c,vec3(.65,.9,.9),flash*.18);gl_FragColor=vec4(c,1.);}`});
 const water=new THREE.Mesh(new THREE.PlaneGeometry(1800,1800,130,130),m);water.rotation.x=-Math.PI/2;parent.add(water);return water;
}
function wave(parent) {
 const group=new THREE.Group();parent.add(group);
 const positions=[],indices=[],uv=[],nx=96,ny=40;
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/ny;positions.push((u-.5)*320,Math.sin(v*1.85)*60,-Math.sin(v*Math.PI)*20+Math.pow(v,7)*32);uv.push(u,v);}
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;indices.push(a,a+1,a+nx+1,a+1,a+nx+2,a+nx+1);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
 const material=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{time:{value:0}},vertexShader:'uniform float time;varying vec2 v;void main(){v=uv;vec3 p=position;p.y+=sin(p.x*.07+time*2.)*uv.y*2.7+sin(p.x*.19-time*3.)*uv.y*.7;p.z+=sin(uv.y*8.+time*2.+p.x*.025)*uv.y*3.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',fragmentShader:'uniform float time;varying vec2 v;void main(){float ripples=sin(v.x*250.+sin(v.y*28.-time*3.)*3.)*.5+.5;float veins=pow(ripples,14.)*.22;float streak=pow(.5+.5*sin(v.x*630.+v.y*45.-time*6.),20.);veins+=streak*.12;vec3 c=mix(vec3(.015,.25,.34),vec3(.13,.8,.75),pow(v.y,.65));float foam=smoothstep(.68,.98,v.y+sin(v.x*270.+time*3.)*.055+sin(v.y*80.-time*7.)*.025);c=mix(c+veins,vec3(.9,1.,.96),foam);gl_FragColor=vec4(c,1.);}'});
 mesh(geo,material,group);
 const crest=new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:'#e4fff6',transparent:true,opacity:.88}),90);const dummy=new THREE.Object3D();
 for(let i=0;i<90;i++){dummy.position.set((i/89-.5)*320,51+Math.sin(i*3)*1.2,20);dummy.scale.set(3.8,2+Math.sin(i)*.7,3);dummy.rotation.set(i*.2,i,.2);dummy.updateMatrix();crest.setMatrixAt(i,dummy.matrix);}group.add(crest);
 return {group,material,crest};
}
export function createWordTideScene(scene, labels, terrain, scenery, players) {
 const root=new THREE.Group();root.name='Word Tide';root.visible=false;scene.add(root);
 const arena=new THREE.Group();root.add(arena);
 const water=ocean(root),surge=wave(root);
 const light=new THREE.HemisphereLight('#b9ffec','#555775',1.7);root.add(light);
 const flash=new THREE.DirectionalLight('#dfd9ff',0);flash.position.set(-50,140,-80);root.add(flash);
 const rng=mulberry32(92821);
 const terrainBits=new THREE.Group();arena.add(terrainBits);
 mesh(new THREE.CylinderGeometry(66,70,1.4,48),mat('#b38e65'),terrainBits,0,-1.8,0);
 for(let i=0;i<30;i++){const a=rng()*Math.PI*2,r=10+rng()*57;const m=mesh(new THREE.IcosahedronGeometry(1,0),mat(i%2?'#b08b62':'#8b6b51'),terrainBits,Math.sin(a)*r,-.2,Math.cos(a)*r);m.scale.set(2+rng()*6,1+rng()*3,2+rng()*5);m.rotation.set(rng(),rng()*6,rng());}
 for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const p=palm(terrainBits,Math.sin(a)*56,0,Math.cos(a)*56,.9+rng()*.6,(rng()-.5)*.9);p.rotation.y=a;}
 const floaters=[];
 for(let i=0;i<22;i++) {
  const a=rng()*Math.PI*2,r=37+rng()*65;let o;
  if(i<4)o=buildCardBox(CARD_BOXES[i%CARD_BOXES.length].id);
  else if(i<8)o=buildLuckyBlock(BLOCKS[i%BLOCKS.length].id);
  else if(i<12){o=buildChair(['wooden','wooden','wooden','wooden'][i-8]);o.rotation.z=1.1;}
  else if(i===12){o=new THREE.Group();const tower=new THREE.Group();o.add(tower);tower.rotation.z=1.25;for(let k=0;k<4;k++)mesh(new THREE.CylinderGeometry(3.7-k*.25,4-k*.25,4,20),mat(k%2?'#cb665c':'#ece8d1'),tower,0,k*4,0);mesh(new THREE.ConeGeometry(4.6,2.5,12),mat('#315764'),tower,0,17,0);}
  else if(i===13||i===14){o=new THREE.Group();box(o,13,7,.5,i===13?'#446ab0':'#46754f',0,1,0);box(o,.6,10,.8,'#855d37',-5,-2,0);box(o,.6,5,.8,'#855d37',5,-1,0);for(let k=0;k<4;k++)box(o,9,.3,.1,'#ffe298',0,3-k*1.3,.3);o.rotation.x=-1.15;}
  else {o=new THREE.Group();box(o,4+rng()*5,.6,1.1,i%2?'#b38751':'#765c3b');if(i%3===0)box(o,1,.35,4,'#7dab5a');}
  const group=new THREE.Group();group.add(o);arena.add(group);o.scale.multiplyScalar(i<8?.65:1);
  floaters.push({o:group,x:Math.sin(a)*r,z:Math.cos(a)*r,a,r,spin:rng()*6});
 }
 const platforms=[];
 for(let i=0;i<40;i++){
  const pos=tidePosition(i),g=new THREE.Group();arena.add(g);g.position.set(pos.x,BASE+2*BH,pos.z);
  mesh(new THREE.CylinderGeometry(3,3.35,.6,8),mat('#476863'),g,0,-.3,0);
  mesh(new THREE.CylinderGeometry(3.1,3.1,.15,8),mat(COLORS[i%COLORS.length]),g,0,.02,0);
  for(let j=0;j<5;j++)box(g,4.6,.13,.65,'#e3c695',0,.13,(j-2)*.8);
  for(const x of [-2.4,2.4])for(const z of [-1.9,1.9])mesh(new THREE.CylinderGeometry(.15,.15,.9,6),mat('#a17b43'),g,x,.35,z);
  const rescue=mesh(new THREE.CylinderGeometry(2.1,2.4,1,8),mat('#9aab9c'),arena,pos.x,BASE,pos.z);
  platforms.push({g,rescue,pos});
 }
 const {blocks,glyph}=letterBlocks(arena);
 const clouds=new THREE.Group(),dummy=new THREE.Object3D();root.add(clouds);
 const cloudCanvas=document.createElement('canvas');cloudCanvas.width=cloudCanvas.height=256;const cg=cloudCanvas.getContext('2d');
 for(let i=0;i<12;i++){const x=45+rng()*160,y=85+rng()*80,r=32+rng()*42;const gradient=cg.createRadialGradient(x-8,y-12,3,x,y,r);gradient.addColorStop(0,'rgba(229,241,247,.95)');gradient.addColorStop(.58,'rgba(181,199,211,.87)');gradient.addColorStop(1,'rgba(146,170,190,0)');cg.fillStyle=gradient;cg.fillRect(0,0,256,256);}
 const cloudMap=new THREE.CanvasTexture(cloudCanvas);
 for(let i=0;i<42;i++){const a=i/42*Math.PI*2;const c=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudMap,color:i%2?'#6b7e94':'#a3b4c2',transparent:true,opacity:.85,depthWrite:false}));c.position.set(Math.sin(a)*(145+rng()*95),65+rng()*20,Math.cos(a)*(145+rng()*95));c.scale.set(100+rng()*70,65+rng()*40,1);clouds.add(c);}
 const rainGeo=new THREE.BufferGeometry(),rainArray=new Float32Array(700*6);
 for(let i=0;i<700;i++){const x=(rng()-.5)*180,y=rng()*90,z=(rng()-.5)*180;rainArray.set([x,y,z,x+.35,y-2.7,z],i*6);}rainGeo.setAttribute('position',new THREE.BufferAttribute(rainArray,3));
 const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:'#beeae8',transparent:true,opacity:.32,depthWrite:false}));root.add(rain);
 const lightningGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-90,130,-110),new THREE.Vector3(-85,108,-112),new THREE.Vector3(-91,109,-110),new THREE.Vector3(-80,85,-108),new THREE.Vector3(-84,87,-108),new THREE.Vector3(-76,60,-107)]);
 const lightning=new THREE.Line(lightningGeo,new THREE.LineBasicMaterial({color:'#efe5ff'}));root.add(lightning);
 const spray = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0), new THREE.MeshBasicMaterial({color:'#d8fff3',transparent:true,opacity:.8,depthWrite:false}), 140);
 spray.frustumCulled=false;root.add(spray);
 const drops=Array.from({length:140},()=>({x:(rng()-.5)*160,z:(rng()-.5)*100,vy:15+rng()*20,vx:(rng()-.5)*20,scale:.4+rng()*1.6}));
 const towerLabels=new Map();const savedVisibility=new Map(),savedMaterials=new Map();
 const sweepPlane=new THREE.Plane(new THREE.Vector3(0,0,1),230);
 function prepareSweep(){for(const obj of scenery){savedVisibility.set(obj,obj.visible);obj.traverse(node=>{if(!node.isMesh||!node.material)return;savedMaterials.set(node,node.material);const clone=m=>{const c=m.clone();c.clippingPlanes=[sweepPlane];c.clipShadows=true;return c;};node.material=Array.isArray(node.material)?node.material.map(clone):clone(node.material);});}}

 let orbitYaw=0,orbitPitch=.28,orbitDistance=30,followHeight=null;
 let match=null,received=0,on=false,ruptured=false,currentWater=0,localId=null,lastPop=-1,lastAudio='',quality='high';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const matrix=new THREE.Object3D(),color=new THREE.Color(),look=new THREE.Vector3(),camPos=new THREE.Vector3(),normalPos=new THREE.Vector3(),normalQ=new THREE.Quaternion(),playPos=new THREE.Vector3(),playLook=new THREE.Vector3();
 function restore(){
  for(const [obj,visible] of savedVisibility)obj.visible=visible;savedVisibility.clear();
  for(const [node,material] of savedMaterials){for(const m of Array.isArray(node.material)?node.material:[node.material])m.dispose();node.material=material;}savedMaterials.clear();
  for(const e of players.values()){e.tidePose=null;e.avatar.root.visible=true;e.avatar.setSeated(e.seat>=0);if(e.pet)e.pet.object.visible=true;}
  for(const label of towerLabels.values())label.destroy();towerLabels.clear();
  terrain.setTide(false,false);root.visible=false;ruptured=false;blocks.count=0;flash.intensity=0;
 }
 function set(m,id){
  localId=id;
  if (m && m === match) return;
  if(!m?.tide){if(on)restore();on=false;match=null;return;}
  if(match?.matchId!==m.matchId){if(on)restore();lastAudio='';lastPop=-1;followHeight=null;orbitYaw=0;orbitPitch=.28;prepareSweep();}
  on=true;root.visible=true;match=m;received=performance.now();
  for(const tower of Object.values(m.tide.towers))if(!towerLabels.has(tower.id)){
   const plat=platforms[tower.seat];plat.pos=tidePosition(tower.seat,Object.keys(m.tide.towers).length);plat.g.position.x=plat.rescue.position.x=plat.pos.x;plat.g.position.z=plat.rescue.position.z=plat.pos.z;
   if(plat.chair){plat.g.remove(plat.chair);disposeObject(plat.chair);}plat.chair=buildChair(players.get(tower.id)?.data.chair||'wooden');plat.chair.position.y=.23;plat.chair.rotation.y=plat.pos.yaw;plat.g.add(plat.chair);
   const label=new Label(labels,'tide-label',{minScale:.6,maxScale:1,scaleRef:42,maxDist:700});
   const small=document.createElement('span'),strong=document.createElement('strong'),sub=document.createElement('small');label.el.append(small,strong,sub);towerLabels.set(tower.id,label);
  }
 }
 function update(time,dt,now){
  if(!on)return;
  const m=match,t=m.tide,elapsed=(m.phaseDuration-m.phaseEndsIn+now-received)/1000,intro=m.phase==='tideIntro',outro=m.phase==='ended',it=intro?elapsed:24;
  const front=intro?-230+clamp((it-5)/10)*460:outro?230-ease((elapsed-8)/7)*460:230;
  const destroyed=intro?front>-65:!outro||elapsed<14.7;
  ruptured=destroyed;sweepPlane.constant=-front;
  for(const [obj,visible] of savedVisibility)obj.visible=visible;
  terrain.setTide(true,front>180,front, outro?1-ease((elapsed-6)/9):1);
  arena.visible=intro?front>-75:elapsed<15.5||!outro;
  const retreat=outro?ease((elapsed-4)/11):0;
  terrainBits.position.y=outro?-ease((elapsed-8)/7)*18:0;
  // Environment follows the server's phase clock, including reconnects.
  clouds.visible=true;clouds.position.y=Math.max(0,(t.water*BH-35))+retreat*170;clouds.rotation.y=time*.003;
  let flashValue=!reduced.matches && ((time%13>.1 && time%13<.23)||(time%13>.38&&time%13<.47)) ? 1 : 0;
  lightning.visible=flashValue>0;lightning.position.y=clouds.position.y;flash.intensity=flashValue*2.5;
  currentWater=intro ? (it<11? -3-ease(it/5)*3 : -6+(BASE+6)*ease((it-11)/10)) : BASE + BH*(m.phase==='tideFlood'?t.fromWater+(t.water-t.fromWater)*ease((elapsed-1)/2):t.water);
  if(outro)currentWater=BASE+t.water*BH-(BASE+t.water*BH+6)*retreat;
  water.visible=true;water.position.y=currentWater;water.material.uniforms.time.value=time;water.material.uniforms.flash.value=flashValue;
  rain.visible=destroyed&&retreat<.6;rain.position.y=currentWater+15-(time*22%40);rain.geometry.setDrawRange(0,quality==='low'?300:1400);
  for(const f of floaters){const drift=1+retreat*5;f.o.scale.setScalar(1-retreat*.95);f.o.position.set(f.x*drift+Math.sin(time*.07+f.spin)*2,currentWater+Math.sin(time*1.5+f.spin)*.35,f.z*drift+Math.cos(time*.09+f.spin)*2);f.o.rotation.set(Math.sin(time+f.spin)*.12,time*.025+f.spin,Math.cos(time*.8+f.spin)*.1);}
  surge.material.uniforms.time.value=time;
  for(let i=0;i<90;i++){dummy.position.set((i/89-.5)*320,57+Math.sin(i*1.9+time*3)*1.2,32+Math.cos(i+time*2)*2);dummy.scale.set(4.2,2.4+Math.sin(i+time*5)*.7,3.5);dummy.rotation.set(time+i,i,time*.5);dummy.updateMatrix();surge.crest.setMatrixAt(i,dummy.matrix);}surge.crest.instanceMatrix.needsUpdate=true;

  surge.group.visible=intro&&it>1&&it<17 || m.phase==='tideFlood' || outro&&elapsed>6&&elapsed<15;
  if(intro){surge.group.position.set(0,-5,front);surge.group.scale.set(1,Math.max(.01,ease((it-1)/4)),1);surge.group.rotation.y=0;}
  else if(outro){surge.group.rotation.y=Math.PI;surge.group.scale.set(1,.22,1);surge.group.position.set(0,currentWater-2,front);}
  else {const a=(t.seed%7+m.round)*1.7;surge.group.rotation.y=a;surge.group.scale.set(.6,.09,.3);const distance=125-ease(elapsed/3)*230;surge.group.position.set(-Math.sin(a)*distance,currentWater-1,-Math.cos(a)*distance);}
  const splashTime=intro?it-10.8:m.phase==='tideFlood'?elapsed-1.6:-1;
  spray.visible=splashTime>=0&&splashTime<2.2;
  if(spray.visible){spray.material.opacity=(1-splashTime/2.2)*.8;for(let i=0;i<drops.length;i++){const d=drops[i];dummy.position.set(d.x+d.vx*splashTime,currentWater+Math.max(0,d.vy*splashTime-12*splashTime*splashTime),d.z+splashTime*12);dummy.scale.setScalar(d.scale);dummy.rotation.set(i,0,0);dummy.updateMatrix();spray.setMatrixAt(i,dummy.matrix);}spray.instanceMatrix.needsUpdate=true;}
  const audio=intro?(it<4?'omen':it<10.8?'wave':it<14?'impact':'settle'):'';
  if(audio&&audio!==lastAudio){lastAudio=audio;if(audio==='omen')sfx.omen();if(audio==='wave')sfx.tideWave();if(audio==='impact')sfx.impact();}
  const reveal=m.phase==='tideReveal'?clamp(elapsed/(TIDE.reveal/1000)):1;let count=0,localShown=0;
  for(let seat=0;seat<platforms.length;seat++){platforms[seat].g.visible=false;platforms[seat].rescue.visible=false;}
  for(const tower of Object.values(t.towers)){
   const part=m.participants.find(p=>p.id===tower.id),platform=platforms[tower.seat];if(!platform)continue;
   let height=tower.height;
   if(m.phase==='tideReveal'){const step=reveal*tower.added,index=Math.min(tower.added,Math.floor(step)+1),fraction=step-Math.floor(step);height=tower.before+index+(index<tower.added?Math.sin(fraction*Math.PI)*.20:0);}
   if(m.phase==='tideResolve'&&tower.rescued)height=tower.before+(tower.height-tower.before)*ease(elapsed/2.2);
   const rise=intro?ease((it-15)/4):1;
   if(outro)height=2+(height-2)*(1-ease((elapsed-5)/9));
   const topY=BASE+height*BH;platform.g.position.y=-3+(topY+3)*rise;
   const alive=part?.alive;
   const collapse=!alive&&!t.winners.includes(tower.id)?m.phase==='tideResolve'?ease(elapsed/2.2):1:0;
   platform.g.position.y-=collapse*8;platform.g.rotation.z=collapse*.7;
   platform.g.visible=rise>0 && collapse<1;
   const earnedHeight=tower.earned, rescueUnits=tower.height-earnedHeight;
   platform.rescue.visible=platform.g.visible;
   platform.rescue.scale.set(1,Math.max(.1,rescueUnits*BH),1);platform.rescue.position.y=BASE+rescueUnits*BH/2;
   for(const seg of tower.segments){
    for(let j=0;j<seg.letters.length;j++){
     const isNew=seg.round===m.round&&m.phase==='tideReveal';
     const p=isNew?clamp((reveal*seg.letters.length-j)*3):1;
     if(p<=0||count>=20000||collapse>=1||outro&&BASE+(seg.base+j+1)*BH>platform.g.position.y)continue;
     const pop=reduced.matches?1:1+Math.sin(p*Math.PI)*.12;
     const scale=p<.5?p*2:pop;
     matrix.position.set(platform.pos.x,BASE+(seg.base+j+.5)*BH-.66-collapse*8,platform.pos.z);
     // Completed letters occupy fixed levels. New letters pop from the bottom upward.
     matrix.scale.set(scale,Math.min(1,scale),scale);matrix.rotation.set(0,0,(1-p)*.12);matrix.updateMatrix();blocks.setMatrixAt(count,matrix.matrix);
     color.set(COLORS[tower.seat%COLORS.length]);blocks.setColorAt(count,color);glyph.array[count]=seg.letters.charCodeAt(j)-65;count++;
     if(isNew&&tower.id===localId)localShown++;
    }
   }
   const e=players.get(tower.id);
   if(e){if(outro&&elapsed<5&&t.winners.includes(tower.id))e.avatar.cheer(.2);e.tidePose=destroyed?{x:platform.pos.x,y:platform.g.position.y+.25+(outro&&t.winners.includes(tower.id)&&elapsed<5?Math.abs(Math.sin(elapsed*6))*2:0),z:platform.pos.z,yaw:platform.pos.yaw,celebrate:outro&&t.winners.includes(tower.id)&&elapsed<5,visible:rise>.01&&collapse<1}:null;if(outro&&elapsed>12&&e.tidePose){const k=ease((elapsed-12)/2.7);e.tidePose.x+=(e.pos.x-e.tidePose.x)*k;e.tidePose.y+=(e.pos.y-e.tidePose.y)*k;e.tidePose.z+=(e.pos.z-e.tidePose.z)*k;}e.avatar.root.visible=!destroyed||rise>.01&&collapse<1;}
   const label=towerLabels.get(tower.id);label.visible=destroyed&&rise>.9&&collapse<1&&!outro;
   label.anchor.set(platform.pos.x,platform.g.position.y+7.2,platform.pos.z);
   const showAnswer=!!tower.answer&&m.phase!=='tideAnswer';
   const [name,answer,sub]=label.el.children;
   name.textContent=(players.get(tower.id)?.data.name||'Player')+(tower.id===localId?' · YOU':'');
   answer.textContent=showAnswer?tower.answer.toUpperCase():`${tower.earned} LETTERS`;
   sub.textContent=tower.longest&&showAnswer?'✦ LONGEST ANSWER':`${'♥'.repeat(part?.hearts||0)}${tower.rescued?' · RESCUED':''}`;
   label.el.classList.toggle('longest',tower.longest&&showAnswer);
  }
  blocks.count=count;blocks.instanceMatrix.needsUpdate=true;if(blocks.instanceColor)blocks.instanceColor.needsUpdate=true;glyph.needsUpdate=true;
  if(m.phase==='tideReveal'&&localShown!==lastPop){if(localShown>lastPop)sfx.tidePop(localShown);lastPop=localShown;}else if(m.phase!=='tideReveal')lastPop=-1;
  for(const [id,e]of players){if(!t.towers[id]&&destroyed){e.avatar.root.visible=false;if(e.pet)e.pet.object.visible=false;}if(e.pet&&destroyed)e.pet.object.visible=false;}
 }
 function camera(cam,now){
  if(!on)return;
  const m=match,elapsed=(m.phaseDuration-m.phaseEndsIn+now-received)/1000,intro=m.phase==='tideIntro';
  const tower=m.tide.towers[localId]&&m.participants.find(p=>p.id===localId)?.alive?m.tide.towers[localId]:Object.values(m.tide.towers).find(t=>m.participants.find(p=>p.id===t.id)?.alive)||Object.values(m.tide.towers)[0];
  const angle=(tower?platforms[tower.seat].pos.yaw-Math.PI:0)+orbitYaw;
  const targetHeight=tower?platforms[tower.seat].g.position.y:currentWater;followHeight=followHeight===null?targetHeight:followHeight+(targetHeight-followHeight)*.16;const localHeight=followHeight;
  const narrow=cam.aspect<.85;
  const pos=tower?platforms[tower.seat].pos:{x:0,z:0};
  const radius=orbitDistance*(narrow?1.2:1);
  look.set(pos.x,localHeight+3,pos.z);
  camPos.set(pos.x+Math.sin(angle)*radius*Math.cos(orbitPitch),Math.max(currentWater+4,look.y+radius*Math.sin(orbitPitch)),pos.z+Math.cos(angle)*radius*Math.cos(orbitPitch));
  if(m.phase==='ended'){
   const winner=m.tide.winners[Math.floor(elapsed/2.5)%Math.max(1,m.tide.winners.length)],wp=m.tide.towers[winner],p=wp&&platforms[wp.seat];
   if(p&&elapsed<5){const y=p.g.position.y+5.1+Math.abs(Math.sin(elapsed*6))*2;look.set(p.pos.x,y,p.pos.z);camPos.set(p.pos.x+Math.sin(p.pos.yaw)*9,y+1,p.pos.z+Math.cos(p.pos.yaw)*9);}
   else {const k=ease((elapsed-5)/10),a=.7+k*1.8;camPos.set(Math.sin(a)*100,55+(currentWater>30?currentWater*.6:0),Math.cos(a)*100);look.set(0,currentWater,0);}
  }

  normalPos.copy(cam.position);normalQ.copy(cam.quaternion);playPos.copy(camPos);playLook.copy(look);
  if(intro&&elapsed<24){
   if(elapsed<8){const k=ease(elapsed/8);camPos.set(60-k*35,28+k*12,75-k*55);look.set(0,10+k*17,-35-k*100);}
   else if(elapsed<15){camPos.set(24,32,56);look.set(0,20,-30);}
   else{const k=ease((elapsed-15)/6),a=.8+k*.9;camPos.set(Math.sin(a)*95,58,Math.cos(a)*95);look.set(0,1,0);}
  }
  if(intro&&elapsed>19){const blend=ease((elapsed-19)/5);camPos.lerp(playPos,blend);look.lerp(playLook,blend);}
  cam.position.copy(camPos);cam.lookAt(look);
  if(m.phase==='ended'&&elapsed>14){const blend=ease((elapsed-14)/2);cam.position.lerp(normalPos,blend);cam.quaternion.slerp(normalQ,blend);}
  if(!reduced.matches){const impact=intro?Math.max(0,1-Math.abs(elapsed-11)/1.2):m.phase==='tideFlood'?Math.max(0,1-Math.abs(elapsed-2)/.7)*.18:0;cam.position.x+=Math.sin(now*.12)*impact*1.3;cam.position.y+=Math.cos(now*.16)*impact*.8;}
 }
 return {orbit:(x,y,z)=>{if(on){orbitYaw-=x*.006;orbitPitch=Math.max(-.08,Math.min(1.1,orbitPitch+y*.004));orbitDistance=Math.max(13,Math.min(80,orbitDistance+z*.035));}},set,update,camera,active:()=>on,setQuality:level=>quality=level,debug:()=>({active:on,ruptured,water:currentWater,blocks:blocks.count,platforms:platforms.filter(p=>p.g.visible).map(p=>p.g.position.toArray()),blockClearance:.66,cinematic:match?.phase==='tideIntro',orbitYaw,chairs:platforms.filter(p=>p.chair&&p.g.visible).length,ending:match?.phase==='ended'})};
}
