import * as THREE from 'three';
import { CARDS, CARDS_BY_ID } from '../shared/catalog.js';
import { cardArt } from '../ui/art.js';
import { Label } from './labels.js';
import { DECK, seatX, seatZ, seatYaw } from './layout.js';
import { LAYOUT } from '../shared/constants.js';

export function createCardPlay(scene,players,labels){
  const geometry=new THREE.BoxGeometry(.94,.035,1.26),face=new THREE.PlaneGeometry(.9,1.2);
  const paper=new THREE.MeshLambertMaterial({color:'#fff3da'}),art=new Map();
  for(const def of CARDS){
    const svg=cardArt(def);svg.setAttribute('width','240');svg.setAttribute('height','300');
    const texture=new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`);
    texture.colorSpace=THREE.SRGBColorSpace;
    art.set(def.id,new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));
  }
  const cards=new Map(),hand=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0),direction=new THREE.Vector3(),look=new THREE.Vector3(),normalLook=new THREE.Vector3(),shot=new THREE.Vector3();
  let event=null,played=0;
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  function remove(id){const item=cards.get(id);if(!item)return;scene.remove(item.card);item.label.destroy();cards.delete(id);if(event===item)event=null;}
  function settle(item){item.card.position.copy(item.to);item.card.rotation.set(0,item.yaw+.1,0);item.card.scale.setScalar(1);item.landed=true;}
  return {
    clear(){for(const id of [...cards.keys()])remove(id);},
    play(actorId,targetId,cardId,message){
      const actor=players.get(actorId),target=players.get(targetId),def=CARDS_BY_ID[cardId];
      if(!def||!actor||actor.seat<0||actor.seat>=8||!target||target.seat<0||target.seat>=8)return;
      if(event)settle(event);
      remove(targetId);
      const card=new THREE.Mesh(geometry,paper),stamp=new THREE.Mesh(face,art.get(cardId));
      stamp.rotation.x=-Math.PI/2;stamp.position.y=.019;card.add(stamp);scene.add(card);
      const label=new Label(labels,'w-card-result',{maxDist:100,scaleRef:24,minScale:.6,maxScale:1});
      label.el.textContent=message||def.name;
      label.el.style.cssText=`display:none;white-space:normal;min-width:180px;max-width:260px;padding:8px 12px;border:2px solid ${def.color};border-radius:12px;background:#171a2bee;color:#fff;font:600 16px Fredoka,sans-serif;text-align:center;`;
      event={actor,targetId,seat:target.seat,cardId,card,label,started:performance.now(),from:null,to:new THREE.Vector3(seatX(target.seat,4.25),DECK.top+LAYOUT.tableHeight+.075,seatZ(target.seat,4.25)),yaw:seatYaw(target.seat),landed:false};
      cards.set(targetId,event);played++;
    },
    update(now){
      for(const [id,item] of cards){
        if(!players.has(id)||players.get(id).seat!==item.seat){remove(id);continue;}
        item.label.visible=now-item.started>950&&now-item.started<8500;
        item.label.anchor.copy(item.to).setY(item.to.y+1.4);
      }
      if(!event)return;
      const item=event,{actor,card}=item,age=(now-item.started)/1000;
      if(age>1.9||!players.has(actor.id)){settle(item);event=null;return;}
      if(age<.65){
        const k=smooth((age-.16)/.43);
        direction.set(-.22,-1.48+1.28*k,.08+1.42*k).normalize();
        actor.avatar.rArm.quaternion.setFromUnitVectors(down,direction);
        actor.avatar.rArm.updateWorldMatrix(true,false);
        actor.avatar.rArm.localToWorld(hand.set(0,-1.5,0));
        card.position.copy(hand);card.rotation.set((1-k)*.85,actor.renderYaw+.14*k,0);
        card.scale.setScalar(.5+.5*smooth(age/.16));item.from=hand.clone();
      }else{
        const k=smooth((age-.65)/.8);
        if(!item.from)item.from=actor.render.clone().setY(item.to.y);
        card.position.lerpVectors(item.from,item.to,k);
        card.position.y=THREE.MathUtils.lerp(item.from.y,item.to.y,smooth((age-.65)/.28))+.1*Math.sin(k*Math.PI);
        card.rotation.set(0,THREE.MathUtils.lerp(actor.renderYaw,item.yaw+.1,k),0);card.scale.setScalar(1);
        if(k===1)item.landed=true;
      }
    },
    camera(camera,zone){
      if(!event||zone!=='island')return;
      const age=(performance.now()-event.started)/1000,k=smooth(age/.16)*(1-smooth((age-1.4)/.5));
      const a=event.actor,p=a.render,yaw=a.renderYaw;
      normalLook.set(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(15).add(camera.position);
      shot.set(p.x+Math.sin(yaw)*3.5+Math.cos(yaw)*4.8,p.y+6.8,p.z+Math.cos(yaw)*3.5-Math.sin(yaw)*4.8);
      camera.position.lerp(shot,k);look.copy(event.card.position).lerp(p,.15);look.y+=.4;camera.lookAt(normalLook.lerp(look,k));
    },
    debug:()=>({active:!!event,played,age:event?(performance.now()-event.started)/1000:null,landed:[...cards.values()].filter(i=>i.landed).map(i=>({targetId:i.targetId,cardId:i.cardId,position:i.card.position.toArray(),artLoaded:!!art.get(i.cardId).map.image?.width})),position:event?.card.position.toArray()}),
  };
}
