import assert from 'node:assert/strict';
import {browser,delay} from './browser.mjs';
const b=await browser();
try{
 const page=await b.page('guitar-animation',1500,1000);await page.nav(`${process.env.BASE||'http://127.0.0.1:8788'}/?debug=1`);await page.wait('window.__ftw?.world');
 const result=await page.eval(`(async()=>{
  const THREE=await import('three');const {Avatar}=await import('./js/world/avatar.js');const {buildBackBling}=await import('./js/world/cosmetics.js');const {GUITAR_CONTACTS,guitarPose}=await import('./js/shared/guitar-motion.js');
  const avatar=new Avatar({...window.__ftw.profile.look,face:2,hairStyle:2});avatar.guitar=true;
  const back=buildBackBling('guitar');back.position.y=3;avatar.rig.add(back);await back.userData.ready;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e2edf7');scene.add(avatar.root,new THREE.HemisphereLight('#ffffff','#718096',3));
  const light=new THREE.DirectionalLight('#fff5df',3);light.position.set(5,8,7);scene.add(light);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(340,460);renderer.setPixelRatio(1);
  const camera=new THREE.PerspectiveCamera(35,340/460,.1,100);
  const gallery=document.createElement('div');gallery.id='guitar-review';gallery.style.cssText='position:fixed;inset:0;z-index:99999;background:#e2edf7;overflow:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:12px;font:16px sans-serif';document.body.append(gallery);
  function render(angle){camera.position.set(Math.sin(angle)*9,4.3,Math.cos(angle)*9);camera.lookAt(0,2.8,0);renderer.render(scene,camera);}
  function sample(label,time,angle){avatar.root.updateMatrixWorld(true);render(angle);const img=new Image();img.src=renderer.domElement.toDataURL('image/png');img.style.width='100%';const cell=document.createElement('div');cell.append(img,document.createTextNode(label));gallery.append(cell);}
  const native=[];back.traverse(n=>{if(n.isMesh&&n.userData.guitarString)native.push(n.name);});
  for(let i=0;i<60;i++){avatar.update(1/60,i/60);back.userData.update(i/60,1/60,false,0,true,avatar.guitarWeight);}
  sample('Stored · rear',1,Math.PI);sample('Stored · side',1,Math.PI/2);
  avatar.setLocomotion('walk',12);
  for(let i=0;i<90;i++){avatar.update(1/60,1+i/60);back.userData.update(1+i/60,1/60,false,12,true,avatar.guitarWeight);}
  const errors=[];const maps=new Set();
  for(let frame=0;frame<240;frame++){
   const t=2.5+frame/60;avatar.update(1/60,t);back.userData.update(t,1/60,false,12,true,avatar.guitarWeight);avatar.root.updateMatrixWorld(true);maps.add(avatar.face.material.map.uuid);
   const pose=guitarPose(t,avatar.guitarWeight);const transform=new THREE.Matrix4().compose(new THREE.Vector3(pose.x,3+pose.y,pose.z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,pose.yaw,pose.roll)),new THREE.Vector3(1,1,1));
   for(const [name,elbow] of [['neck',avatar.guitarLeftElbow],['strum',avatar.guitarElbow]]){
    const contact=new THREE.Vector3(...GUITAR_CONTACTS[name]);if(name==='strum'){contact.x+=pose.strum*.09;contact.y+=pose.strum*.12;}contact.z+=.12;contact.applyMatrix4(transform);avatar.rig.localToWorld(contact);
    const hand=elbow.localToWorld(new THREE.Vector3(0,-1.1,0));errors.push(hand.distanceTo(contact));
   }
   if([0,7,14,21].includes(frame))sample('Playing · front '+frame,t,0);
   if(frame===30)sample('Playing · side',t,Math.PI/2);
   if(frame===45)sample('Playing · rear',t,Math.PI);
  }
  const playing={singing:avatar.singing,elbows:avatar.guitarElbow.visible&&avatar.guitarLeftElbow.visible,face:avatar.faceExpression,mouthFrames:maps.size,maxHandError:Math.max(...errors),nativeStrings:native,position:back.children[0].position.toArray()};
  avatar.setLocomotion('idle',0);for(let i=0;i<90;i++){avatar.update(1/60,7+i/60);back.userData.update(7+i/60,1/60,false,0,true,avatar.guitarWeight);}
  const stopped={singing:avatar.singing,notes:avatar.musicNotes.visible,elbows:avatar.guitarElbow.visible,armScale:avatar.rArmMesh.scale.y,blend:avatar.guitarWeight,face:avatar.faceExpression};
  avatar.setSeated(true);avatar.setLocomotion('walk',12);for(let i=0;i<60;i++){avatar.update(1/60,9+i/60);back.userData.update(9+i/60,1/60,true,12,true,avatar.guitarWeight);}sample('Seated · stored',10,Math.PI);
  const seatedSinging=avatar.singing;
  // Watch real-time playback close up after collecting deterministic angles and phases.
  const live=document.createElement('div');live.style.cssText='position:fixed;right:10px;bottom:10px;z-index:100000;border:3px solid #263447;background:#fff';live.append(renderer.domElement);document.body.append(live);
  avatar.setSeated(false);avatar.setLocomotion('walk',12);let last=performance.now(),elapsed=10;
  window.__guitarReview={avatar,back,renderer,camera,scene,stop:false};
  function tick(now){if(window.__guitarReview.stop)return;const dt=Math.min(.04,(now-last)/1000);last=now;elapsed+=dt;avatar.update(dt,elapsed);back.userData.update(elapsed,dt,false,12,true,avatar.guitarWeight);render(Math.sin(elapsed*.4)*.8);requestAnimationFrame(tick);}requestAnimationFrame(tick);
  return {playing,stopped,seatedSinging};
 })()`);
 assert.equal(result.playing.nativeStrings.length,6);assert.ok(result.playing.elbows&&result.playing.singing);assert.equal(result.playing.face,'singing');assert.ok(result.playing.mouthFrames>=6);assert.ok(result.playing.maxHandError<.03,JSON.stringify(result));
 assert.equal(result.stopped.singing,false);assert.equal(result.stopped.notes,false);assert.equal(result.stopped.elbows,false);assert.ok(result.stopped.armScale>.999);assert.equal(result.seatedSinging,false);
 await delay(1200);await page.shot('live-playing');
 await page.eval('window.__guitarReview.stop=true;document.querySelector("body > div:last-child").style.display="none"');await page.shot('closeups');
 await page.eval('window.__guitarReview.stop=false');
 console.log(JSON.stringify(result));assert.deepEqual(page.errors,[]);console.log('PASS guitar surface-aligned strings, 240 animated hand-contact frames, singing vowels and idle/seated restoration');
}finally{await b.close();}
