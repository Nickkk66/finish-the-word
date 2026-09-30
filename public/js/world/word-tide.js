import * as THREE from 'three';
import { TIDE, tidePosition } from '../shared/word-tide.js';
import { BLOCKS, CARD_BOXES } from '../shared/catalog.js';
import { buildLuckyBlock, buildCardBox } from './cosmetics.js';
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
 const geometry=new THREE.BoxGeometry(3.5,BH*.97,3.5),glyph=new THREE.InstancedBufferAttribute(new Float32Array(4096),1);geometry.setAttribute('tideGlyph',glyph);
 const material=new THREE.MeshLambertMaterial({map});
 material.onBeforeCompile=shader=>{shader.vertexShader='attribute float tideGlyph;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv=(vMapUv+vec2(mod(tideGlyph,8.0),3.0-floor(tideGlyph/8.0)))/vec2(8.0,4.0);\n#endif');};
 const blocks=new THREE.InstancedMesh(geometry,material,4096);blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);blocks.frustumCulled=false;blocks.count=0;blocks.castShadow=blocks.receiveShadow=true;parent.add(blocks);return {blocks,glyph};
}
function ocean(parent) {
 const m=new THREE.ShaderMaterial({uniforms:{time:{value:0},flash:{value:0}},side:THREE.DoubleSide,
 vertexShader:`uniform float time;varying vec3 wp;varying float crest;void main(){vec3 p=position;p.z+=sin(p.x*.055+time*.8)*.27+sin(p.y*.09-time*.6)*.19;crest=p.z;vec4 w=modelMatrix*vec4(p,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`uniform float time;uniform float flash;varying vec3 wp;varying float crest;void main(){float lines=sin(wp.x*.11+wp.z*.16+sin(wp.z*.07-time)*3.+sin(wp.x*.06+time*.7)*2.+time)*.5+.5;float glint=pow(lines,34.)*.09;float dist=length(wp.xz);vec3 c=mix(vec3(.035,.40,.48),vec3(.10,.65,.62),clamp(1.-dist/240.,0.,1.));c+=glint+crest*.055;c=mix(c,vec3(.65,.9,.9),flash*.18);gl_FragColor=vec4(c,1.);}`});
 const water=new THREE.Mesh(new THREE.PlaneGeometry(1800,1800,130,130),m);water.rotation.x=-Math.PI/2;parent.add(water);return water;
}
function wave(parent) {
 const group=new THREE.Group();parent.add(group);
 const positions=[],indices=[],uv=[],nx=64,ny=22;
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/ny;positions.push((u-.5)*320,Math.sin(v*Math.PI*.56)*52,-Math.sin(v*Math.PI*.93)*18+v*v*24);uv.push(u,v);}
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;indices.push(a,a+1,a+nx+1,a+1,a+nx+2,a+nx+1);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
 const material=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{time:{value:0}},vertexShader:'uniform float time;varying vec2 v;void main(){v=uv;vec3 p=position;p.y+=sin(p.x*.07+time*2.)*uv.y*1.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',fragmentShader:'uniform float time;varying vec2 v;void main(){float veins=pow(.5+.5*sin(v.x*150.+sin(v.y*22.-time*2.)*2.),10.)*.17;vec3 c=mix(vec3(.015,.25,.34),vec3(.13,.8,.75),pow(v.y,.65));float foam=smoothstep(.80,.98,v.y+sin(v.x*270.+time)*.024);c=mix(c+veins,vec3(.9,1.,.96),foam);gl_FragColor=vec4(c,1.);}'});
 mesh(geo,material,group);
 const crest=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),mat('#e4fff6'),90);const dummy=new THREE.Object3D();
 for(let i=0;i<90;i++){dummy.position.set((i/89-.5)*320,51+Math.sin(i*3)*1.2,20);dummy.scale.set(3.8,2+Math.sin(i)*.7,3);dummy.rotation.set(i*.2,i,.2);dummy.updateMatrix();crest.setMatrixAt(i,dummy.matrix);}group.add(crest);
 return {group,material};
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
  else {o=new THREE.Group();box(o,4+rng()*5,.6,1.1,i%2?'#b38751':'#765c3b');if(i%3===0)box(o,1,.35,4,'#7dab5a');}
  const group=new THREE.Group();group.add(o);arena.add(group);o.scale.multiplyScalar(i<8?.65:1);
  floaters.push({o:group,x:Math.sin(a)*r,z:Math.cos(a)*r,a,r,spin:rng()*6});
 }
 const platforms=[];
 for(let i=0;i<8;i++){
  const pos=tidePosition(i),g=new THREE.Group();arena.add(g);g.position.set(pos.x,BASE+2*BH,pos.z);
  mesh(new THREE.CylinderGeometry(3,3.35,.6,8),mat('#476863'),g,0,-.3,0);
  mesh(new THREE.CylinderGeometry(3.1,3.1,.15,8),mat(COLORS[i]),g,0,.02,0);
  for(let j=0;j<5;j++)box(g,4.6,.13,.65,'#e3c695',0,.13,(j-2)*.8);
  for(const x of [-2.4,2.4])for(const z of [-1.9,1.9])mesh(new THREE.CylinderGeometry(.15,.15,.9,6),mat('#a17b43'),g,x,.35,z);
  const rescue=mesh(new THREE.CylinderGeometry(2.1,2.4,1,8),mat('#9aab9c'),arena,pos.x,BASE,pos.z);
  platforms.push({g,rescue,pos});
 }
 const {blocks,glyph}=letterBlocks(arena);
 const clouds=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),mat('#335b70'),60),dummy=new THREE.Object3D();
 for(let i=0;i<60;i++){const a=i/60*Math.PI*2;dummy.position.set(Math.sin(a)*(150+rng()*110),65+rng()*30,Math.cos(a)*(150+rng()*110));dummy.scale.set(25+rng()*25,8+rng()*10,20+rng()*30);dummy.updateMatrix();clouds.setMatrixAt(i,dummy.matrix);}root.add(clouds);
 const rainGeo=new THREE.BufferGeometry(),rainArray=new Float32Array(700*6);
 for(let i=0;i<700;i++){const x=(rng()-.5)*180,y=rng()*90,z=(rng()-.5)*180;rainArray.set([x,y,z,x+.35,y-2.7,z],i*6);}rainGeo.setAttribute('position',new THREE.BufferAttribute(rainArray,3));
 const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:'#beeae8',transparent:true,opacity:.32,depthWrite:false}));root.add(rain);
 const lightningGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-90,130,-110),new THREE.Vector3(-85,108,-112),new THREE.Vector3(-91,109,-110),new THREE.Vector3(-80,85,-108),new THREE.Vector3(-84,87,-108),new THREE.Vector3(-76,60,-107)]);
 const lightning=new THREE.Line(lightningGeo,new THREE.LineBasicMaterial({color:'#efe5ff'}));root.add(lightning);
 const spray = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0), new THREE.MeshBasicMaterial({color:'#d8fff3',transparent:true,opacity:.8,depthWrite:false}), 140);
 spray.frustumCulled=false;root.add(spray);
 const drops=Array.from({length:140},()=>({x:(rng()-.5)*160,z:(rng()-.5)*100,vy:15+rng()*20,vx:(rng()-.5)*20,scale:.4+rng()*1.6}));
 const towerLabels=new Map();const savedVisibility=new Map();
 let match=null,received=0,on=false,ruptured=false,currentWater=0,localId=null,lastPop=-1,lastAudio='',quality='high';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const matrix=new THREE.Object3D(),color=new THREE.Color(),look=new THREE.Vector3(),camPos=new THREE.Vector3();
 function restore(){
  for(const [obj,visible] of savedVisibility)obj.visible=visible;savedVisibility.clear();
  for(const e of players.values()){e.tidePose=null;e.avatar.root.visible=true;e.avatar.setSeated(e.seat>=0);if(e.pet)e.pet.object.visible=true;}
  for(const label of towerLabels.values())label.destroy();towerLabels.clear();
  terrain.setTide(false,false);root.visible=false;ruptured=false;blocks.count=0;flash.intensity=0;
 }
 function set(m,id){
  localId=id;
  if (m && m === match) return;
  if(!m?.tide){if(on)restore();on=false;match=null;return;}
  if(match?.matchId!==m.matchId){if(on)restore();lastAudio='';lastPop=-1;}
  on=true;root.visible=true;match=m;received=performance.now();
  for(const tower of Object.values(m.tide.towers))if(!towerLabels.has(tower.id)){
   const label=new Label(labels,'tide-label',{minScale:.6,maxScale:1,scaleRef:42,maxDist:700});
   const small=document.createElement('span'),strong=document.createElement('strong'),sub=document.createElement('small');label.el.append(small,strong,sub);towerLabels.set(tower.id,label);
  }
 }
 function update(time,dt,now){
  if(!on)return;
  const m=match,t=m.tide,elapsed=(m.phaseDuration-m.phaseEndsIn+now-received)/1000,intro=m.phase==='tideIntro',it=intro?elapsed:18;
  const destroyed=it>=8.1;
  if(destroyed&&!ruptured){ruptured=true;for(const obj of scenery){savedVisibility.set(obj,obj.visible);obj.visible=false;}}
  if(ruptured)for(const obj of scenery)obj.visible=false;
  terrain.setTide(true,destroyed);
  arena.visible=destroyed;
  // Environment follows the server's phase clock, including reconnects.
  clouds.visible=true;clouds.position.y=Math.max(0,(t.water*BH-35));clouds.rotation.y=time*.003;
  let flashValue=!reduced.matches && ((time%13>.1 && time%13<.23)||(time%13>.38&&time%13<.47)) ? 1 : 0;
  lightning.visible=flashValue>0;lightning.position.y=clouds.position.y;flash.intensity=flashValue*2.5;
  currentWater=intro ? (it<8? -3-ease((it-1)/5)*3 : BASE*ease((it-14)/4)) : BASE + BH*(m.phase==='tideFlood'?t.fromWater+(t.water-t.fromWater)*ease((elapsed-1)/2):t.water);
  water.visible=true;water.position.y=currentWater;water.material.uniforms.time.value=time;water.material.uniforms.flash.value=flashValue;
  rain.visible=destroyed;rain.position.y=currentWater+15-(time*22%40);rain.geometry.setDrawRange(0,quality==='low'?300:1400);
  for(const f of floaters){f.o.position.set(f.x+Math.sin(time*.07+f.spin)*2,currentWater+Math.sin(time*1.5+f.spin)*.35,f.z+Math.cos(time*.09+f.spin)*2);f.o.rotation.set(Math.sin(time+f.spin)*.12,time*.025+f.spin,Math.cos(time*.8+f.spin)*.1);}
  surge.material.uniforms.time.value=time;
  surge.group.visible=intro&&it>2&&it<10 || m.phase==='tideFlood';
  if(intro){surge.group.position.set(0,-5,-230+ease((it-3)/6)*400);surge.group.scale.set(1,Math.max(.01,ease((it-2)/3)),1);surge.group.rotation.y=0;}
  else {const a=(t.seed%7+m.round)*1.7;surge.group.rotation.y=a;surge.group.scale.set(.6,.09,.3);const distance=125-ease(elapsed/3)*230;surge.group.position.set(-Math.sin(a)*distance,currentWater-1,-Math.cos(a)*distance);}
  const splashTime=intro?it-7.8:m.phase==='tideFlood'?elapsed-1.6:-1;
  spray.visible=splashTime>=0&&splashTime<2.2;
  if(spray.visible){spray.material.opacity=(1-splashTime/2.2)*.8;for(let i=0;i<drops.length;i++){const d=drops[i];dummy.position.set(d.x+d.vx*splashTime,currentWater+Math.max(0,d.vy*splashTime-12*splashTime*splashTime),d.z+splashTime*12);dummy.scale.setScalar(d.scale);dummy.rotation.set(i,0,0);dummy.updateMatrix();spray.setMatrixAt(i,dummy.matrix);}spray.instanceMatrix.needsUpdate=true;}
  const audio=intro?(it<3?'omen':it<7.5?'wave':it<10?'impact':'settle'):'';
  if(audio&&audio!==lastAudio){lastAudio=audio;if(audio==='omen')sfx.omen();if(audio==='wave')sfx.tideWave();if(audio==='impact')sfx.impact();}
  const reveal=m.phase==='tideReveal'?clamp(elapsed/3):1;let count=0,localShown=0;
  for(let seat=0;seat<8;seat++){platforms[seat].g.visible=false;platforms[seat].rescue.visible=false;}
  for(const tower of Object.values(t.towers)){
   const part=m.participants.find(p=>p.id===tower.id),platform=platforms[tower.seat];if(!platform)continue;
   let height=tower.height;
   if(m.phase==='tideReveal')height=tower.before+tower.added*ease(reveal);
   if(m.phase==='tideResolve'&&tower.rescued)height=tower.before+(tower.height-tower.before)*ease(elapsed/2.2);
   const rise=intro?ease((it-12)/3):1;
   const topY=BASE+height*BH;platform.g.position.y=-3+(topY+3)*rise;
   const alive=part?.alive;
   const collapse=!alive?m.phase==='tideResolve'?ease(elapsed/2.2):1:0;
   platform.g.position.y-=collapse*8;platform.g.rotation.z=collapse*.7;
   platform.g.visible=rise>0 && collapse<1;
   const earnedHeight=tower.earned, rescueUnits=tower.height-earnedHeight;
   platform.rescue.visible=platform.g.visible;
   platform.rescue.scale.set(1,Math.max(.1,rescueUnits*BH),1);platform.rescue.position.y=BASE+rescueUnits*BH/2;
   for(const seg of tower.segments){
    for(let j=0;j<seg.letters.length;j++){
     const isNew=seg.round===m.round&&m.phase==='tideReveal';
     const p=isNew?clamp((reveal*seg.letters.length-j)*2):1;
     if(p<=0||count>=4096||collapse>=1)continue;
     const pop=reduced.matches?1:1+Math.sin(p*Math.PI)*.16;
     const scale=p<.5?p*2:pop;
     matrix.position.set(platform.pos.x,BASE+(seg.base+j+.5)*BH-collapse*8,platform.pos.z);
     // Completed letters occupy fixed levels. New letters pop from the bottom upward.
     matrix.scale.set(scale,scale,scale);matrix.rotation.set(0,0,(1-p)*.12);matrix.updateMatrix();blocks.setMatrixAt(count,matrix.matrix);
     color.set(COLORS[tower.seat]);blocks.setColorAt(count,color);glyph.array[count]=seg.letters.charCodeAt(j)-65;count++;
     if(isNew&&tower.id===localId)localShown++;
    }
   }
   const e=players.get(tower.id);
   if(e){e.tidePose=destroyed?{x:platform.pos.x,y:platform.g.position.y+.25,z:platform.pos.z,yaw:platform.pos.yaw,visible:rise>.01&&collapse<1}:null;e.avatar.root.visible=!destroyed||rise>.01&&collapse<1;}
   const label=towerLabels.get(tower.id);label.visible=destroyed&&rise>.9&&collapse<1;
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
  const angle=tower?tower.seat/8*Math.PI*2:0;
  const localHeight=tower?platforms[tower.seat].g.position.y:currentWater;
  const narrow=cam.aspect<.85;
  const radius=narrow?70:64;
  camPos.set(Math.sin(angle)*radius,Math.max(currentWater+22,localHeight+15),Math.cos(angle)*radius);
  look.set(0,Math.max(currentWater+6,localHeight-10),0);
  if(intro&&elapsed<15){
   if(elapsed<6){const k=ease(elapsed/6);camPos.set(60-k*35,28+k*12,75-k*55);look.set(0,10+k*17,-35-k*100);}
   else if(elapsed<10){camPos.set(24,32,56);look.set(0,20,-30);}
   else{const k=ease((elapsed-10)/5),a=.8+k*.9;camPos.set(Math.sin(a)*95,58,Math.cos(a)*95);look.set(0,1,0);}
  }
  cam.position.copy(camPos);cam.lookAt(look);
  if(!reduced.matches){const impact=intro?Math.max(0,1-Math.abs(elapsed-8.1)/1.2):m.phase==='tideFlood'?Math.max(0,1-Math.abs(elapsed-2)/.7)*.18:0;cam.position.x+=Math.sin(now*.12)*impact*1.3;cam.position.y+=Math.cos(now*.16)*impact*.8;}
 }
 return {set,update,camera,active:()=>on,setQuality:level=>quality=level,debug:()=>({active:on,ruptured,water:currentWater,blocks:blocks.count,platforms:platforms.filter(p=>p.g.visible).map(p=>p.g.position.toArray()),cinematic:match?.phase==='tideIntro'})};
}
