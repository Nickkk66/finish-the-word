import * as THREE from 'three';
import { Label } from './labels.js';
import { buildPet } from './cosmetics.js';
import { DECK, BOARDS, seatX, seatZ } from './layout.js';
import { LAYOUT } from '../shared/constants.js';
import { ROULETTE_HAZARDS, ROULETTE_INTRO_MS, sipLift } from '../shared/roulette.js';
import { createFire, surfaceTexture } from './ember.js';
import { sfx } from '../audio.js';

export function createRouletteScene(scene, labels, trees) {
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
  for(let i=0;i<144;i++) {
    const bundle=new THREE.Group();bundle.add(new THREE.Mesh(bill,green),new THREE.Mesh(strap,band));
    const note=new THREE.Mesh(new THREE.PlaneGeometry(.87,.42),noteMat);note.rotation.x=-Math.PI/2;note.position.y=.076;bundle.add(note);
    const layer=Math.floor(i/9),cell=i%9;
    bundle.position.set((cell%3-1)*.8+Math.sin(i*7)*.08,layer*.145,(Math.floor(cell/3)-1)*.46+Math.cos(i*3)*.05);
    bundle.rotation.y=(layer%2?Math.PI:.0)+Math.sin(i*5)*.16;cash.add(bundle);
  }
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
  const board=BOARDS.find(b=>b.kind==='wins');owlAt(board.x,14.15,board.z,board.ry,1.3);
  const owlLight=new THREE.PointLight('#c5c5ff',7,6,1.5);owlLight.position.set(board.x,16,board.z+2);root.add(owlLight);
  const rockMat=new THREE.MeshStandardMaterial({map:surfaceTexture('rock'),roughness:.95,bumpMap:surfaceTexture('rock'),bumpScale:.18});

  const hazards=ROULETTE_HAZARDS.map((h,i)=>{
    const crater=new THREE.Group();crater.position.set(h.x,.03,h.z);root.add(crater);
    const pit=new THREE.Mesh(new THREE.CircleGeometry(h.r,24),new THREE.MeshStandardMaterial({color:'#110d16',roughness:1}));pit.rotation.x=-Math.PI/2;crater.add(pit);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(h.r,.48,6,24),rockMat);rim.rotation.x=Math.PI/2;rim.position.y=.15;crater.add(rim);
    const meteor=new THREE.Mesh(new THREE.IcosahedronGeometry(1.55,1),rockMat);meteor.position.set(h.x,70,h.z);root.add(meteor);
    const trail=createFire(1.05,5,8);trail.position.y=-.2;meteor.add(trail);
    const core=new THREE.Mesh(new THREE.IcosahedronGeometry(1.57,1),new THREE.MeshBasicMaterial({color:'#d03d1b',wireframe:true,transparent:true,opacity:.45}));meteor.add(core);
    const flames=createFire(2.2,3.2,12);crater.add(flames);
    const glow=new THREE.PointLight('#ff6726',12,12,2);glow.position.y=2;crater.add(glow);
    return{h,i,crater,meteor,trail,flames,glow,impacted:false};
  });
  const burningTrees=trees.filter((_,i)=>i%7===3).slice(0,5).map(tree=>{const fire=createFire(tree.perchRadius*.65,4.5,8);fire.position.set(tree.x,tree.y-2,tree.z);root.add(fire);return fire;});
  const treasure=new THREE.Group();root.add(treasure);treasure.visible=false;
  const treasureRock=new THREE.Mesh(new THREE.IcosahedronGeometry(.9,1),new THREE.MeshStandardMaterial({map:surfaceTexture('rock'),emissive:'#e79725',emissiveIntensity:.45,roughness:.8}));treasure.add(treasureRock);
  const treasureFire=createFire(.7,3,7);treasure.add(treasureFire);
  const treasureLight=new THREE.PointLight('#ffc65c',10,10,2);treasureLight.position.y=2;treasure.add(treasureLight);
  const treasureLabel=new Label(labels,'w-meteor-reward',{maxDist:100,scaleRef:26});treasureLabel.el.textContent='+150 COINS';treasureLabel.visible=false;
  let meteorDrop=null,meteorLands=0,meteorPrompt=null;
  const ghosts=[];
  let active=false,match=null,players=null,previousEvent='',eventStart=0,event=null,knockoutPlayed=false,introStart=-Infinity;
  let cashCount=0,rimError=null,lastGhost='';
  const target=new THREE.Vector3(),from=new THREE.Vector3(),mouth=new THREE.Vector3(),lip=new THREE.Vector3(),normalCamera=new THREE.Vector3(),cinematicTarget=new THREE.Vector3();
  const y=DECK.top+LAYOUT.tableHeight+.16;cup.position.set(0,y,4.5);
  const introAge=()=>performance.now()-introStart;
  function atSeat(id,radius=4.7){const seat=players?.get(id)?.seat;return target.set(seat>=0?seatX(seat,radius):0,y,seat>=0?seatZ(seat,radius):4.5);}
  function soul(id,key){
    if(key===lastGhost)return;lastGhost=key;const actor=players?.get(id);if(!actor)return;
    const ghost=new Label(labels,'w-roulette-soul',{maxDist:100,scaleRef:28});ghost.el.textContent='💀';
    actor.avatar.head.updateWorldMatrix(true,false);actor.avatar.head.localToWorld(ghost.anchor.set(0,.7,0));
    ghosts.push({label:ghost,start:performance.now(),base:ghost.anchor.clone()});sfx.soul();
  }
  return {
    set(on,m,entities,entry=25){
      if(on&&!active){introStart=performance.now();sfx.omen();hazards.forEach(h=>h.impacted=false);}
      active=on;root.visible=on;pot.visible=on;players=entities;match=m;
      if(!on){previousEvent='';event=null;meteorDrop=null;meteorPrompt=null;treasure.visible=false;treasureLabel.visible=false;for(const g of ghosts)g.label.destroy();ghosts.length=0;return;}
      const total=m?.roulette?.pot || [...entities.values()].reduce((sum,e)=>sum+(e.data.rouletteBet || (e.data.isBot?entry:0)),0);
      pot.el.textContent=`${total.toLocaleString()} COINS${m?.roulette?' · ×'+m.roulette.multiplier.toFixed(2):''}`;
      cashCount=total?Math.min(144,18+Math.ceil(Math.log2(Math.max(1,total/25))*18)):0;
      cash.children.forEach((b,i)=>b.visible=i<cashCount);cash.scale.setScalar(1+Math.min(.5,Math.log10(Math.max(1,total/25))*.1));
      pot.anchor.set(0,cash.position.y+Math.ceil(cashCount/9)*.145*cash.scale.y+1.1,0);
      const next=m?.roulette?.event,key=next?`${m.startedAt}:${next.serial}`:'';
      if(next&&key!==previousEvent){previousEvent=key;event=next;eventStart=performance.now();knockoutPlayed=false;from.copy(cup.position);if(next.action==='drink')players.get(next.id)?.avatar.sip();}
      if(!next)event=null;
    },
    setMeteor(drop){
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
        const blend=Math.min(1,age/.75)*Math.min(1,Math.max(0,(4.8-age)/1.25));
        const k=blend*blend*(3-2*blend),yaw=actor.renderYaw;
        normalCamera.copy(camera.position);
        const normalLook=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(20).add(normalCamera);
        camera.position.lerp(new THREE.Vector3(actor.render.x+Math.sin(yaw)*7+Math.cos(yaw)*4,actor.render.y+6.1,actor.render.z+Math.cos(yaw)*7-Math.sin(yaw)*4),k);
        actor.avatar.head.updateWorldMatrix(true,false);actor.avatar.head.localToWorld(cinematicTarget.set(0,.4,.4));
        camera.lookAt(normalLook.lerp(cinematicTarget,k));return;
      }
      const age=introAge()/1000;normalCamera.copy(camera.position);
      if(age<2){camera.position.set(0,17,38);cinematicTarget.set(-5,38-age*5,-20);}
      else {camera.position.set(38,35,52);cinematicTarget.set(0,2,0);}
      if(age>5.7){const k=Math.min(1,(age-5.7)/1.3);camera.position.lerp(normalCamera,k*k*(3-2*k));const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(25).add(normalCamera);cinematicTarget.lerp(forward,k);}
      camera.lookAt(cinematicTarget);
    },
    knockout(id){const actor=players?.get(id);if(actor)actor.avatar.rouletteSleeping=true;soul(id,`${match?.startedAt}:${id}`);},
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
          if(event.poisoned&&elapsed>3.9&&!knockoutPlayed){knockoutPlayed=true;if(actor){actor.avatar.rouletteSleeping=true;soul(event.id,`${match.startedAt}:${event.id}`);sfx.thud();}}
        }
      }else{atSeat(match?.typerId);cup.position.lerp(target,1-Math.exp(-dt*8));}
      for(const owl of owls)owl.userData.update?.(t,dt);
      for(const h of hazards){
        const fall=Math.max(0,Math.min(1,(introAge()/1000-2.1-h.i*.4)/1.4));
        h.meteor.visible=fall>0;h.crater.visible=fall>.92;h.crater.scale.setScalar(Math.min(1,Math.max(.01,(fall-.92)/.08)));
        h.meteor.position.set(h.h.x+(1-fall)*25,1.0+(1-fall)*70,h.h.z-(1-fall)*32);h.meteor.rotation.y=fall*2;h.trail.userData.update(t);h.trail.scale.y=1+(1-fall)*.7;
        if(fall>=1&&!h.impacted){h.impacted=true;sfx.impact();}
        h.flames.userData.update(t);h.glow.intensity=10+Math.sin(t*11)*3;
      }
      for(const fire of burningTrees)fire.userData.update(t);
      if(meteorDrop){
        const remaining=Math.max(0,Math.min(1,(meteorLands-now)/2400));
        treasure.visible=true;treasure.position.set(meteorDrop.x+remaining*28,.8+remaining*65,meteorDrop.z-remaining*25);
        treasureRock.rotation.set(t*.4,t*.7,0);treasureFire.userData.update(t);treasureFire.scale.y=remaining>0?1.7:.6;
        treasureLabel.visible=remaining===0;treasureLabel.anchor.set(meteorDrop.x,4,meteorDrop.z);
      }
      for(let i=ghosts.length-1;i>=0;i--){const g=ghosts[i],age=(now-g.start)/1000;g.label.anchor.copy(g.base).add(new THREE.Vector3(Math.sin(age*3)*.7,age*3.5,0));g.label.el.style.opacity=String(Math.max(0,1-age/4));if(age>4){g.label.destroy();ghosts.splice(i,1);}}
    },
    debug:()=>({active,meteor:meteorDrop, burningTrees:burningTrees.length,cup:cup.position.toArray(),pot:pot.el.textContent,owls:owls.length,cashCount,rimError,ghosts:ghosts.length,craters:hazards.filter(h=>h.impacted).length,cinematic:active&&introAge()<ROULETTE_INTRO_MS}),
  };
}
