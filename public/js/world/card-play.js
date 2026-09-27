import * as THREE from 'three';
import { CARDS_BY_ID } from '../shared/catalog.js';
import { DECK, seatX, seatZ } from './layout.js';
import { LAYOUT } from '../shared/constants.js';

export function createCardPlay(scene,players){
  const card=new THREE.Mesh(new THREE.BoxGeometry(.62,.025,.92),new THREE.MeshLambertMaterial({color:'#f4deaf',transparent:true}));card.visible=false;scene.add(card);
  const stamp=new THREE.Mesh(new THREE.PlaneGeometry(.5,.78),new THREE.MeshBasicMaterial({color:'#af84d6',side:THREE.DoubleSide}));stamp.rotation.x=-Math.PI/2;stamp.position.y=.014;card.add(stamp);
  const hand=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0),direction=new THREE.Vector3(),look=new THREE.Vector3(),normalLook=new THREE.Vector3(),shot=new THREE.Vector3();
  let event=null,played=0;
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  return {
    play(actorId,targetId,cardId){
      const actor=players.get(actorId),target=players.get(targetId);
      if(!actor||actor.seat<0||!target||target.seat<0)return;
      event={actor,started:performance.now(),from:null,to:new THREE.Vector3(seatX(target.seat,3.6),DECK.top+LAYOUT.tableHeight+.055,seatZ(target.seat,3.6)),yaw:actor.renderYaw};
      stamp.material.color.set(CARDS_BY_ID[cardId]?.color||'#af84d6');card.material.opacity=1;stamp.material.opacity=1;card.visible=true;played++;
    },
    update(now){
      if(!event)return;
      const age=(now-event.started)/1000,actor=event.actor;
      if(age>1.2||!players.has(actor.id)){event=null;card.visible=false;return;}
      if(age<.6){
        const k=smooth((age-.18)/.38);
        direction.set(-.22,-1.48+(1.28*k),.08+1.42*k).normalize();
        actor.avatar.rArm.quaternion.setFromUnitVectors(down,direction);
        actor.avatar.rArm.updateWorldMatrix(true,false);
        actor.avatar.rArm.localToWorld(hand.set(0,-1.5,0));
        card.position.copy(hand);card.rotation.set((1-k)*.85,actor.renderYaw+.14*k,0);
        card.scale.setScalar(.5+.5*smooth(age/.18));
        event.from=hand.clone();
      }else{
        const k=smooth((age-.6)/.45);
        if(!event.from)event.from=actor.render.clone().setY(event.to.y);
        card.position.lerpVectors(event.from,event.to,k);
        // Settle onto the felt immediately, then slide with a small natural rotation.
        card.position.y=THREE.MathUtils.lerp(event.from.y,event.to.y,smooth((age-.6)/.13));
        card.rotation.set(0,event.yaw+.14+.22*k,0);card.scale.setScalar(1);
        card.material.opacity=1-smooth((age-1.05)/.15);stamp.material.opacity=card.material.opacity;stamp.material.transparent=true;
      }
    },
    camera(camera,zone){
      if(!event||zone!=='island')return;
      const age=(performance.now()-event.started)/1000,k=smooth(age/.12)*(1-smooth((age-.92)/.28));
      const a=event.actor,p=a.render,yaw=event.yaw;
      normalLook.set(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(15).add(camera.position);
      shot.set(p.x+Math.sin(yaw)*3.5+Math.cos(yaw)*4.8,p.y+6.4,p.z+Math.cos(yaw)*3.5-Math.sin(yaw)*4.8);
      camera.position.lerp(shot,k);look.copy(card.position).lerp(p,.2);look.y+=.6;camera.lookAt(normalLook.lerp(look,k));
    },
    debug:()=>({active:!!event,played,position:card.position.toArray(),age:event?(performance.now()-event.started)/1000:null}),
  };
}
