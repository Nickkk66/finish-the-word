import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TIDE } from '../shared/word-tide.js';
import { createSharkPath, wreckBodyPose } from '../shared/tide-shark-path.js';
import { WRECK, wreckStage } from '../shared/tide-wreck.js';
import { sfx } from '../audio.js';
import { createBloodPool } from './tide-blood.js';
import { createSharkWakeMaterial } from './tide-wake.js';
import { piranhaPose } from '../shared/tide-piranhas.js';

const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const BASE = 3;
const mouth = new THREE.Vector3(), offset = new THREE.Vector3(), target = new THREE.Vector3(), dummy = new THREE.Object3D();

// Split the player's actual chair geometry into seat/back/leg fragments. Cached chair
// resources remain untouched, and only these new fracture geometries are disposed.
export function fractureChair(chair) {
  const debris = new THREE.Group(), pieces = [];
  chair.updateWorldMatrix(true, true);
  const inverse = chair.matrixWorld.clone().invert();
  chair.traverse(node => {
    if (!node.isMesh || pieces.length >= 24) return;
    const geo = node.geometry, pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
    if (!pos) return;
    const matrix = inverse.clone().multiply(node.matrixWorld), normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix), buckets = new Map();
    const vertices = geo.index ? geo.index.count : pos.count, v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < vertices; i += 3) {
      const indices = [0, 1, 2].map(j => geo.index ? geo.index.getX(i + j) : i + j);
      const points = indices.map(j => new THREE.Vector3().fromBufferAttribute(pos, j).applyMatrix4(matrix));
      const center = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / 3);
      const key = (center.y > 2.3 ? 4 : 0) + (center.x > 0 ? 2 : 0) + (center.z > 0 ? 1 : 0);
      const b = buckets.get(key) || { position: [], normal: [], uv: [] }; buckets.set(key, b);
      for (let j = 0; j < 3; j++) {
        v.copy(points[j]); b.position.push(v.x, v.y, v.z);
        if (normal) { n.fromBufferAttribute(normal, indices[j]).applyMatrix3(normalMatrix).normalize(); b.normal.push(n.x, n.y, n.z); }
        if (uv) b.uv.push(uv.getX(indices[j]), uv.getY(indices[j]));
      }
    }
    for (const b of buckets.values()) {
      if (pieces.length >= 24) break;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.position, 3));
      if (b.normal.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(b.normal, 3)); else geometry.computeVertexNormals();
      if (b.uv.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geometry.computeBoundingBox(); const center = geometry.boundingBox.getCenter(new THREE.Vector3()); geometry.translate(-center.x, -center.y, -center.z);
      const object = new THREE.Mesh(geometry, Array.isArray(node.material) ? node.material[0] : node.material);
      object.position.copy(center); object.castShadow = true; debris.add(object);
      const i = pieces.length, angle = i * 2.399;
      pieces.push({ object, center, velocity: new THREE.Vector3(Math.cos(angle) * (3 + i % 3), 3 + i % 4, Math.sin(angle) * (3 + i % 3)), spin: new THREE.Vector3(.7 + i % 3, i % 2 ? -1.3 : 1.7, .8 + i % 4) });
    }
  });
  return { debris, pieces };
}

export function applyTideWreckPose(avatar, pose) {
  if (!pose) { avatar.head.visible = true; return; }
  avatar.flightT = -1; avatar.cheerT = 0; avatar.emote = null;
  const t = pose.seconds, fall = ease((t-WRECK.shake)/(WRECK.water-WRECK.shake));
  // Keep the seated joints until the chair gives way, then tumble directly.
  avatar.body.position.set(0, .5*(1-fall), 0); avatar.body.scale.setScalar(1); avatar.spin.rotation.set(0, 0, 0);
  avatar.head.visible = !pose.detached;avatar.head.rotation.set(0,0,0);
  const amplitude = pose.reduced ? .3 : 1, flail = t >= WRECK.grab;
  avatar.lArm.rotation.set(-.5-fall+Math.sin(t*(flail?20:7))*amplitude*fall,0,-.25);
  avatar.rArm.rotation.set(-.5-fall+Math.sin(t*(flail?20:7)+Math.PI)*amplitude*fall,0,.25);
  avatar.lLeg.rotation.set(-Math.PI/2*(1-fall)+Math.sin(t*9)*.6*fall,0,-.1);
  avatar.rLeg.rotation.set(-Math.PI/2*(1-fall)+Math.sin(t*9+Math.PI)*.6*fall,0,.1);
}

