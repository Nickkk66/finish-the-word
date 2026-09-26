import * as THREE from 'three';
import { Label } from './labels.js';
import { buildPet } from './cosmetics.js';
import { DECK, seatX, seatZ } from './layout.js';
import { LAYOUT } from '../shared/constants.js';

export function createRouletteScene(scene, labels, trees) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const light = new THREE.PointLight('#bd8dff', 0, 42, 1.3); light.position.set(0, 8, 0); root.add(light);
  const ring = new THREE.Mesh(new THREE.RingGeometry(9.7, 11.4, 96), new THREE.MeshBasicMaterial({ color: '#b67bff', transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = DECK.top + .025; root.add(ring);
  const cup = new THREE.Group(); root.add(cup);
  const gold = new THREE.MeshStandardMaterial({ color: '#c7a454', metalness: .7, roughness: .3 });
  const liquid = new THREE.MeshStandardMaterial({ color: '#9f46d9', emissive: '#48135d', roughness: .2 });
  const part = (geo, mat, y) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.y = y; cup.add(mesh); };
  part(new THREE.CylinderGeometry(.47, .26, .65, 24, 1, true), gold, .57);
  part(new THREE.CylinderGeometry(.11, .14, .48, 16), gold, .18);
  part(new THREE.CylinderGeometry(.35, .38, .1, 24), gold, -.08);
  part(new THREE.CylinderGeometry(.41, .41, .025, 24), liquid, .82);
  const cash = new THREE.Group(); cash.position.y = DECK.top + LAYOUT.tableHeight + .1; root.add(cash);
  const banknote = new THREE.BoxGeometry(.82,.11,.4);
  const green = new THREE.MeshStandardMaterial({ color:'#6bca88', roughness:.85 });
  const band = new THREE.MeshStandardMaterial({color:'#ebd9aa'});
  for (let i=0;i<48;i++) {
    const bundle = new THREE.Group();
    bundle.add(new THREE.Mesh(banknote, green));
    const strip = new THREE.Mesh(new THREE.BoxGeometry(.13,.12,.42),band); bundle.add(strip);
    const layer = Math.floor(i/8), angle = i * 2.4;
    bundle.position.set(Math.cos(angle)*(.5+(i%3)*.22),layer*.13,Math.sin(angle)*(.5+(i%3)*.22));
    bundle.rotation.y = angle; cash.add(bundle);
  }
  const pot = new Label(labels, 'w-roulette-pot', { maxDist:90, scaleRef:26, minScale:.55, maxScale:1.2 });
  pot.el.style.cssText = 'display:none;padding:6px 14px;border:2px solid #d6ba73;border-radius:14px;background:#181324dd;color:#f5d680;font:700 22px Fredoka,sans-serif;white-space:nowrap;';
  pot.anchor.set(0, DECK.top + LAYOUT.tableHeight + 2.1,0);
  pot.visible = false;
  const owls = [];
  for (const tree of trees.slice(0, 8)) {
    const owl = buildPet('owl'); owl.scale.setScalar(.6);
    const angle = Math.atan2(-tree.x, -tree.z);
    const perch = tree.perchRadius;
    owl.position.set(tree.x + Math.sin(angle)*perch,tree.y-.35,tree.z+Math.cos(angle)*perch);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,perch,8),new THREE.MeshStandardMaterial({color:'#644b37'}));
    branch.position.set(tree.x + Math.sin(angle)*perch/2,tree.y-.42,tree.z+Math.cos(angle)*perch/2);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.sin(angle),0,Math.cos(angle)));
    root.add(branch);
    owl.rotation.y = angle; root.add(owl); owls.push(owl);
  }
  let active=false, match=null, players=null, previousEvent='', eventStart=0, event=null, knockoutPlayed=false;
  const target = new THREE.Vector3(), from = new THREE.Vector3();
  const y = DECK.top + LAYOUT.tableHeight + .16;
  cup.position.set(0,y,4.5);
  function atSeat(id, radius=4.7) {
    const seat = players?.get(id)?.seat;
    return target.set(seat>=0?seatX(seat,radius):0,y,seat>=0?seatZ(seat,radius):4.5);
  }
  return {
    set(on, m, entities) {
      active=on; root.visible=on; pot.visible=on; players=entities; match=m;
      if (!on) { previousEvent=''; event=null; return; }
      const total = m?.roulette?.pot || [...entities.values()].reduce((sum,e)=>sum+(e.data.rouletteBet||0),0);
      pot.el.textContent=`${total.toLocaleString()} COINS`;
      const count = total ? Math.min(48,Math.max(2,Math.ceil(Math.sqrt(total)/2))) : 0;
      cash.children.forEach((bundle,i)=>bundle.visible=i<count);
      const next=m?.roulette?.event;
      const key=next?`${m.startedAt}:${next.serial}`:'';
      if (next && key!==previousEvent) {
        previousEvent=key; event=next; eventStart=performance.now(); knockoutPlayed=false;
        from.copy(cup.position);
        if(next.action==='drink') players.get(next.id)?.avatar.sip();
      }
      if (!next) event=null;
    },
    update(t,dt) {
      if(!active)return;
      light.intensity=40+Math.sin(t*2)*4;
      ring.material.opacity=.25+Math.sin(t*1.8)*.08;
      ring.rotation.z=t*.025;
      const elapsed=(performance.now()-eventStart)/1000;
      cup.rotation.set(0,0,0);
      if(event && match?.phase==='rouletteReveal') {
        if(event.action==='pass') {
          atSeat(event.next);
          const k=Math.min(1,elapsed/.7), eased=k*k*(3-2*k);
          cup.position.lerpVectors(from,target,eased); cup.position.y+=Math.sin(k*Math.PI)*.12;
          cup.rotation.z=Math.sin(k*Math.PI)*.18;
        } else {
          atSeat(event.id);
          const k=Math.sin(Math.min(1,elapsed/1.5)*Math.PI);
          cup.position.copy(target);
          const actor=players.get(event.id);
          if(actor) { cup.position.lerp(new THREE.Vector3(actor.render.x*.9,actor.render.y+5.1,actor.render.z*.9),k); cup.rotation.z=-k*.65; }
          if(event.poisoned && elapsed>1.25 && !knockoutPlayed) { knockoutPlayed=true; if(actor) { actor.avatar.rouletteSleeping=true; actor.stack.flair('CURSED!', '#c69bff'); } }
        }
      } else { atSeat(match?.typerId); cup.position.lerp(target,1-Math.exp(-dt*8)); }
      for(const owl of owls) owl.userData.update?.(t,dt);
    },
    debug: () => ({active,cup:cup.position.toArray(),pot:pot.el.textContent,owls:owls.length}),
  };
}
