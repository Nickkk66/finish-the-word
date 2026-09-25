// Island decoration: blocky cube-leaf trees, bushes, flowers, rocks, wooden fences, the
// red/white lighthouse, the spawn pad and the pier. Everything repeated is instanced and
// placed with a seeded PRNG so every client builds (and collides with) the same island.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { barkTexture, leavesTexture, spawnDecalTexture, stoneTexture, woodTexture } from './textures.js';
import { colorMaterial } from './materials.js';
import {
  LIGHTHOUSE,
  PATHS,
  PIER,
  SPAWN_PAD,
  distToSand,
  isFreeForDecor,
  terrainHeight,
} from './layout.js';
import { TAU, mulberry32 } from './math.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** items: [{ x, y, z, rx?, ry?, rz?, sx, sy?, sz?, color? }] */
function instanced(geo, material, items, { cast = true, receive = true } = {}) {
  const mesh = new THREE.InstancedMesh(geo, material, items.length);
  items.forEach((it, i) => {
    _p.set(it.x, it.y, it.z);
    _q.setFromEuler(_e.set(it.rx || 0, it.ry || 0, it.rz || 0));
    _s.set(it.sx, it.sy ?? it.sx, it.sz ?? it.sx);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    if (it.color) mesh.setColorAt(i, _c.set(it.color));
  });
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * Builds all decoration into `scene`.
 * @returns {{ colliders: {x:number,z:number,r:number}[] }}
 */
export function createProps(scene) {
  const colliders = [];
  const rnd = mulberry32(2024);

  const leafMat = new THREE.MeshLambertMaterial({ map: leavesTexture() });
  scene.add(buildTrees(rnd, leafMat, colliders));
  scene.add(buildBushes(rnd, leafMat));
  scene.add(buildFlowers(rnd));
  scene.add(buildRocks(rnd, colliders));
  scene.add(buildFences(colliders));
  scene.add(buildLighthouse(colliders));
  scene.add(buildSpawnPad());
  scene.add(buildPier());

  return { colliders };
}

// ---- Vegetation ------------------------------------------------------------------------------

const LEAF_TINTS = ['#ffffff', '#e8f7d8', '#d6efc2', '#f4ffe6', '#cde8b5', '#e0f5c8'];

function buildTrees(rnd, leafMat, colliders) {
  const trunks = [];
  const leaves = [];
  const placed = [];
  for (let tries = 0; placed.length < 60 && tries < 6000; tries++) {
    const a = rnd() * TAU;
    const r = 22 + Math.sqrt(rnd()) * 33;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!isFreeForDecor(x, z, 3.4)) continue;
    if (placed.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 49)) continue;
    placed.push({ x, z });
    const h = 4.5 + rnd() * 3.5;
    const s = 5 + rnd() * 2.4;
    const ry = (rnd() - 0.5) * 0.9;
    const kind = rnd();
    const color = LEAF_TINTS[(rnd() * LEAF_TINTS.length) | 0];
    trunks.push({ x, y: 0, z, ry, sx: 1.3, sy: h + 1, sz: 1.3 });
    const cy = h + s * 0.32;
    leaves.push({ x, y: cy, z, ry, sx: s, sy: s * 0.82, sz: s, color });
    if (kind < 0.65) {
      leaves.push({ x: x + (rnd() - 0.5) * 1.2, y: cy + s * 0.55, z: z + (rnd() - 0.5) * 1.2, ry: ry + 0.3, sx: s * 0.62, sy: s * 0.55, sz: s * 0.62, color });
    }
    if (kind > 0.45) {
      const b = rnd() * TAU;
      leaves.push({ x: x + Math.cos(b) * s * 0.5, y: cy - s * 0.2, z: z + Math.sin(b) * s * 0.5, ry: ry + 0.5, sx: s * 0.5, sy: s * 0.45, sz: s * 0.5, color });
    }
    colliders.push({ x, z, r: 1.0 });
  }
  const trunkGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const group = new THREE.Group();
  group.add(instanced(trunkGeo, new THREE.MeshLambertMaterial({ map: barkTexture() }), trunks));
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), leafMat, leaves));
  return group;
}

