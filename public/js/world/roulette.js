import * as THREE from 'three';
import { Label } from './labels.js';
import { buildPet } from './cosmetics.js';
import { DECK, BOARDS, seatX, seatZ } from './layout.js';
import { LAYOUT } from '../shared/constants.js';
import { ROULETTE_HAZARDS, ROULETTE_INTRO_MS, sipLift } from '../shared/roulette.js';
import { createFire, createMeteorTrail, surfaceTexture } from './ember.js';
import { sfx } from '../audio.js';

export function createRouletteScene(scene, labels, trees, onShock = () => {}) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  // Lighting is confined to the table, independent of the dark ambient map.
  const light = new THREE.PointLight('#bd8dff', 32, 26, 1.3); light.position.set(0,8,0); root.add(light);
  const ring = new THREE.Mesh(new THREE.RingGeometry(9.7,11.4,96),new THREE.MeshBasicMaterial({color:'#b67bff',transparent:true,opacity:.4,side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.y=DECK.top+.025;root.add(ring);
  const cup=new THREE.Group();root.add(cup);
  const gold=new THREE.MeshStandardMaterial({map:surfaceTexture('gold'),metalness:.65,roughness:.38});
  const trim=new THREE.MeshStandardMaterial({color:'#f1d27f',metalness:.7,roughness:.25});
  const liquid=new THREE.MeshStandardMaterial({color:'#9f46d9',emissive:'#48135d',roughness:.2});
  const part=(geo,mat,y)=>{const mesh=new THREE.Mesh(geo,mat);mesh.position.y=y;cup.add(mesh);return mesh;};
  const profile=[new THREE.Vector2(.09,0),new THREE.Vector2(.24,.25),new THREE.Vector2(.33,.34),new THREE.Vector2(.41,.55),new THREE.Vector2(.46,.80),new THREE.Vector2(.47,.88),new THREE.Vector2(.43,.88),new THREE.Vector2(.42,.80),new THREE.Vector2(.37,.55)];
  part(new THREE.LatheGeometry(profile,40),gold,0);
  part(new THREE.CylinderGeometry(.09,.14,.45,24),gold,.13);
  part(new THREE.CylinderGeometry(.33,.38,.10,40),gold,-.08);
  for(const [r,y] of [[.47,.875],[.30,.33],[.13,-.01],[.37,-.06]]){const rim=part(new THREE.TorusGeometry(r,.027,8,40),trim,y);rim.rotation.x=Math.PI/2;}
  for(let i=0;i<8;i++){const a=i*Math.PI/4;const jewel=part(new THREE.OctahedronGeometry(.065),new THREE.MeshStandardMaterial({color:'#a04ccd',emissive:'#431253',metalness:.3,roughness:.2}),.59);jewel.position.x=Math.sin(a)*.415;jewel.position.z=Math.cos(a)*.415;}
  part(new THREE.CylinderGeometry(.41,.41,.025,40),liquid,.82);
  const cash=new THREE.Group();cash.position.y=DECK.top+LAYOUT.tableHeight+.1;root.add(cash);
  const noteCanvas=document.createElement('canvas');noteCanvas.width=128;noteCanvas.height=64;
  const ink=noteCanvas.getContext('2d');ink.fillStyle='#97dca4';ink.fillRect(0,0,128,64);ink.strokeStyle='#377349';ink.lineWidth=4;ink.strokeRect(5,5,118,54);ink.fillStyle='#377349';ink.font='bold 44px sans-serif';ink.textAlign='center';ink.fillText('$',64,49);
  const noteTexture=new THREE.CanvasTexture(noteCanvas);noteTexture.colorSpace=THREE.SRGBColorSpace;const noteMat=new THREE.MeshStandardMaterial({map:noteTexture});
  const bill=new THREE.BoxGeometry(.88,.14,.43), strap=new THREE.BoxGeometry(.15,.15,.45);
  const green=new THREE.MeshStandardMaterial({color:'#79d79a'}),band=new THREE.MeshStandardMaterial({color:'#fff1c9'});
  const noteGeo=new THREE.PlaneGeometry(.87,.42);noteGeo.rotateX(-Math.PI/2);noteGeo.translate(0,.076,0);
  const bills=new THREE.InstancedMesh(bill,green,144),straps=new THREE.InstancedMesh(strap,band,144),notes=new THREE.InstancedMesh(noteGeo,noteMat,144);
  const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3(1,1,1);
  for(let i=0;i<144;i++) {
    const layer=Math.floor(i/9),cell=i%9;
    position.set((cell%3-1)*.8+Math.sin(i*7)*.08,layer*.145,(Math.floor(cell/3)-1)*.46+Math.cos(i*3)*.05);
    quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),(layer%2?Math.PI:0)+Math.sin(i*5)*.16);
    matrix.compose(position,quaternion,scale);
    bills.setMatrixAt(i,matrix);straps.setMatrixAt(i,matrix);notes.setMatrixAt(i,matrix);
  }
  for(const mesh of [bills,straps,notes]){mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;cash.add(mesh);}
  const pot=new Label(labels,'w-roulette-pot',{maxDist:90,scaleRef:26,minScale:.55,maxScale:1.2});
  pot.el.style.cssText='display:none;padding:6px 14px;border:2px solid #d6ba73;border-radius:14px;background:#181324ee;color:#f5d680;font:700 22px Fredoka,sans-serif;white-space:nowrap;';pot.visible=false;
  const owls=[];
  const owlAt=(x,y,z,angle,scale=.6)=>{const owl=buildPet('owl');owl.scale.setScalar(scale);owl.position.set(x,y,z);owl.rotation.y=angle;root.add(owl);owls.push(owl);};
  for(const tree of trees.slice(0,8)) {
    const a=Math.atan2(-tree.x,-tree.z),r=tree.perchRadius;
    owlAt(tree.x+Math.sin(a)*r,tree.y-.35,tree.z+Math.cos(a)*r,a);
    const branch=new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,r,8),new THREE.MeshStandardMaterial({color:'#644b37'}));
    branch.position.set(tree.x+Math.sin(a)*r/2,tree.y-.42,tree.z+Math.cos(a)*r/2);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.sin(a),0,Math.cos(a)));root.add(branch);
  }
  const board=BOARDS.find(b=>b.kind==='howto');owlAt(board.x,14.15,board.z,board.ry,1.3);
  const owlLight=new THREE.PointLight('#c5c5ff',7,6,1.5);owlLight.position.set(board.x,16,board.z+2);root.add(owlLight);
  const rockMat=new THREE.MeshStandardMaterial({map:surfaceTexture('rock'),roughness:.95,bumpMap:surfaceTexture('rock'),bumpScale:.18});

  const hazards=ROULETTE_HAZARDS.map((h,i)=>{
    const crater=new THREE.Group();crater.position.set(h.x,.03,h.z);crater.scale.setScalar(.001);root.add(crater);
    const pit=new THREE.Mesh(new THREE.CircleGeometry(h.r,24),new THREE.MeshStandardMaterial({color:'#110d16',roughness:1}));pit.rotation.x=-Math.PI/2;crater.add(pit);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(h.r,.48,6,24),rockMat);rim.rotation.x=Math.PI/2;rim.position.y=.15;crater.add(rim);
    const meteor=new THREE.Mesh(new THREE.IcosahedronGeometry(1.55,1),rockMat);meteor.position.set(h.x,70,h.z);root.add(meteor);
    const trail=createFire(1.05,5,8);trail.position.y=-.2;meteor.add(trail);
    const core=new THREE.Mesh(new THREE.IcosahedronGeometry(1.57,1),new THREE.MeshBasicMaterial({color:'#d03d1b',wireframe:true,transparent:true,opacity:.45}));meteor.add(core);
    const flames=createFire(2.2,3.2,12);crater.add(flames);
    const wake=createMeteorTrail(root);
    return{h,i,crater,meteor,trail,wake,flames,impacted:false,visualFall:0};
  });
  const burningTrees=trees.filter((_,i)=>i%7===3).slice(0,5).flatMap(tree=>{
    const lower=createFire(tree.perchRadius*.7,4,7),upper=createFire(tree.perchRadius*.45,5,6);
    lower.position.set(tree.x,tree.crownY-3.2,tree.z);
    upper.position.set(tree.x,tree.crownY,tree.z);
    root.add(lower,upper);return [lower,upper];
  });
  const treasure=new THREE.Group();root.add(treasure);treasure.visible=false;
  const treasureRock=new THREE.Mesh(new THREE.IcosahedronGeometry(.9,1),new THREE.MeshStandardMaterial({map:surfaceTexture('rock'),emissive:'#e79725',emissiveIntensity:.45,roughness:.8}));treasure.add(treasureRock);
  const treasureWake=createMeteorTrail(root,16);
  const descent=new THREE.Vector3(25,70,-32).normalize(),treasureDescent=new THREE.Vector3(28,65,-25).normalize();
  const treasureFire=createFire(.7,3,7);treasure.add(treasureFire);
  const treasureLabel=new Label(labels,'w-meteor-reward',{maxDist:100,scaleRef:26});treasureLabel.el.textContent='+150 COINS';treasureLabel.visible=false;
  const pickup=new THREE.Group();pickup.visible=false;root.add(pickup);
  const pickupCore=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:'#ffe49b'}));pickup.add(pickupCore);
  const pickupPositions=new Float32Array(36*3),pickupGeo=new THREE.BufferGeometry();pickupGeo.setAttribute('position',new THREE.BufferAttribute(pickupPositions,3));
  const pickupSparks=new THREE.Points(pickupGeo,new THREE.PointsMaterial({color:'#ffe9ae',size:.36,transparent:true,depthWrite:false}));pickup.add(pickupSparks);
  const pickupLabel=new Label(labels,'w-meteor-reward',{maxDist:100,scaleRef:26});pickupLabel.el.textContent='+150 COINS';pickupLabel.visible=false;
  let meteorDrop=null,meteorLands=0,meteorPrompt=null,pickupStarted=-Infinity;
  const ghosts=[];
  const restingCups=new Map();let cupMatch=null;
  let active=false,match=null,players=null,previousEvent='',eventStart=0,event=null,knockoutPlayed=false,introStart=-Infinity;
  let cashCount=0,rimError=null,lastGhost='';
  const target=new THREE.Vector3(),from=new THREE.Vector3(),mouth=new THREE.Vector3(),lip=new THREE.Vector3(),normalCamera=new THREE.Vector3(),cinematicTarget=new THREE.Vector3();
  const y=DECK.top+LAYOUT.tableHeight+.16;cup.position.set(0,y,4.5);
  const introAge=()=>performance.now()-introStart;
  function atSeat(id,radius=4.7){const seat=players?.get(id)?.seat;return target.set(seat>=0?seatX(seat,radius):0,y,seat>=0?seatZ(seat,radius):4.5);}
  function besideHead(id,out){
    const seat=players.get(id).seat,a=Math.atan2(seatX(seat),seatZ(seat))+.36;
    return out.set(Math.sin(a)*3.65,y,Math.cos(a)*3.65);
  }
  function restCup(id){
    const actor=players?.get(id);if(!actor||actor.seat<0||restingCups.has(id))return;
    const resting=cup.clone();resting.visible=true;resting.rotation.set(0,0,0);
    // Beside the collapsed head, inside the felt rim; never reuse the circulating cup.
    besideHead(id,resting.position);
    root.add(resting);restingCups.set(id,resting);
  }
  function clearRestingCups(){for(const c of restingCups.values())root.remove(c);restingCups.clear();}
  function soul(id,key){
    if(key===lastGhost)return;lastGhost=key;const actor=players?.get(id);if(!actor)return;
    const ghost=new Label(labels,'w-roulette-soul',{maxDist:100,scaleRef:28});ghost.el.textContent='💀';
    actor.avatar.head.updateWorldMatrix(true,false);actor.avatar.head.localToWorld(ghost.anchor.set(0,.7,0));
    ghosts.push({label:ghost,start:performance.now(),base:ghost.anchor.clone()});sfx.soul();
  }
  return {
    set(on,m,entities,entry=25){
      if(on&&!active){introStart=performance.now();sfx.omen();hazards.forEach(h=>{h.impacted=false;h.visualFall=0;});}
      active=on;root.visible=on;pot.visible=on;players=entities;match=m;
      if(!on||m?.startedAt!==cupMatch||m?.phase==='lobby'){clearRestingCups();cupMatch=m?.startedAt;}
      for(const p of on&&m?.phase!=='lobby'?m?.participants||[]:[])if(!p.alive&&entities.get(p.id)?.avatar.rouletteSleeping)restCup(p.id);
      if(!on){previousEvent='';event=null;meteorDrop=null;meteorPrompt=null;treasure.visible=false;treasureWake.mesh.visible=false;treasureLabel.visible=false;pickup.visible=false;pickupLabel.visible=false;for(const g of ghosts)g.label.destroy();ghosts.length=0;return;}
      const total=m?.roulette?.pot || [...entities.values()].reduce((sum,e)=>sum+(e.data.rouletteBet || (e.data.isBot?entry:0)),0);
      pot.el.textContent=`${total.toLocaleString()} COINS${m?.roulette?' · ×'+m.roulette.multiplier.toFixed(2):''}`;
      cashCount=total?Math.min(144,18+Math.ceil(Math.log2(Math.max(1,total/25))*18)):0;
      for(const mesh of [bills,straps,notes])mesh.count=cashCount;
      cash.scale.setScalar(1+Math.min(.5,Math.log10(Math.max(1,total/25))*.1));
      pot.anchor.set(0,cash.position.y+Math.ceil(cashCount/9)*.145*cash.scale.y+1.1,0);
      const next=m?.roulette?.event,key=next?`${m.startedAt}:${next.serial}`:'';
      if(next&&key!==previousEvent){previousEvent=key;event=next;eventStart=performance.now();knockoutPlayed=false;from.copy(cup.position);if(next.action==='drink')players.get(next.id)?.avatar.sip();}
      if(!next)event=null;
    },
    setMeteor(drop,collected){
      if(collected&&active){pickupStarted=performance.now();pickup.position.set(collected.x,1,collected.z);pickup.visible=true;pickupLabel.visible=true;}
      meteorDrop=drop;meteorLands=performance.now()+(drop?.landsIn||0);meteorPrompt=drop?{i:{type:'meteor',id:drop.id},x:drop.x,z:drop.z,y:3,range:3.2,stamp:0}:null;
      treasure.visible=!!drop;treasureLabel.visible=!!drop;
    },
    meteorTarget:()=>active&&meteorDrop&&performance.now()>=meteorLands?meteorPrompt:null,
    cinematic:()=>active&&introAge()<ROULETTE_INTRO_MS,
    camera(camera){
      if(!active)return;
      if(introAge()>=ROULETTE_INTRO_MS){
        if(event?.action!=='drink'||match?.phase!=='rouletteReveal')return;
        const actor=players.get(event.id);if(!actor)return;
        const age=(performance.now()-eventStart)/1000;
        const blend=Math.min(1,age/.75)*Math.min(1,Math.max(0,(4.8-age)/.35));
        const k=blend*blend*(3-2*blend),yaw=actor.renderYaw;
        normalCamera.copy(camera.position);
        const normalLook=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(20).add(normalCamera);
        camera.position.lerp(new THREE.Vector3(actor.render.x+Math.sin(yaw)*7+Math.cos(yaw)*4,actor.render.y+6.1,actor.render.z+Math.cos(yaw)*7-Math.sin(yaw)*4),k);
        actor.avatar.head.updateWorldMatrix(true,false);actor.avatar.head.localToWorld(cinematicTarget.set(0,.4,.4));
        camera.lookAt(normalLook.lerp(cinematicTarget,k));
        if(event.poisoned&&age>4.05&&age<4.42){const decay=1-(age-4.05)/.37;camera.position.x+=Math.sin(age*110)*.17*decay;camera.position.y+=Math.cos(age*87)*.12*decay;}
        return;
      }
      const age=introAge()/1000;normalCamera.copy(camera.position);
      if(age<2){camera.position.set(0,17,38);cinematicTarget.set(-5,38-age*5,-20);}
      else {camera.position.set(38,35,52);cinematicTarget.set(7,Math.max(2,46-(age-2)*25),-12);}
      if(age>5.7){const k=Math.min(1,(age-5.7)/1.3);camera.position.lerp(normalCamera,k*k*(3-2*k));const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(25).add(normalCamera);cinematicTarget.lerp(forward,k);}
      camera.lookAt(cinematicTarget);
    },
    knockout(id){const actor=players?.get(id);if(actor)actor.avatar.rouletteSleeping=true;restCup(id);soul(id,`${match?.startedAt}:${id}`);},
    update(t,dt){
      if(!active)return;
      const now=performance.now(),elapsed=(now-eventStart)/1000;
      light.intensity=32+Math.sin(t*2)*1.5;ring.material.opacity=.19+Math.sin(t*1.8)*.035;
      cup.rotation.set(0,0,0);rimError=null;
      if(event&&match?.phase==='rouletteReveal'){
        if(event.action==='pass'){
          atSeat(event.next);const k=Math.min(1,elapsed/.8),ease=k*k*(3-2*k);cup.position.lerpVectors(from,target,ease);cup.rotation.z=Math.sin(k*Math.PI)*.13;
        }else{
          atSeat(event.id);cup.position.copy(target);const actor=players.get(event.id),k=sipLift(elapsed);
          if(actor){
            actor.avatar.head.updateWorldMatrix(true,false);actor.avatar.head.localToWorld(mouth.set(0,.40,.64));
            cup.rotation.set(-.9*k,actor.renderYaw,0,'YXZ');lip.set(0,.82,-.4).applyEuler(cup.rotation);
            cup.position.lerp(mouth.clone().sub(lip),k);
            if(k===1)rimError=cup.position.clone().add(lip).distanceTo(mouth);
          }
          if(actor&&event.poisoned&&elapsed>3.1){
            const k=Math.min(1,(elapsed-3.1)/.6);cup.position.lerp(besideHead(event.id,target),k*k*(3-2*k));
          }
          if(event.poisoned&&elapsed>4.05&&!knockoutPlayed){knockoutPlayed=true;if(actor){actor.avatar.rouletteSleeping=true;restCup(event.id);soul(event.id,`${match.startedAt}:${event.id}`);sfx.sting();onShock(event.id);}}
        }
      }else{atSeat(match?.typerId);cup.position.lerp(target,1-Math.exp(-dt*8));}
      // Once set down beside an eliminated player, only their resting cup remains there.
      cup.visible=match?.phase!=='ended'&&!(event?.poisoned&&match?.phase==='rouletteReveal'&&restingCups.has(event.id));
      for(const [id,c] of restingCups)if(!players.has(id)||players.get(id).seat<0){root.remove(c);restingCups.delete(id);}
      for(const owl of owls)owl.userData.update?.(t,dt);
      for(const h of hazards){
        const targetFall=Math.max(0,Math.min(1,(introAge()/1000-2.1-h.i*.4)/1.4));
        h.visualFall=Math.min(targetFall,h.visualFall+dt/.9);
        const fall=h.visualFall;
        h.meteor.visible=fall>0;h.crater.scale.setScalar(Math.max(.001,Math.min(1,(fall-.92)/.08)));
        h.meteor.position.set(h.h.x+(1-fall)*25,1.0+(1-fall)*70,h.h.z-(1-fall)*32);h.meteor.rotation.y=fall*2;h.trail.userData.update(t);h.trail.scale.y=1+(1-fall)*.7;
        h.wake.update(h.meteor.position,descent,fall,t);
        if(fall>=1&&!h.impacted){h.impacted=true;sfx.impact();}
        h.flames.userData.update(t);
      }
      for(const fire of burningTrees)fire.userData.update(t);
      if(meteorDrop){
        const remaining=Math.max(0,Math.min(1,(meteorLands-now)/2400));
        treasure.visible=true;treasure.position.set(meteorDrop.x+remaining*28,.8+remaining*65,meteorDrop.z-remaining*25);
        treasureWake.update(treasure.position,treasureDescent,1-remaining,t);
        treasureRock.rotation.set(t*.4,t*.7,0);treasureFire.userData.update(t);treasureFire.scale.y=remaining>0?1.7:.6;
        treasureLabel.visible=remaining===0;treasureLabel.anchor.set(meteorDrop.x,4,meteorDrop.z);
      }
      if(!meteorDrop)treasureWake.mesh.visible=false;
      if(pickup.visible){
        const age=(now-pickupStarted)/1000,k=Math.min(1,age/.8);
        pickup.position.y=1+k*3;pickupCore.scale.setScalar(1.15*(1-k)**2);pickupCore.rotation.y=t*8;
        for(let i=0;i<36;i++){const a=i*2.39996,r=k*(1+(i%5)*.27);pickupPositions[i*3]=Math.cos(a)*r;pickupPositions[i*3+1]=k*(1+(i%3)*1.2);pickupPositions[i*3+2]=Math.sin(a)*r;}
        pickupGeo.attributes.position.needsUpdate=true;pickupSparks.material.opacity=1-k;
        pickupLabel.anchor.set(pickup.position.x,4+k*3,pickup.position.z);pickupLabel.el.style.opacity=String(1-k);
        if(k>=1){pickup.visible=false;pickupLabel.visible=false;}
      }
      for(let i=ghosts.length-1;i>=0;i--){const g=ghosts[i],age=(now-g.start)/1000;g.label.anchor.copy(g.base).add(new THREE.Vector3(Math.sin(age*3)*.7,age*3.5,0));g.label.el.style.opacity=String(Math.max(0,1-age/4));if(age>4){g.label.destroy();ghosts.splice(i,1);}}
    },
    debug:()=>({active,owlBoard:board.kind,restingCups:[...restingCups].map(([id,c])=>({id,position:c.position.toArray()})),trails:hazards.filter(h=>h.wake.mesh.visible).length+(treasureWake.mesh.visible?1:0),meteor:meteorDrop,pickup:pickup.visible,burningTrees:burningTrees.length,cup:cup.position.toArray(),pot:pot.el.textContent,owls:owls.length,cashCount,rimError,ghosts:ghosts.length,craters:hazards.filter(h=>h.impacted).length,cinematic:active&&introAge()<ROULETTE_INTRO_MS}),
  };
}
