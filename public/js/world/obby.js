import * as THREE from 'three';
import { OBBY, LAYOUT } from '../shared/constants.js';
import { buildPortal } from './cosmetics.js';
import { Sign } from './labels.js';

// Platform y is its center; spawn and checkpoint y are the walkable top surface.
export function coursePlatforms() {
  const list = [];
  const add = (x, top, z, w, d, kind = 'solid', extra = {}) => list.push({ x, y: top - .5, z, w, h: 1, d, kind, ...extra });
  add(600, 20, 0, 12, 12, 'checkpoint', { checkpoint: 0 });
  // A winding set of small islands rewards deliberate jumps over holding forward.
  for (let i = 1; i <= 12; i++) add(600 + Math.sin(i * .72) * 11, 20 + (i % 3) * .5, -i * 5.1, 4.6, 4.6);
  add(600, 21, -68, 12, 10, 'checkpoint', { checkpoint: 1 });
  // Kill-brick corridor runs east; jumping over six red bars is required.
  add(716, 21, -68, 222, 8);
  for (let i = 0; i < 6; i++) add(621 + i * 37, 22, -68, 1.3, 8, 'kill');
  add(832, 21, -68, 12, 10, 'checkpoint', { checkpoint: 2 });
  for (let i = 1; i <= 7; i++) add(832, 22, -68 - i * 6.3, 5.3, 5.3, 'solid', {
    move: { axis: 'x', amplitude: 3, speed: .72, phase: i * .55 },
  });
  add(832, 22, -119, 12, 12, 'checkpoint', { checkpoint: 3 });
  for (let i = 1; i <= 34; i++) add(832 - i * 6.1, 22, -119 + Math.sin(i * .5) * 4, 4.7, 5.5);
  // Wide platform for the sweeping bar, with room to time a jump.
  add(615, 22, -119, 16, 16);
  add(615, 23.2, -119, 14, .8, 'kill', { rotate: true });
  add(600, 22, -119, 10, 10);
  // Stair/truss climb to the final platform.
  for (let i = 1; i <= 8; i++) add(600 + (i % 2 ? -1.8 : 1.8), 22 + i, -119 - i * 3.3, 6.4, 4.2);
  add(OBBY.finish.x, OBBY.finish.y, OBBY.finish.z, 14, 12, 'finish');
  return list;
}

export function createObby(scene, labels) {
  const platforms = coursePlatforms();
  const group = new THREE.Group(); scene.add(group);
  const zoneSigns = [];
  const colors = { solid: '#7378e8', kill: '#ff254d', checkpoint: '#38dc86', finish: '#ffd24a' };
  const materials = Object.fromEntries(Object.entries(colors).map(([k, color]) => [k, new THREE.MeshStandardMaterial({
    color, roughness: .7, emissive: k === 'kill' ? color : '#000000', emissiveIntensity: .8,
  })]));
  const unit = new THREE.BoxGeometry(1, 1, 1);
  for (const p of platforms) {
    p.baseX = p.x; p.baseZ = p.z; p.dx = p.dz = 0;
    const mesh = new THREE.Mesh(unit, materials[p.kind]);
    mesh.position.set(p.x, p.y, p.z); mesh.scale.set(p.w, p.h, p.d);
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); p.mesh = mesh;
    if (p.kind === 'checkpoint') {
      const sign = new Sign(labels, { name: p.checkpoint === 0 ? 'SKY RUN · Jump to begin' : `CHECKPOINT ${p.checkpoint}`, sub: 'Green pads save your progress' });
      sign.anchor.set(p.x, p.y + 5, p.z);
      zoneSigns.push(sign);
    }
  }
  const portal = buildPortal(); portal.position.set(LAYOUT.portal.x, .25, LAYOUT.portal.z); scene.add(portal);
  const sign = new Sign(labels, { name: 'OBBY ➜ Play while you wait!' });
  sign.anchor.set(LAYOUT.portal.x, 9, LAYOUT.portal.z);
  const returnPortal = buildPortal();
  returnPortal.position.set(OBBY.finish.x, OBBY.finish.y, OBBY.finish.z - 3); group.add(returnPortal);
  const finishSign = new Sign(labels, { name: 'FINISH · 50 COINS', sub: 'Portal back to the island' });
  finishSign.anchor.set(OBBY.finish.x, OBBY.finish.y + 10, OBBY.finish.z);
  zoneSigns.push(finishSign);
  const trophy = new THREE.Mesh(new THREE.CylinderGeometry(1.6, .6, 2, 8), new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: .6, roughness: .25 }));
  trophy.position.set(OBBY.finish.x + 4, OBBY.finish.y + 2, OBBY.finish.z + 1); group.add(trophy);
  const startReturn = buildPortal(); startReturn.scale.setScalar(.6); startReturn.position.set(605, 20, 2); group.add(startReturn);
  const exitSign = new Sign(labels, { name: 'Return to island' }); exitSign.anchor.set(605, 26, 2);
  zoneSigns.push(exitSign);
  function setVisible(on) { group.visible = on; for (const s of zoneSigns) s.visible = on; }
  setVisible(false);
  function update(t, dt) {
    const epoch = Date.now() / 1000;
    for (const p of platforms) {
      const oldX = p.x, oldZ = p.z;
      if (p.move) {
        const value = Math.sin(epoch * p.move.speed + p.move.phase) * p.move.amplitude;
        if (p.move.axis === 'x') p.x = p.baseX + value;
        else p.z = p.baseZ + value;
      }
      p.dx = p.x - oldX; p.dz = p.z - oldZ;
      p.angle = p.rotate ? epoch * .85 : 0;
      p.mesh.position.set(p.x, p.y, p.z); p.mesh.rotation.y = p.angle;
    }
    portal.userData.update?.(t, dt); returnPortal.userData.update?.(t, dt); startReturn.userData.update?.(t, dt);
    trophy.rotation.y = t * .8;
  }
  return { platforms, update, setVisible, startReturn: { x: 605, y: 20, z: 2 }, returnPortal: { x: OBBY.finish.x, y: OBBY.finish.y, z: OBBY.finish.z - 3 } };
}