function buildBushes(rnd, leafMat) {
  const items = [];
  const tryAdd = (x, z) => {
    if (!isFreeForDecor(x, z, 1.3)) return;
    if (Math.hypot(x, z) > 55) return;
    if (items.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < 9)) return;
    const s = 1.6 + rnd() * 1.1;
    items.push({ x, y: s * 0.34, z, ry: rnd() * TAU, sx: s, sy: s * 0.8, sz: s, color: LEAF_TINTS[(rnd() * 3) | 0] });
  };
  // Line some path edges, then sprinkle a few in the open.
  for (let i = 0; i < 160 && items.length < 34; i++) {
    const path = PATHS[(rnd() * PATHS.length) | 0];
    const k = (rnd() * (path.points.length - 1)) | 0;
    const [ax, az] = path.points[k];
    const [bx, bz] = path.points[k + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const side = rnd() < 0.5 ? -1 : 1;
    const off = path.width / 2 + 2.1 + rnd() * 0.8;
    tryAdd(ax + (-(bz - az) / len) * off * side, az + ((bx - ax) / len) * off * side);
  }
  for (let i = 0; i < 200 && items.length < 50; i++) {
    const a = rnd() * TAU;
    const r = 18 + rnd() * 36;
    tryAdd(Math.cos(a) * r, Math.sin(a) * r);
  }
  return instanced(new THREE.BoxGeometry(1, 1, 1), leafMat, items);
}

const FLOWER_COLORS = ['#ff4d6d', '#ffd23f', '#ffffff', '#ff8fd1', '#b388ff', '#ff9f43', '#6ec6ff'];

function buildFlowers(rnd) {
  const stems = [];
  const heads = [];
  let patches = 0;
  for (let tries = 0; patches < 20 && tries < 2000; tries++) {
    const a = rnd() * TAU;
    const r = 15 + rnd() * 39;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    if (!isFreeForDecor(cx, cz, 2.8)) continue;
    patches++;
    const c1 = FLOWER_COLORS[(rnd() * FLOWER_COLORS.length) | 0];
    const c2 = FLOWER_COLORS[(rnd() * FLOWER_COLORS.length) | 0];
    const n = 7 + ((rnd() * 6) | 0);
    for (let i = 0; i < n; i++) {
      const b = rnd() * TAU;
      const d = Math.sqrt(rnd()) * 2.6;
      const x = cx + Math.cos(b) * d;
      const z = cz + Math.sin(b) * d;
      const h = 0.7 + rnd() * 0.35;
      stems.push({ x, y: 0, z, sx: 0.13, sy: h, sz: 0.13 });
      heads.push({ x, y: h + 0.1, z, ry: rnd() * TAU, sx: 0.5, sy: 0.3, sz: 0.5, color: rnd() < 0.6 ? c1 : c2 });
    }
  }
  const stemGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const group = new THREE.Group();
  group.add(instanced(stemGeo, colorMaterial('#3f9b2e'), stems, { cast: false }));
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), heads, { cast: false }));
  return group;
}

function buildRocks(rnd, colliders) {
  const items = [];
  const add = (x, z, s) => {
    const y = terrainHeight(Math.hypot(x, z)) + s * 0.22;
    const g = 0.55 + rnd() * 0.12;
    items.push({ x, y, z, rx: rnd() * TAU, ry: rnd() * TAU, sx: s, sy: s * 0.7, sz: s * (0.8 + rnd() * 0.3), color: `rgb(${(g * 255) | 0},${(g * 258) | 0},${(g * 265) | 0})` });
    if (s > 1.1) colliders.push({ x, z, r: s * 0.85 });
  };
  for (let tries = 0; items.length < 26 && tries < 800; tries++) {
    const a = rnd() * TAU;
    const r = 57 + rnd() * 6.5;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (distToSand(x, z) < 1.5 || (Math.abs(x) < 6 && z > 50)) continue;
    add(x, z, 0.5 + rnd() * 1.2);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rnd() * 0.3;
    add(LIGHTHOUSE.x + Math.cos(a) * 5.9, LIGHTHOUSE.z + Math.sin(a) * 5.9, 0.9 + rnd() * 0.8);
  }
  const material = new THREE.MeshLambertMaterial({ flatShading: true });
  return instanced(new THREE.DodecahedronGeometry(1, 0), material, items);
}

