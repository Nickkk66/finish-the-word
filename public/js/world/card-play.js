import * as THREE from 'three';
import { CARDS, CARDS_BY_ID } from '../shared/catalog.js';
import { cardArt } from '../ui/art.js';
import { Label } from './labels.js';
import { DECK, seatAngle, seatX, seatZ, seatYaw } from './layout.js';
import { LAYOUT } from '../shared/constants.js';

// Landed cards and arrows are instanced by art, so history adds no draw calls.
export function createCardPlay(scene, players, labels) {
  const geometry = new THREE.BoxGeometry(.94,.035,1.26), face = new THREE.PlaneGeometry(.9,1.2);
  const paper = new THREE.MeshLambertMaterial({color:'#fff3da'}), art = new Map();
  const usedSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><circle cx="64" cy="64" r="58" fill="#159659" stroke="white" stroke-width="7"/><path d="M31 63 54 84 98 39" fill="none" stroke="white" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const usedTexture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(usedSvg)}`);
  usedTexture.colorSpace = THREE.SRGBColorSpace;
  const usedMaterial = new THREE.MeshBasicMaterial({map:usedTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false});
  const usedGeometry = new THREE.PlaneGeometry(.34,.34);
  const arrowGeometry = new THREE.BufferGeometry();
  arrowGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.055,0,0,.055,0,0,.055,0,.5,-.055,0,0,.055,0,.5,-.055,0,.5,-.18,0,.45,.18,0,.45,0,0,.8],3));
  arrowGeometry.computeVertexNormals();
  const arrowMaterial = new THREE.MeshBasicMaterial({color:'#ffe49a',side:THREE.DoubleSide});
  for(const def of CARDS){
    const svg=cardArt(def);svg.setAttribute('width','240');svg.setAttribute('height','300');
    const texture=new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`);
    texture.colorSpace=THREE.SRGBColorSpace;
    art.set(def.id,new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));
  }
  const y=DECK.top+LAYOUT.tableHeight+.09;
  const trays=[];
  const shelfMaterial=new THREE.MeshLambertMaterial({color:'#674a32'});
  const shelfGeometry=new THREE.BoxGeometry(1.35,.15,1.65),legGeometry=new THREE.BoxGeometry(.18,LAYOUT.tableHeight,.18);
  const trayGeometry=new THREE.BoxGeometry(1.1,.18,1.4);
  for(let seat=0;seat<8;seat++){
    const yaw=seatYaw(seat),group=new THREE.Group();
    const deck=new THREE.Mesh(trayGeometry,paper),top=new THREE.Mesh(face,art.get(CARDS[0].id));
    top.rotation.x=-Math.PI/2;top.position.y=.1;group.add(deck,top);
    group.position.set(seatX(seat,5.65)+Math.cos(yaw)*1.5,y+.09,seatZ(seat,5.65)-Math.sin(yaw)*1.5);
    const shelf=new THREE.Mesh(shelfGeometry,shelfMaterial),leg=new THREE.Mesh(legGeometry,shelfMaterial);
    shelf.position.y=-.18;leg.position.y=-LAYOUT.tableHeight/2-.2;group.add(shelf,leg);
    group.rotation.y=yaw;scene.add(group);trays.push(group);
  }
  const cards=[],seen=new Set(),batches=[],hitMeshes=new Map();
  const hand=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0),direction=new THREE.Vector3(),look=new THREE.Vector3(),normalLook=new THREE.Vector3(),shot=new THREE.Vector3(),dummy=new THREE.Object3D();
  const heldOffset = new THREE.Vector3();
  const hoverRay = new THREE.Raycaster(), hoverPoint = new THREE.Vector2();
  const hoverLabel = new Label(labels,'w-card-result',{maxDist:100,scaleRef:24,minScale:.6,maxScale:1});
  hoverLabel.el.style.cssText='white-space:normal;min-width:175px;max-width:250px;padding:8px 12px;border:2px solid #eac889;border-radius:12px;background:#171a2bf2;color:#fff;font:600 16px Fredoka,sans-serif;text-align:center;';
  hoverLabel.visible=false;
  let event=null,played=0;
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  function rebuild(){
    for(const mesh of batches){scene.remove(mesh);mesh.dispose();}batches.length=0;hitMeshes.clear();hoverLabel.visible=false;
    for(const def of CARDS){
      const items=cards.filter(i=>i.cardId===def.id&&i.landed);if(!items.length)continue;
      const body=new THREE.InstancedMesh(geometry,paper,items.length),stamp=new THREE.InstancedMesh(face,art.get(def.id),items.length),arrows=new THREE.InstancedMesh(arrowGeometry,arrowMaterial,items.length),checks=new THREE.InstancedMesh(usedGeometry,usedMaterial,items.length);
      items.forEach((item,i)=>{
        const scale=item.scale;
        dummy.position.copy(item.to);dummy.rotation.set(0,item.yaw,0);dummy.scale.setScalar(scale);dummy.updateMatrix();body.setMatrixAt(i,dummy.matrix);
        dummy.position.y+=.021;dummy.rotation.x=-Math.PI/2;dummy.updateMatrix();stamp.setMatrixAt(i,dummy.matrix);
        dummy.position.x+=Math.cos(item.yaw)*.26*scale+Math.sin(item.yaw)*.39*scale;
        dummy.position.z+=-Math.sin(item.yaw)*.26*scale+Math.cos(item.yaw)*.39*scale;
        dummy.position.y+=.004;dummy.updateMatrix();checks.setMatrixAt(i,dummy.matrix);
        dummy.rotation.set(0,item.yaw,0);dummy.position.copy(item.to);dummy.position.x+=Math.sin(item.yaw)*.72*scale;dummy.position.z+=Math.cos(item.yaw)*.72*scale;dummy.position.y+=.035;dummy.updateMatrix();arrows.setMatrixAt(i,dummy.matrix);
      });
      for(const mesh of [body,stamp,checks,arrows]){mesh.frustumCulled=false;scene.add(mesh);batches.push(mesh);}
      hitMeshes.set(stamp,items);
    }
  }
  function settle(item){
    item.landed=true;scene.remove(item.card);item.card=null;rebuild();
  }
  function add(actorId,targetId,cardId,message,data={},restore=false){
    if(data.eventId&&seen.has(data.eventId))return;
    const actor=players.get(actorId),target=players.get(targetId),def=CARDS_BY_ID[cardId];
    const seat=data.targetSeat??target?.seat;
    if(!def||!Number.isInteger(seat)||seat<0||seat>=8||(!restore&&!actor))return;
    if(data.eventId)seen.add(data.eventId);
    if(event){settle(event);event=null;}
    const card=new THREE.Mesh(geometry,paper),stamp=new THREE.Mesh(face,art.get(cardId));
    card.rotation.order='YXZ';
    stamp.rotation.x=-Math.PI/2;stamp.position.y=.019;card.add(stamp);scene.add(card);
    const label=new Label(labels,'w-card-result',{maxDist:100,scaleRef:24,minScale:.6,maxScale:1});
    label.el.textContent=`${def.name} · ${message||def.description}`;
    label.el.style.cssText=`display:none;white-space:normal;min-width:180px;max-width:280px;padding:8px 12px;border:2px solid ${def.color};border-radius:12px;background:#171a2bee;color:#fff;font:600 16px Fredoka,sans-serif;text-align:center;`;
    const count=cards.filter(item=>item.seat===seat).length;
    const angle=seatAngle(seat),radius=4.55-Math.floor(count/3)*.58,side=(count%3-1)*.92;
    const destination=new THREE.Vector3(seatX(seat,radius)+Math.cos(angle)*side,y+.003*count,seatZ(seat,radius)-Math.sin(angle)*side);
    const item={actor,targetId,seat,cardId,card,label,style:data.style==='deck'?'deck':'pocket',started:performance.now(),from:null,to:destination,yaw:seatYaw(seat),scale:.78,landed:false};
    cards.push(item);played++;rebuild();
    if(restore){settle(item);item.started=-Infinity;}else event=item;
  }
  return {
    setVisible(on){for(const tray of trays)tray.visible=on;},
    clear(){if(event?.card)scene.remove(event.card);event=null;for(const item of cards)item.label.destroy();cards.length=0;seen.clear();rebuild();hoverLabel.visible=false;},
    restore(history){for(const item of history)add(item.actorId,item.targetId,item.cardId,null,item,true);},
    play:add,
    update(now){
      for(const item of cards){item.label.visible=item===cards.at(-1)&&now-item.started>2800&&now-item.started<6900;item.label.anchor.copy(item.to).setY(y+1.5);}
      if(!event)return;
      const item=event,{actor,card}=item,age=(now-item.started)/1000;
      if(age>=4.5||!players.has(actor.id)){settle(item);event=null;return;}
      const av=actor.avatar;
      const isDeck=item.style==='deck';
      // Only rig offsets change: the server-owned seat and avatar root never move.
      if(isDeck){
        const rise=smooth(age/.55)*(1-smooth((age-3.55)/.8));
        av.body.position.y+=.65*rise;
        av.lLeg.rotation.x*=1-rise;av.rLeg.rotation.x*=1-rise;
        const reach=smooth((age-.4)/.35)*(1-smooth((age-1.3)/.35));
        av.spin.rotation.x+=.75*reach;av.body.position.z+=.15*reach;av.body.position.y-=.55*reach;
        av.head.rotation.x+=.18*smooth((age-1.3)/.3)*(1-smooth((age-2.9)/.2));
        av.head.rotation.y+=Math.sin((age-2)*6)*.25*smooth((age-2)/.2)*(1-smooth((age-2.85)/.2));
      }
      const release=isDeck?3.05:1.65;
      if(age<release){
        let k=smooth((age-.2)/.8);
        if(isDeck){
          // Reach down to the near-edge tray, then bring the face of the card to eye level.
          const reading=smooth((age-1.1)/.6);
          direction.set(-1.05*reading,-1.1+1.02*reading,1.2-.22*reading).normalize();
          if(age<1.3){
            av.rArm.parent.updateWorldMatrix(true,false);
            direction.copy(trays[actor.seat].position).setY(y+.21);
            av.rArm.parent.worldToLocal(direction);direction.sub(av.rArm.position).normalize();
          }
        }else direction.set(-.22,-1.48+1.35*k,.08+1.42*k).normalize();
        av.rArm.quaternion.setFromUnitVectors(down,direction);av.rArm.updateWorldMatrix(true,false);
        av.rArm.localToWorld(hand.set(0,-1.5,0));
        if(isDeck&&age<1.05){card.position.copy(trays[actor.seat].position).setY(y+.21);}else if(isDeck&&age<1.4)card.position.lerpVectors(trays[actor.seat].position.clone().setY(y+.21),hand,smooth((age-1.05)/.35));else card.position.copy(hand);
        if(isDeck&&age>=1.4)card.position.add(heldOffset.set(Math.sin(actor.renderYaw)*.65,.2,Math.cos(actor.renderYaw)*.65));
        const heldAngle=isDeck&&age<1.05?0:Math.PI/2-.22;
        card.rotation.set(heldAngle,actor.renderYaw,-.2*smooth(age/.5));
        card.scale.setScalar(.65+.35*smooth(age/.25));item.from=card.position.clone();
      }else{
        const k=smooth((age-release)/(isDeck?.85:1.6));
        card.position.lerpVectors(item.from||actor.render,item.to,k);card.position.y+=Math.sin(k*Math.PI)*(isDeck?1.2:.3);
        card.rotation.set((Math.PI/2-.22)*(1-k),THREE.MathUtils.lerp(actor.renderYaw,item.yaw,k),-.2*(1-k));card.scale.setScalar(THREE.MathUtils.lerp(1,item.scale,k));
      }
    },
    camera(camera,zone,playing){
      if(!event||zone!=='island'||!playing)return;
      const age=(performance.now()-event.started)/1000,k=smooth(age/.2)*(1-smooth((age-4)/.5)),a=event.actor,p=a.render,yaw=a.renderYaw;
      normalLook.set(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(15).add(camera.position);
      if(event.style==='deck'&&age>1.5&&age<3){
        // Give the hand and the face of the held card room in the close-up.
        shot.set(p.x+Math.sin(yaw)*6-Math.cos(yaw)*1.8,p.y+6.1,p.z+Math.cos(yaw)*6+Math.sin(yaw)*1.8);
        look.copy(event.card.position).lerp(direction.set(p.x,p.y+4.8,p.z),.35);
      }else{
        shot.set(p.x+Math.sin(yaw)*3.5+Math.cos(yaw)*4.8,p.y+7.3,p.z+Math.cos(yaw)*3.5-Math.sin(yaw)*4.8);
        look.copy(event.card.position).lerp(p,.12);look.y+=.4;
      }
      camera.position.lerp(shot,k);camera.lookAt(normalLook.lerp(look,k));
    },
    hover(camera,pointer,rect){
      if(!pointer||!hitMeshes.size||!rect.width||!rect.height){hoverLabel.visible=false;return;}
      hoverPoint.set((pointer.x-rect.left)/rect.width*2-1,1-(pointer.y-rect.top)/rect.height*2);
      hoverRay.setFromCamera(hoverPoint,camera);
      const hit=hoverRay.intersectObjects([...hitMeshes.keys()],false)[0];
      const item=hit&&hitMeshes.get(hit.object)?.[hit.instanceId];
      hoverLabel.visible=!!item && performance.now()-item.started>=6900;
      if(item){hoverLabel.el.textContent=CARDS_BY_ID[item.cardId].description;hoverLabel.anchor.copy(item.to).setY(y+1.2);}
    },
    debug:()=>({active:!!event,style:event?.style,played,age:event?(performance.now()-event.started)/1000:null,draws:batches.length,landed:cards.filter(i=>i.landed).map(i=>({targetId:i.targetId,cardId:i.cardId,position:i.to.toArray(),artLoaded:!!art.get(i.cardId).map.image?.width})),position:event?.card?.position.toArray()}),
  };
}