// Split the five remaining block-avatar parts into fifteen matching pieces.
function scatterAvatar(avatar) {
  const group=new THREE.Group(), pieces=[];
  const parts=[avatar.torso,avatar.lArmMesh,avatar.rArmMesh,avatar.lLegMesh,avatar.rLegMesh];
  for(const [partIndex,part] of parts.entries()) {
    part.geometry.computeBoundingBox();const size=part.geometry.boundingBox.getSize(new THREE.Vector3());
    for(let j=0;j<3;j++) {
      const object=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y/3,size.z),part.material);
      object.castShadow=true;group.add(object);const i=pieces.length,a=i*2.399;
      pieces.push({object,angle:a,radius:2+i%6,spin:new THREE.Vector3(i*.3,.6+i*.2,.2+i*.12),part:partIndex,localCenter:new THREE.Vector3(0,part.geometry.boundingBox.min.y+(j+.5)*size.y/3,0)});
    }
  }
  return {group,pieces};
}

// Keep the cinematic visible even while the bundled models load or fail.
function fallbackSeaAnimal(length) {
  const group=new THREE.Group(), bodyMat=new THREE.MeshStandardMaterial({color:length>5?'#537e92':'#d5683e',roughness:.6});
  const body=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),bodyMat);body.scale.set(length*.19,length*.23,length*.43);group.add(body);
  const fin=new THREE.Mesh(new THREE.ConeGeometry(length*.15,length*.38,3),bodyMat);fin.position.set(0,length*.25,0);group.add(fin);
  const tail=new THREE.Mesh(new THREE.ConeGeometry(length*.21,length*.32,3),bodyMat);tail.rotation.x=Math.PI/2;tail.position.z=-length*.42;group.add(tail);
  for(const side of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(length*.035,8,6),new THREE.MeshBasicMaterial({color:'#fff'}));eye.position.set(side*length*.15,length*.08,length*.25);group.add(eye);const pupil=new THREE.Mesh(new THREE.SphereGeometry(length*.018,8,6),new THREE.MeshBasicMaterial({color:'#151719'}));pupil.position.copy(eye.position);pupil.position.x+=side*length*.025;group.add(pupil);}
  group.traverse(n=>{if(n.isMesh)n.castShadow=true;});return group;
}