// ---- Fences ---------------------------------------------------------------------------------

function arcPoints(cx, cz, r, a0, a1, step = 0.12) {
  const pts = [];
  const n = Math.max(1, Math.round(Math.abs(a1 - a0) / step));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

const deg = Math.PI / 180;
function fenceRuns() {
  const toCenter = Math.atan2(-LIGHTHOUSE.z, -LIGHTHOUSE.x);
  return [
    [[23.2, 26], [23.2, -26]], // behind the shop row
    arcPoints(LIGHTHOUSE.x, LIGHTHOUSE.z, 9, toCenter + 50 * deg, toCenter + 310 * deg), // lighthouse yard
    arcPoints(0, 0, 56.8, 15 * deg, 55 * deg),
    arcPoints(0, 0, 56.8, 108 * deg, 140 * deg),
    arcPoints(0, 0, 56.8, -115 * deg, -62 * deg),
  ];
}

function buildFences(colliders) {
  const posts = [];
  const rails = [];
  const SPACING = 2.6;
  for (const run of fenceRuns()) {
    // Resample the run into evenly spaced posts; paths cut gaps into the fence.
    const pts = [];
    for (let i = 0; i < run.length - 1; i++) {
      const [ax, az] = run[i];
      const [bx, bz] = run[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / SPACING));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    let prev = null;
    for (const [x, z] of pts) {
      if (distToSand(x, z) < 0.3) {
        prev = null; // a path crosses here: leave a gap
        continue;
      }
      posts.push({ x, y: terrainHeight(Math.hypot(x, z)), z, sx: 1 });
      if (prev) {
        const dx = x - prev[0];
        const dz = z - prev[1];
        const len = Math.hypot(dx, dz);
        const ry = Math.atan2(-dz, dx);
        const mx = (x + prev[0]) / 2;
        const mz = (z + prev[1]) / 2;
        const y0 = terrainHeight(Math.hypot(mx, mz));
        rails.push({ x: mx, y: y0 + 0.8, z: mz, ry, sx: len, sy: 1, sz: 1 });
        rails.push({ x: mx, y: y0 + 1.5, z: mz, ry, sx: len, sy: 1, sz: 1 });
        for (let k = 0; k < len; k += 1.2) colliders.push({ x: prev[0] + (dx * k) / len, z: prev[1] + (dz * k) / len, r: 0.3 });
      }
      colliders.push({ x, z, r: 0.35 });
      prev = [x, z];
    }
  }
  const postGeo = new THREE.BoxGeometry(0.38, 2.1, 0.38).translate(0, 1.05, 0);
  const railGeo = new THREE.BoxGeometry(1, 0.22, 0.14);
  const group = new THREE.Group();
  group.add(instanced(postGeo, colorMaterial('#a06d3c'), posts));
  group.add(instanced(railGeo, colorMaterial('#b98552'), rails));
  return group;
}

// ---- Lighthouse -------------------------------------------------------------------------------

function buildLighthouse(colliders) {
  const group = new THREE.Group();
  group.position.set(LIGHTHOUSE.x, 0, LIGHTHOUSE.z);
  // Face the door toward the island center.
  group.rotation.y = Math.atan2(-LIGHTHOUSE.x, -LIGHTHOUSE.z);

  const BASE_H = 1.6;
  const TOWER_H = 20;
  const BANDS = 6;
  const radiusAt = (y) => 3.4 - ((y - BASE_H) / TOWER_H) * 1.1;
  const red = [];
  const white = [];
  const dark = [];
  const bandH = TOWER_H / BANDS;
  for (let i = 0; i < BANDS; i++) {
    const y0 = BASE_H + i * bandH;
    const g = new THREE.CylinderGeometry(radiusAt(y0 + bandH), radiusAt(y0), bandH, 28, 1, true);
    g.translate(0, y0 + bandH / 2, 0);
    (i % 2 ? white : red).push(g);
  }
  const topY = BASE_H + TOWER_H;
  dark.push(new THREE.CylinderGeometry(3.7, 3.4, 0.4, 28).translate(0, topY + 0.2, 0));
  dark.push(new THREE.TorusGeometry(3.45, 0.09, 6, 36).rotateX(Math.PI / 2).translate(0, topY + 1.35, 0));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    dark.push(new THREE.BoxGeometry(0.12, 1, 0.12).translate(Math.cos(a) * 3.45, topY + 0.9, Math.sin(a) * 3.45));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    dark.push(new THREE.BoxGeometry(0.16, 2.5, 0.16).translate(Math.cos(a) * 1.95, topY + 1.65, Math.sin(a) * 1.95));
  }
  dark.push(new THREE.SphereGeometry(0.38, 12, 8).translate(0, topY + 5.15, 0));
  red.push(new THREE.ConeGeometry(2.6, 2.3, 28).translate(0, topY + 3.95, 0));
  // Door + windows on the side facing the island (+Z after the group rotation).
  dark.push(new THREE.BoxGeometry(1.5, 2.5, 0.4).translate(0, BASE_H + 1.25, radiusAt(BASE_H) - 0.08));
  for (const y of [8.5, 13.5, 18]) {
    dark.push(new THREE.BoxGeometry(0.9, 1.2, 0.4).translate(0, y, radiusAt(y) - 0.02));
  }

  const add = (geos, material) => {
    const mesh = new THREE.Mesh(mergeGeometries(geos), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(red, colorMaterial('#e0322b'));
  add(white, colorMaterial('#f7f7f2'));
  add(dark, colorMaterial('#34383f'));

  const stone = new THREE.MeshLambertMaterial({ map: stoneTexture() });
  stone.map.repeat.set(4, 1);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5.1, 5.6, BASE_H + 0.6, 24), stone);
  base.position.y = BASE_H / 2 - 0.3;
  base.castShadow = base.receiveShadow = true;
  group.add(base);

  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 1.9, 2.4, 20),
    new THREE.MeshLambertMaterial({ color: '#fff4c2', emissive: '#ffd54a', emissiveIntensity: 0.85 }),
  );
  lantern.position.y = topY + 1.6;
  group.add(lantern);

  colliders.push({ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 5.7 });
  return group;
}

