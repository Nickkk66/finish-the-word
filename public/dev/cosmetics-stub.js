// THROWAWAY stand-in for /js/world/cosmetics.js, used by world.html?stub (import-map
// override) to test the world without the real models. Same API, placeholder models.

import * as THREE from 'three';
import { BLOCKS, PETS_BY_ID } from '/js/shared/catalog.js';

const COLORS = { wooden: '#9a6a3f', glass: '#9fe3ff', goop: '#7ee081', toilet: '#f2f2f2', slime: '#57d957', flower: '#ff8fd1', swing: '#c08040', gamer: '#e53935', electric: '#ffd43b', throne: '#ffb300' };

const box = (w, h, d, color, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
};

export function buildChair(id) {
  const c = COLORS[id] ?? '#9a6a3f';
  const g = new THREE.Group();
  g.add(box(2.4, 0.3, 2.4, c, 0, 1.85, 0), box(2.4, 2.6, 0.3, c, 0, 3.2, -1.05));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.3, 1.7, 0.3, c, x, 0.85, z));
  return g;
}

export function buildPet(id) {
  const p = PETS_BY_ID[id]?.model ?? { body: '#cccccc', accent: '#ffffff' };
  const g = new THREE.Group();
  g.add(box(1, 0.8, 1.2, p.body, 0, 0.4, 0), box(0.8, 0.7, 0.7, p.body, 0, 1.0, 0.4), box(0.5, 0.3, 0.1, p.accent, 0, 0.95, 0.76));
  return g;
}

export function buildLuckyBlock(id) {
  const color = BLOCKS.find((b) => b.id === id)?.color ?? '#ffd43b';
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, 128, 128);
  x.font = 'bold 96px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#fff';
  x.fillText('?', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const cube = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial({ map: tex }));
  cube.position.y = 1.5;
  const g = new THREE.Group();
  g.add(cube);
  g.userData.update = (t) => {
    cube.rotation.y = t * 0.6;
    cube.position.y = 1.6 + Math.sin(t * 2) * 0.15;
  };
  return g;
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose(); m.dispose(); });
  });
}
