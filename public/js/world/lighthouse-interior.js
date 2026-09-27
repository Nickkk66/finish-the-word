// A separate, walkable space that reads as the ground floor inside the island lighthouse.
import * as THREE from 'three';

export const LIGHTHOUSE_ROOM = Object.freeze({
  center: { x: 300, z: 0 },
  spawn: { x: 300, y: 0, z: 1.5, ry: Math.PI },
  exit: { x: 300, y: 2.3, z: 9.1 },
  radius: 9.2,
});

export function createLighthouseInterior(scene) {
  const room = new THREE.Group();
  room.position.set(LIGHTHOUSE_ROOM.center.x, 0, LIGHTHOUSE_ROOM.center.z);
  room.visible = false;
  scene.add(room);

  const wallPaint = new THREE.MeshLambertMaterial({ color: '#e4d7bc', side: THREE.BackSide });
  const wood = new THREE.MeshLambertMaterial({ color: '#624334' });
  const darkWood = new THREE.MeshLambertMaterial({ color: '#35273c' });
  const brass = new THREE.MeshLambertMaterial({ color: '#dbad62', emissive: '#5d3612', emissiveIntensity: .15 });
  const glass = new THREE.MeshBasicMaterial({ color: '#a9dfff' });
  const add = (geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = mesh.receiveShadow = true;
    room.add(mesh);
    return mesh;
  };
  const box = (w, h, d, material, x, y, z, ry = 0) => add(new THREE.BoxGeometry(w, h, d), material, x, y, z, 0, ry);

  // Solid walls and ceiling keep the teleport illusion convincing in third person.
  add(new THREE.CylinderGeometry(11.7, 11.7, .45, 40), darkWood, 0, -.24, 0);
  add(new THREE.CylinderGeometry(11.2, 11.2, .05, 40), new THREE.MeshLambertMaterial({ color: '#a4774e' }), 0, .015, 0);
  add(new THREE.CylinderGeometry(11.7, 11.7, 9.2, 40, 1, true), wallPaint, 0, 4.6, 0);
  add(new THREE.CylinderGeometry(11.8, 11.8, .5, 40), darkWood, 0, 9.3, 0);
  for (const y of [0.65, 7.8, 8.55]) add(new THREE.TorusGeometry(11.45, .17, 8, 48), wood, 0, y, 0, Math.PI / 2);
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10;
    box(.2, 9, .42, wood, Math.sin(a) * 11.25, 4.5, Math.cos(a) * 11.25, a);
  }
  // Warm window niches and the lantern glow make the room recognizable from the tower.
  for (const a of [-1.15, 0, 1.15, 3.1]) {
    const x = Math.sin(a) * 11.24, z = Math.cos(a) * 11.24;
    box(2.1, 2.4, .13, darkWood, x, 5.4, z, a);
    box(1.6, 1.9, .16, glass, Math.sin(a) * 11.15, 5.4, Math.cos(a) * 11.15, a);
    box(.13, 2.2, .18, brass, x, 5.4, z, a);
    box(1.9, .13, .18, brass, x, 5.4, z, a);
  }
  const lamp = new THREE.PointLight('#ffdfa4', 75, 27, 1.5);
  lamp.position.set(0, 7.2, -1);
  room.add(lamp);
  add(new THREE.CylinderGeometry(.55, .55, 1.4, 16), new THREE.MeshBasicMaterial({ color: '#ffe2a0' }), 0, 8, -1);
  add(new THREE.CylinderGeometry(.75, .75, .12, 16), brass, 0, 8.75, -1);

  // A small play space awaits the hidden game; it remains decorative until its rules are chosen.
  add(new THREE.CylinderGeometry(3.3, 3.5, .42, 16), darkWood, 0, 1.3, -2.1);
  add(new THREE.CylinderGeometry(3.12, 3.12, .07, 16), new THREE.MeshLambertMaterial({ color: '#284e50' }), 0, 1.55, -2.1);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    box(.85, 1.1, .85, wood, Math.sin(a) * 2.6, .6, -2.1 + Math.cos(a) * 2.6, a);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    box(.64, .035, .95, new THREE.MeshLambertMaterial({ color: ['#d0b684', '#a777b5', '#c44c4c'][i] }), Math.sin(a) * .65, 1.61, -2.1 + Math.cos(a) * .65, a);
  }
  // A spiral of fixed wooden treads hints at the levels above without creating a false exit.
  for (let i = 0; i < 11; i++) {
    const a = i * .27 + 1.3;
    box(2.6, .19, 1.1, wood, Math.sin(a) * 8.9, .42 + i * .47, Math.cos(a) * 8.9, a);
  }

  // The interior return door has the same brass trim as the exterior entrance.
  box(2.45, 3.2, .2, darkWood, 0, 1.6, 10.85);
  box(.17, 3.45, .25, brass, -1.3, 1.73, 10.72);
  box(.17, 3.45, .25, brass, 1.3, 1.73, 10.72);
  box(2.8, .18, .25, brass, 0, 3.48, 10.72);
  add(new THREE.SphereGeometry(.12, 10, 8), brass, .83, 1.5, 10.66);
  add(new THREE.CircleGeometry(2, 32), new THREE.MeshBasicMaterial({ color: '#f4cc7f', transparent: true, opacity: .22, side: THREE.DoubleSide }), 0, .05, 8.8, -Math.PI / 2);

  return { room, exit: { ...LIGHTHOUSE_ROOM.exit } };
}
