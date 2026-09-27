// Inspect scene components from unobstructed, repeatable cameras and check head/felt clearance.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {browser} from './browser.mjs';
const b=await browser();
try{
 const p=await b.page('visual-fixes');await p.nav(`${process.env.BASE||'http://127.0.0.1:8787'}/?debug=1`);await p.wait('window.__ftw?.world');
 const result=await p.eval(`(async()=>{
  const THREE=await import('three');
  const {createTerrain}=await import('./js/world/terrain.js'),{createProps}=await import('./js/world/props.js'),{createLobby}=await import('./js/world/lobby.js'),{createTable}=await import('./js/world/table.js');
  const {Avatar}=await import('./js/world/avatar.js'),{createMeteorTrail}=await import('./js/world/ember.js');
  const {createRouletteScene}=await import('./js/world/roulette.js'),{LabelLayer}=await import('./js/world/labels.js');
  const scene=new THREE.Scene(),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,750);
  const terrain=createTerrain(scene),props=createProps(scene),lobby=createLobby(scene),table=createTable(scene);table.setTable('poker');
  const camera=new THREE.PerspectiveCamera(60,4/3,.2,900),images={};
  const shot=(name,pos,at,t=0)=>{camera.position.set(...pos);camera.lookAt(...at);terrain.setSkyFocus(camera.position);terrain.update(t);props.updateNight(terrain.nightAmount(),t);lobby.update(t,.016);renderer.render(scene,camera);images[name]=renderer.domElement.toDataURL('image/png').split(',')[1];};
  terrain.setNight(true);lobby.setRoulette(true,'roulette');await new Promise(r=>setTimeout(r,3600));
  shot('beam-a',[-120,32,0],[-72,9,-80],0);shot('beam-b',[-120,32,0],[-72,9,-80],5);shot('beam-c',[-120,32,0],[-72,9,-80],12);
  shot('crate',[-21,7,33],[-29,1.6,23],0);
  const avatar=new Avatar();scene.add(avatar.root);avatar.root.position.set(0,.3,7.45);avatar.root.rotation.y=Math.PI;avatar.setSeated(true);avatar.rouletteSleeping=true;
  for(let i=0;i<180;i++)avatar.update(1/60,i/60);
  scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(avatar.headMesh),hands=[avatar.lArmMesh,avatar.rArmMesh].map(m=>new THREE.Box3().setFromObject(m).min.y);
  const layer=new LabelLayer(document.createElement('div'),renderer.domElement);
  const roulette=createRouletteScene(scene,layer,props.trees);
  const entities=new Map([['sleeper',{avatar,data:{},seat:0,render:avatar.root.position,renderYaw:Math.PI}]]);
  roulette.set(true,{startedAt:1,phase:'ended',participants:[{id:'sleeper',alive:false}]},entities);
  roulette.update(0,.016);
  shot('head',[-8,7,10],[0,3.3,4.8]);shot('head-side',[-8,4,5],[0,3.3,4.8]);
  const resting=roulette.debug().restingCups[0];
  const cupPos=new THREE.Vector3(...resting.position),nearest=new THREE.Vector3();
  const cupClearance=[avatar.headMesh,avatar.lArmMesh,avatar.rArmMesh].map(m=>{const box=new THREE.Box3().setFromObject(m);box.clampPoint(cupPos,nearest);return Math.hypot(nearest.x-cupPos.x,nearest.z-cupPos.z)-.47;});
  const pose={min:bounds.min.toArray(),max:bounds.max.toArray(),hands,cupClearance};
  const wake=createMeteorTrail(scene),head=new THREE.Vector3(0,24,0),direction=new THREE.Vector3(25,70,-32).normalize();wake.update(head,direction,.65,4);
  const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(1.55,1),new THREE.MeshBasicMaterial({color:'#55362e'}));rock.position.copy(head);scene.add(rock);
  shot('meteor',[38,35,52],[3,30,-5]);
  wake.mesh.visible=false;rock.visible=false;
  roulette.setMeteor({id:'visual-fixture',x:0,z:22,landsIn:1200});roulette.update(2,.016);
  shot('collectible-meteor',[38,35,52],[10,29,12]);
  renderer.dispose();return {images,pose};
 })()`);
 mkdirSync('.e2e-shots',{recursive:true});for(const [name,data] of Object.entries(result.images))writeFileSync(`.e2e-shots/visual-fixes-${name}.png`,Buffer.from(data,'base64'));
 assert.ok(result.pose.min[1]>=3.30&&result.pose.min[1]<3.40,JSON.stringify(result.pose));
 assert.ok(result.pose.max[2]<5.5,JSON.stringify(result.pose));
 assert.ok(result.pose.hands.every(y=>y>=3.3),JSON.stringify(result.pose));
 assert.ok(result.pose.cupClearance.every(d=>d>0),JSON.stringify(result.pose));
 assert.deepEqual(p.errors,[]);console.log('PASS head and hands clear felt, head rests within tabletop; scene captures',result.pose);
}finally{await b.close();}