export function createTideWrecks(parent, players) {
  const root = new THREE.Group(); root.name = 'Tide chair wrecks and sharks'; parent.add(root);
  const entries = new Map(); let template = fallbackSeaAnimal(11), fishTemplate=fallbackSeaAnimal(3.3), assetError = false, cameraKey=null;
  const mouthLocal = new THREE.Vector3(0,0,4.2);
  const loader=new GLTFLoader();
  const ready=Promise.all([
    loader.loadAsync('/assets/word-tide/shark.glb').then(gltf=>{
      const bounds=new THREE.Box3().setFromObject(gltf.scene),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),scale=11/size.z;
      gltf.scene.scale.setScalar(scale);gltf.scene.position.copy(center).multiplyScalar(-scale);
      template=new THREE.Group();template.add(gltf.scene);
      template.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
      mouthLocal.set(0,(-.2-center.y)*scale,(2.1-center.z)*scale);
    }),
    loader.loadAsync('/assets/word-tide/piranha.glb').then(gltf=>{
      const bounds=new THREE.Box3().setFromObject(gltf.scene),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),scale=3.3/size.z;
      gltf.scene.scale.setScalar(scale);gltf.scene.position.copy(center).multiplyScalar(-scale);
      fishTemplate=new THREE.Group();fishTemplate.add(gltf.scene);
    })
  ]).catch(error=>{assetError=true;console.error('Could not load bundled Tide sea models',error);});
  // Soft, irregular foam flecks form a trail; no circular torus around the shark.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');
  for(let i=0;i<75;i++) {const x=18+(Math.sin(i*12.7)*.5+.5)*92,y=18+(Math.sin(i*7.3)*.5+.5)*92,r=3+i%9;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(242,255,253,.9)');g.addColorStop(1,'rgba(242,255,253,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
  const foamGeometry=new THREE.PlaneGeometry(1,1),foamMaterial=createSharkWakeMaterial(new THREE.CanvasTexture(canvas));
  foamGeometry.setAttribute('foamAge',new THREE.InstancedBufferAttribute(Float32Array.from({length:48},(_,i)=>i/48),1));
  const dropGeometry=new THREE.IcosahedronGeometry(.12,0),dropMaterial=new THREE.MeshBasicMaterial({color:'#effffc'});
  const bloodGeometry=new THREE.PlaneGeometry(18,18,36,36);
  function remove(entry) {
    for(const obj of [entry.debris,entry.head,entry.shark,entry.wake,entry.spray,entry.bodyDebris,entry.back,...entry.fish])obj?.removeFromParent();
    for(const p of [...entry.pieces,...entry.bodyPieces])p.object.geometry.dispose();
    entry.spray.dispose();entry.wake.dispose();
    entry.blood.dispose();
    if(entry.entity){entry.entity.tideWreckPose=null;entry.entity.avatar.head.visible=true;if(entry.entity.back)entry.entity.back.visible=true;}
    if(entry.chair){entry.chair.visible=true;entry.chair.rotation.z=0;}
  }
  function clear(){for(const entry of entries.values())remove(entry);entries.clear();cameraKey=null;}
  function ensure(tower,platform) {
    const entity=players.get(tower.id),key=tower.wreck.id;let entry=entries.get(tower.id);
    if(entry?.key===key)return entry;if(entry)remove(entry);if(!entity||!platform.chair)return null;
    const {debris,pieces}=fractureChair(platform.chair);root.add(debris);
    const head=entity.avatar.head.clone(true);head.visible=false;root.add(head);
    const wake=new THREE.InstancedMesh(foamGeometry,foamMaterial,48);wake.frustumCulled=false;wake.visible=false;root.add(wake);
    const spray=new THREE.InstancedMesh(dropGeometry,dropMaterial,32);spray.frustumCulled=false;spray.visible=false;root.add(spray);
    const body=scatterAvatar(entity.avatar);body.group.visible=false;root.add(body.group);
    const back=entity.back?.clone(true);if(back){back.visible=false;root.add(back);}
    const blood=createBloodPool(root,bloodGeometry);
    entry={key,entity,chair:platform.chair,debris,pieces,head,wake,spray,back,blood,bodyDebris:body.group,bodyPieces:body.pieces,fish:[],shark:null,stage:'waiting',heard:new Set(),focus:new THREE.Vector3(),seconds:-1,mouth:new THREE.Vector3(),path:null,fragmentsCaptured:false};
    entries.set(tower.id,entry);return entry;
  }
  function update(tower,platform,seconds,water,time,reduced,audible=false,low=false) {
    if(!tower.wreck)return null;const entry=ensure(tower,platform);if(!entry)return null;
    const stage=wreckStage(seconds);entry.stage=stage;entry.seconds=seconds;foamMaterial.uniforms.time.value=time;
    const e=entry.entity,pos=platform.pos,radial={x:-Math.sin(pos.yaw),z:-Math.cos(pos.yaw)},floor=BASE+tower.wreck.height*TIDE.blockHeight;
    if(!entry.shark&&template){entry.shark=template.clone(true);root.add(entry.shark);}
    if(!entry.fish.length&&fishTemplate)for(let i=0;i<8;i++){const f=fishTemplate.clone(true);f.visible=false;root.add(f);entry.fish.push(f);}
    if(stage==='waiting')return null;
    const shake=seconds<WRECK.shake?Math.sin(seconds*29)*(reduced?.008:.04):0;
    entry.chair.rotation.z=shake;entry.chair.visible=seconds<WRECK.shake;
    entry.debris.visible=seconds>=WRECK.shake;
    entry.debris.position.set(pos.x,floor+.23,pos.z);entry.debris.rotation.y=pos.yaw;
    const flight=Math.max(0,seconds-WRECK.shake);
    for(const [i,p] of entry.pieces.entries()) {
      p.object.visible=!low||i%2===0;p.object.position.copy(p.center).addScaledVector(p.velocity,Math.min(flight,3));
      const floatY=water-floor-.23+Math.sin(time*2+i)*.13;
      p.object.position.y=Math.max(floatY,p.center.y+p.velocity.y*flight-9*flight*flight);
      p.object.rotation.set(p.spin.x*Math.min(flight,4),p.spin.y*Math.min(flight,4),p.spin.z*Math.min(flight,4));
    }
    const pose= wreckBodyPose(seconds,pos,floor,water,reduced),detached=seconds>=WRECK.grab;
    function placeAvatar(at){
      const p=wreckBodyPose(at,pos,floor,water,reduced);
      e.avatar.root.position.set(p.x,p.y,p.z);e.avatar.root.rotation.set(p.pitch,p.yaw,p.tilt,'YXZ');
      applyTideWreckPose(e.avatar,{seconds:at,detached:at>=WRECK.grab,reduced});e.avatar.root.updateWorldMatrix(true,true);
      return p;
    }
    e.tidePose=pose;e.tideWreckPose={seconds,stage,detached,reduced};e.avatar.root.visible=pose.visible;
    if(e.back)e.back.visible=seconds<WRECK.drag;
    placeAvatar(seconds);target.copy(e.avatar.headMesh.getWorldPosition(new THREE.Vector3()));
    entry.focus.set(seconds<WRECK.water?pose.x:target.x,seconds<WRECK.water?pose.y+3:target.y,seconds<WRECK.water?pose.z:target.z);
    if(!entry.path){const captured=wreckBodyPose(WRECK.grab,pos,floor,water,reduced);entry.path=createSharkPath(captured.head,water,pos.yaw);}
    function sharkFrame(t){
      const sample=entry.path.sample(t),direction=new THREE.Vector3().fromArray(sample.velocity);
      const heading=Math.atan2(direction.x,direction.z),pitch=-Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
      const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,heading,0,'YXZ'));
      const mouth=new THREE.Vector3().fromArray(sample.position),center=mouth.clone().sub(mouthLocal.clone().applyQuaternion(quaternion));
      return {mouth,center,quaternion,heading};
    }
    if(entry.shark){
      const shark=entry.shark,frame=sharkFrame(seconds);shark.visible=seconds>=WRECK.water&&seconds<WRECK.gone;
      shark.quaternion.copy(frame.quaternion);shark.position.copy(frame.center);mouth.copy(frame.mouth);entry.mouth.copy(mouth);
      // At contact the clone has the exact head position and orientation. It then
      // follows the same mouth curve with a fixed grip, rather than snapping into it.
      entry.head.visible=detached&&seconds<WRECK.gone;
      const capture=sharkFrame(WRECK.grab),headAtBite=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI*.46,pos.yaw,0,'YXZ'));
      const grip=capture.quaternion.clone().invert().multiply(headAtBite);
      entry.head.quaternion.copy(frame.quaternion).multiply(grip);
      offset.set(0,.625,0).applyQuaternion(entry.head.quaternion);entry.head.position.copy(mouth).sub(offset);
      if(detached)entry.focus.copy(mouth);
      else {const lead=.4*ease((seconds-WRECK.water)/.8)*(1-ease((seconds-WRECK.breach)/(WRECK.grab-WRECK.breach)));entry.focus.lerp(mouth,lead);}
      entry.wake.visible=shark.visible&&seconds<WRECK.sink;
      if(entry.wake.visible){entry.wake.count=low?20:48;for(let i=0;i<entry.wake.count;i++){
        const lag=i/entry.wake.count*2.8,old=sharkFrame(Math.max(WRECK.water,seconds-lag)),side=(i%2?1:-1)*(.3+lag*.65);
        dummy.position.set(old.center.x+Math.cos(old.heading)*side,water+.035+Math.sin(time*3+i)*.015,old.center.z-Math.sin(old.heading)*side);
        dummy.rotation.set(-Math.PI/2,0,-old.heading+i*.37);dummy.scale.set(old.mouth.y>water+2?0:.85+lag*.4,1.8+lag*.5,1);dummy.updateMatrix();entry.wake.setMatrixAt(i,dummy.matrix);
      }entry.wake.instanceMatrix.needsUpdate=true;}
    }
    if(seconds>=WRECK.drag&&!entry.fragmentsCaptured){
      const captured=placeAvatar(WRECK.drag),parts=[e.avatar.torso,e.avatar.lArmMesh,e.avatar.rArmMesh,e.avatar.lLegMesh,e.avatar.rLegMesh];
      entry.breakOrigin=new THREE.Vector3(captured.x,water,captured.z);
      for(const p of entry.bodyPieces){p.start=p.localCenter.clone().applyMatrix4(parts[p.part].matrixWorld).sub(entry.breakOrigin);p.quaternion=parts[p.part].getWorldQuaternion(new THREE.Quaternion());}
      if(entry.back&&e.back){entry.backStart=e.back.getWorldPosition(new THREE.Vector3()).sub(entry.breakOrigin);entry.backQuaternion=e.back.getWorldQuaternion(new THREE.Quaternion());}
      entry.fragmentsCaptured=true;placeAvatar(seconds);
    }
    // Piranhas swarm a stylized scatter of blocks; these remain afloat for spectating.
    const breakup=ease((seconds-WRECK.drag)/1.1);entry.bodyDebris.visible=seconds>=WRECK.drag;
    const bloodOrigin=wreckBodyPose(WRECK.grab,pos,floor,water,reduced);
    entry.blood.update(seconds-WRECK.grab,{x:(bloodOrigin.x+bloodOrigin.head.x)/2,z:(bloodOrigin.z+bloodOrigin.head.z)/2},water,time);
    entry.bodyDebris.position.set(entry.breakOrigin?.x??pose.x,water,entry.breakOrigin?.z??pose.z);
    for(const [i,p]of entry.bodyPieces.entries()) {
      const start=p.start||new THREE.Vector3(),r=p.radius*breakup;p.object.position.set(start.x+Math.sin(p.angle)*r,start.y*(1-breakup)+(Math.sin(time*2+i)*.1+.55)*breakup,start.z+Math.cos(p.angle)*r);
      p.object.quaternion.copy(p.quaternion||new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(p.spin.x*breakup,p.spin.y*breakup,p.spin.z*breakup)));
    }
    if(entry.back){entry.back.visible=seconds>=WRECK.drag;const start=entry.backStart||new THREE.Vector3();entry.back.position.set((entry.breakOrigin?.x??pose.x)+start.x+breakup*6,water+start.y*(1-breakup)+(.3+Math.sin(time*2)*.1)*breakup,(entry.breakOrigin?.z??pose.z)+start.z-breakup*4);entry.back.quaternion.copy(entry.backQuaternion||new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(breakup*1.1,breakup*.4,breakup*.8)));}
    const swarmOrigin=entry.breakOrigin||pose,targets=entry.bodyDebris.visible?entry.bodyPieces.map(p=>({x:swarmOrigin.x+p.object.position.x,y:water+p.object.position.y,z:swarmOrigin.z+p.object.position.z})):[];
    for(const [i,f]of entry.fish.entries()) {
      const fish=piranhaPose(seconds,i,swarmOrigin,water,targets);
      f.visible=fish.visible&&(!low||i%2===0);
      f.position.set(fish.x,fish.y,fish.z);f.rotation.set(fish.pitch,fish.yaw,fish.roll,'YXZ');
    }
    // Show the bite first, then stay with the body and surfacing piranhas while the
    // shark dives away. This finishes before the finale's retreat starts.
    entry.swarmBlend=ease((seconds-WRECK.grab-.45)/1.8);
    if(detached)entry.focus.lerp(new THREE.Vector3(swarmOrigin.x,water+.7,swarmOrigin.z),entry.swarmBlend);
    const splashAt=seconds<WRECK.jump?WRECK.water:seconds<WRECK.land?WRECK.jump:seconds<WRECK.breach?WRECK.land:WRECK.breach,splashAge=seconds-splashAt;
    entry.spray.visible=splashAge>=0&&splashAge<1.3;
    if(entry.spray.visible){entry.spray.count=low?12:32;const origin=seconds>=WRECK.jump&&entry.path?new THREE.Vector3().fromArray(entry.path.sample(splashAt).position):target;
      for(let i=0;i<entry.spray.count;i++){const a=i*2.399,speed=2+i%5;dummy.position.set(origin.x+Math.cos(a)*speed*splashAge,water+.15+Math.max(0,(6+i%8)*splashAge-10*splashAge*splashAge),origin.z+Math.sin(a)*speed*splashAge);dummy.rotation.set(0,0,0);dummy.scale.setScalar(.7+i%4*.3);dummy.updateMatrix();entry.spray.setMatrixAt(i,dummy.matrix);}entry.spray.instanceMatrix.needsUpdate=true;
    }
    if(audible)for(const [at,sound]of [[WRECK.shake,'impact'],[WRECK.water,'tideWave'],[WRECK.jump,'impact'],[WRECK.breach,'impact']])if(seconds>=at&&seconds-at<.4&&!entry.heard.has(at)){entry.heard.add(at);sfx[sound]();}
    return entry;
  }
  function camera(camPos,look,localId,water,aspect=1) {
    const entry=entries.get(localId)?.seconds>=0&&entries.get(localId)?.seconds<WRECK.cameraEnd?entries.get(localId):[...entries.values()].find(e=>e.seconds>=0&&e.seconds<WRECK.cameraEnd);
    cameraKey=entry?.key||null;if(!entry)return false;const f=entry.focus,blend=entry.swarmBlend||0;
    const distance=((20+18*ease((entry.seconds-WRECK.water)/.8)*(1-ease((entry.seconds-WRECK.breach)/(WRECK.grab-WRECK.breach))))*(1-blend)+16*blend)*(aspect<.85?1.45-.2*blend:1);
    const yaw=entry.entity.tidePose.yaw,side={x:Math.cos(yaw),z:-Math.sin(yaw)},out={x:-Math.sin(yaw),z:-Math.cos(yaw)};
    look.copy(f);camPos.set(f.x+(side.x*.6+out.x*.8)*distance,Math.max(water+4,f.y+9),f.z+(side.z*.6+out.z*.8)*distance);return true;
  }
  return {ready,update,clear,camera,debug:()=>({cameraKey,loaded:!!template&&!!fishTemplate,assetError,events:[...entries].map(([id,e])=>({id,key:e.key,stage:e.stage,seconds:e.seconds,pieces:e.pieces.length,bodyPieces:e.bodyDebris.visible?e.bodyPieces.length:0,fish:e.fish.filter(f=>f.visible).length,chairVisible:e.chair.visible,bloodVisible:e.blood.mesh.visible,wakeTime:foamMaterial.uniforms.time.value,swarmBlend:e.swarmBlend,fishPositions:e.fish.filter(f=>f.visible).map(f=>f.position.toArray()),sharkVisible:!!e.shark?.visible,shark:e.shark?.position.toArray(),sharkQuaternion:e.shark?.quaternion.toArray(),mouth:e.mouth.toArray(),headCenter:e.head.children[0]?.getWorldPosition(new THREE.Vector3()).toArray(),avatarHeadCenter:e.entity.avatar.headMesh.getWorldPosition(new THREE.Vector3()).toArray(),accessoryVisible:!!e.back?.visible,detachedHead:e.head.visible,headVisible:e.entity.avatar.head.visible,focus:e.focus.toArray()}))})};
}