// ---- Spawn pad + pier -------------------------------------------------------------------------

function buildSpawnPad() {
  const side = colorMaterial('#8d9196');
  const top = new THREE.MeshLambertMaterial({ map: spawnDecalTexture() });
  const size = SPAWN_PAD.half * 2;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(size, 0.4, size), [side, side, top, side, side, side]);
  pad.position.set(SPAWN_PAD.x, SPAWN_PAD.top - 0.2, SPAWN_PAD.z);
  pad.receiveShadow = true;
  return pad;
}

function buildPier() {
  const group = new THREE.Group();
  const len = PIER.z1 - PIER.z0;
  const planks = woodTexture('#a8773f').clone();
  planks.repeat.set((PIER.half * 2) / 8, len / 8);
  planks.needsUpdate = true;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(PIER.half * 2, 0.35, len),
    new THREE.MeshLambertMaterial({ map: planks }),
  );
  deck.position.set(PIER.x, PIER.top - 0.175, (PIER.z0 + PIER.z1) / 2);
  deck.castShadow = deck.receiveShadow = true;
  group.add(deck);
  const posts = [];
  for (let z = PIER.z0 + 1.5; z < PIER.z1; z += 3.6) {
    for (const sx of [-1, 1]) posts.push({ x: PIER.x + sx * (PIER.half - 0.15), y: -4, z, sx: 1 });
  }
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 10).translate(0, 0.5, 0).scale(1, PIER.top + 4.6, 1);
  group.add(instanced(postGeo, colorMaterial('#7c5530'), posts));
  return group;
}
