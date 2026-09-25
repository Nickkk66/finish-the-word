// Procedural cosmetic models: the 10 shop chairs, the 12 pets and the 2 lucky blocks.
//
// Everything is built from primitives + canvas textures (no asset files). The static parts
// of each model are merged per material once ("baked") and cached, so every instance of a
// model shares the same few geometries, materials and textures: 8 chairs + 8 pets cost only
// a handful of draw calls each. Animated parts are small separate meshes driven by
// `group.userData.update(t, dt)`, which never allocates.
//
// Conventions (docs/SPEC.md §5): +Z is front, origin at floor level, chair seat top exactly
// at LAYOUT.seatHeight. Returned resources are shared: callers must not mutate materials
// (clone first) and should free models with disposeObject(), which skips shared resources.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, PETS, PETS_BY_ID } from '../shared/catalog.js';
import { LAYOUT } from '../shared/constants.js';

const SEAT_Y = LAYOUT.seatHeight;
const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

// ---- Public API ------------------------------------------------------------------------

/**
 * Chair model: origin floor-center, sitter faces +Z, seat top at y = LAYOUT.seatHeight.
 * userData.seatAnchor: Object3D at the seat surface that follows the seat when it moves
 * (swing); parent a seated avatar to it to ride along.
 */
export function buildChair(chairId) {
  const id = Object.hasOwn(CHAIR_BUILDERS, chairId) ? chairId : 'wooden';
  const group = new THREE.Group();
  group.name = `chair:${id}`;
  CHAIR_BUILDERS[id](group, nextPhase());
  if (!group.userData.seatAnchor) group.userData.seatAnchor = addAnchor(group, 0, SEAT_Y, 0);
  return group;
}

/** Pet model (~1.2–1.6 tall): origin bottom-center, faces +Z, idle animation in userData.update. */
export function buildPet(petId) {
  return buildCritter(PETS_BY_ID[petId] || PETS[0]);
}

/** Lucky block (3-unit "?" cube): origin bottom-center, idle animation in userData.update. */
export function buildLuckyBlock(blockId) {
  const block = BLOCKS.find((b) => b.id === blockId) || BLOCKS[0];
  return block.id === 'secret' ? secretBlock(block) : starterBlock(block);
}

/** Frees geometries/materials/textures under obj that are not shared through the caches. */
export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.isInstancedMesh) o.dispose(); // frees per-instance buffers only
    if (o.geometry && !o.isSprite && !shared.has(o.geometry)) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (shared.has(m)) continue;
      for (const v of Object.values(m)) if (v && v.isTexture && !shared.has(v)) v.dispose();
      m.dispose();
    }
  });
}

// ---- Shared resource cache -------------------------------------------------------------

const cache = new Map();
const shared = new WeakSet(); // every cached geometry / material / texture

function cached(key, make) {
  let v = cache.get(key);
  if (v === undefined) {
    v = make();
    cache.set(key, v);
    shared.add(v);
  }
  return v;
}

let instanceCount = 0;
/** Per-instance time offset (seconds) so neighbouring models don't animate in lockstep. */
function nextPhase() {
  instanceCount += 1;
  return ((instanceCount * 0.618034) % 1) * 17;
}

/** Cheap deterministic pseudo-random in [0, 1) (used for flicker / spark timing). */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
/** Lighten (f > 0, toward white) or darken (f < 0) a hex color. */
function shade(hex, f) {
  _c1.set(hex);
  if (f >= 0) _c1.lerp(_c2.set('#ffffff'), f);
  else _c1.multiplyScalar(1 + f);
  return `#${_c1.getHexString()}`;
}

// ---- Materials -------------------------------------------------------------------------

/** Shared MeshStandardMaterial. `shadow: false` marks glow/decal parts that must not cast shadows. */
function mat(color, { rough = 0.6, metal = 0, emissive = null, glow = 1, flat = false, shadow = true } = {}) {
  return cached(`std|${color}|${rough}|${metal}|${emissive}|${glow}|${flat}|${shadow}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: flat });
    if (emissive) {
      m.emissive.set(emissive);
      m.emissiveIntensity = glow;
    }
    if (!shadow) m.userData.noShadow = true;
    return m;
  });
}

function woodMat(color) {
  return cached(`wood|${color}`, () => new THREE.MeshStandardMaterial({ color, map: grainTexture(), roughness: 0.78 }));
}

function glassMat() {
  return cached('mat:glass', () => new THREE.MeshPhysicalMaterial({
    color: '#a8e6ff',
    emissive: '#ffffff',
    emissiveMap: glintTexture(),
    emissiveIntensity: 0.6,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  }));
}

function jellyMat(color, emissive) {
  return cached(`mat:jelly|${color}`, () => new THREE.MeshPhysicalMaterial({
    color,
    emissive,
    emissiveIntensity: 0.45,
    roughness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.66,
    depthWrite: false,
  }));
}

function decalMat() {
  return cached('mat:decal', () => {
    const m = new THREE.MeshStandardMaterial({ map: faceAtlas(), transparent: true, depthWrite: false, roughness: 0.5 });
    m.userData.noShadow = true;
    return m;
  });
}

function robotFaceMat() {
  return cached('mat:robotFace', () => {
    const tex = robotAtlas();
    const m = new THREE.MeshStandardMaterial({
      color: '#000000', map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.4,
      transparent: true, depthWrite: false,
    });
    m.userData.noShadow = true;
    return m;
  });
}

function sparkleMat(color) {
  return cached(`mat:sparkle|${color}`, () => new THREE.SpriteMaterial({
    map: starTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

// ---- Geometry --------------------------------------------------------------------------

const geo = {
  box: (w, h, d) => cached(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)),
  rbox: (w, h, d, r = 0.08, seg = 2) =>
    cached(`rbox|${w}|${h}|${d}|${r}|${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r)),
  sphere: (r, ws = 14, hs = 10) => cached(`sph|${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  cyl: (rt, rb, h, seg = 14) => cached(`cyl|${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  cone: (r, h, seg = 12) => cached(`cone|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  torus: (R, r, rs = 8, ts = 20, arc = TAU) =>
    cached(`tor|${R}|${r}|${rs}|${ts}|${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)),
  oct: (r) => cached(`oct|${r}`, () => new THREE.OctahedronGeometry(r)),
  plane: () => cached('plane', () => new THREE.PlaneGeometry(1, 1)),
};

const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);
const _m4 = new THREE.Matrix4();

/** Matrix from position [x,y,z], Euler rotation [rx,ry,rz] and scale (number or [x,y,z]). */
function compose(p, r = null, s = 1) {
  _v.set(p[0], p[1], p[2]);
  _q.setFromEuler(_e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0));
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  return new THREE.Matrix4().compose(_v, _q, _s);
}

/** Collects static parts (geometry + material + transform) and merges them per material. */
class Kit {
  constructor() {
    this.parts = [];
    this.stack = [new THREE.Matrix4()];
  }

  add(geometry, material, p = [0, 0, 0], r = null, s = 1) {
    const matrix = compose(p, r, s).premultiply(this.stack[this.stack.length - 1]);
    this.parts.push({ geometry, material, matrix });
    return this;
  }

  /** Adds a part and its mirror image across the YZ plane (x → −x). */
  pair(geometry, material, p, r = null, s = 1) {
    this.add(geometry, material, p, r, s);
    const sv = typeof s === 'number' ? [s, s, s] : s;
    return this.add(geometry, material, [-p[0], p[1], p[2]], r && [r[0], -r[1], -r[2]], [-sv[0], sv[1], sv[2]]);
  }

  /** Runs fn with an extra parent transform (e.g. a reclined backrest built in local space). */
  frame(p, r, fn) {
    this.stack.push(compose(p, r).premultiply(this.stack[this.stack.length - 1]));
    fn(this);
    this.stack.pop();
    return this;
  }

  /** Cylinder of radius r between points a and b. */
  rod(material, a, b, r, seg = 6) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    _e.setFromQuaternion(_q.setFromUnitVectors(_up, _v.set(dx / len, dy / len, dz / len)));
    const rot = [_e.x, _e.y, _e.z];
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), material, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot);
  }

  merge() {
    const byMaterial = new Map();
    for (const part of this.parts) {
      if (!byMaterial.has(part.material)) byMaterial.set(part.material, []);
      byMaterial.get(part.material).push(part);
    }
    const out = [];
    for (const [material, list] of byMaterial) {
      const geometry = mergeGeometries(list.map((p) => bakeGeometry(p.geometry, p.matrix)));
      geometry.computeBoundingSphere();
      shared.add(geometry);
      out.push({ geometry, material });
    }
    return out;
  }
}

/** Non-indexed copy of src in model space with only position/normal/uv (merge-compatible). */
function bakeGeometry(src, matrix) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(g.attributes.position.count * 2, 2));
  g.clearGroups();
  g.applyMatrix4(matrix);
  if (matrix.determinant() < 0) flipWinding(g); // mirrored parts would otherwise render inside-out
  return g;
}

function flipWinding(g) {
  for (const attr of Object.values(g.attributes)) {
    const a = attr.array;
    const n = attr.itemSize;
    for (let v = 0; v < attr.count; v += 3) {
      for (let i = 0; i < n; i++) {
        const i1 = (v + 1) * n + i;
        const i2 = (v + 2) * n + i;
        const tmp = a[i1];
        a[i1] = a[i2];
        a[i2] = tmp;
      }
    }
  }
}

function meshOf(geometry, material) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = !material.userData.noShadow;
  m.receiveShadow = true;
  return m;
}

/** Group of merged meshes for the static parts described by fill(kit), cached per key. */
function baked(key, fill) {
  const parts = cached(`bake|${key}`, () => {
    const kit = new Kit();
    fill(kit);
    return kit.merge();
  });
  const g = new THREE.Group();
  for (const { geometry, material } of parts) g.add(meshOf(geometry, material));
  return g;
}

/** Animation pivot at p holding a baked sub-model built in pivot-local space. */
function pivot(parent, p, key, fill) {
  const g = new THREE.Group();
  g.position.set(p[0], p[1], p[2]);
  g.add(baked(key, fill));
  parent.add(g);
  return g;
}

function addAnchor(parent, x, y, z) {
  const a = new THREE.Object3D();
  a.name = 'seatAnchor';
  a.position.set(x, y, z);
  parent.add(a);
  return a;
}

/** Twinkling star sprites; returns an update(tt) function. */
function addSparkles(parent, color, spots, size) {
  const sprites = spots.map((p) => {
    const s = new THREE.Sprite(sparkleMat(color));
    s.position.set(p[0], p[1], p[2]);
    s.scale.setScalar(0);
    parent.add(s);
    return s;
  });
  return (tt) => {
    for (let i = 0; i < sprites.length; i++) {
      const w = Math.max(0, Math.sin(tt * 2.1 + i * 2.39));
      sprites[i].scale.setScalar(size * w * w * w);
    }
  };
}

// ---- Chairs ----------------------------------------------------------------------------
// Shared layout: seat top at SEAT_Y, torso of a seated avatar centered on x = z = 0, so
// backrests keep their front face at z <= -0.55 and seats reach ~1.2 toward +Z.

const CHAIR_BUILDERS = {
  wooden: chairWooden,
  glass: chairGlass,
  goop: chairGoop,
  toilet: chairToilet,
  slime: chairSlime,
  flower: chairFlower,
  swing: chairSwing,
  gamer: chairGamer,
  electric: chairElectric,
  throne: chairThrone,
};

function chairWooden(group) {
  group.add(baked('chair:wooden', (k) => {
    const dark = woodMat('#7a4d2a');
    const mid = woodMat('#9a6a3f');
    const light = woodMat('#b98553');
    // slatted seat: five planks, alternating tones
    for (let i = 0; i < 5; i++) k.add(geo.rbox(2.4, 0.26, 0.4, 0.05, 1), i % 2 ? mid : light, [0, SEAT_Y - 0.13, -0.8 + i * 0.44]);
    // apron frame under the seat
    k.add(geo.rbox(2.2, 0.24, 0.16, 0.04, 1), dark, [0, 1.62, 1.0]);
    k.add(geo.rbox(2.2, 0.24, 0.16, 0.04, 1), dark, [0, 1.62, -0.86]);
    k.pair(geo.rbox(0.16, 0.24, 1.9, 0.04, 1), dark, [1.02, 1.62, 0.07]);
    // front legs, back legs rising into the backrest posts with round knobs
    k.pair(geo.rbox(0.26, 1.74, 0.26, 0.05, 1), mid, [1.02, 0.87, 0.98]);
    k.pair(geo.rbox(0.26, 4.95, 0.26, 0.05, 1), mid, [1.02, 2.475, -0.86]);
    k.pair(geo.sphere(0.18, 12, 8), dark, [1.02, 5.07, -0.86]);
    // stretchers
    k.pair(geo.rbox(0.14, 0.14, 1.84, 0.03, 1), dark, [1.02, 0.55, 0.06]);
    k.add(geo.rbox(2.04, 0.14, 0.14, 0.03, 1), dark, [0, 0.45, -0.86]);
    // backrest: bottom rail, three slats, chunky top rail
    k.add(geo.rbox(2.1, 0.22, 0.18, 0.04, 1), dark, [0, 2.55, -0.86]);
    for (const x of [-0.55, 0, 0.55]) k.add(geo.rbox(0.3, 1.9, 0.12, 0.04, 1), light, [x, 3.55, -0.86]);
    k.add(geo.rbox(2.5, 0.48, 0.3, 0.1, 2), mid, [0, 4.7, -0.86]);
  }));
}

function chairGlass(group) {
  group.add(baked('chair:glass', (k) => {
    const glass = glassMat();
    k.add(geo.rbox(2.4, 0.3, 2.2, 0.12, 2), glass, [0, SEAT_Y - 0.15, 0.08]);
    k.frame([0, SEAT_Y - 0.12, -0.86], [-0.1, 0, 0], () => {
      k.add(geo.rbox(2.4, 2.95, 0.24, 0.12, 2), glass, [0, 1.47, 0]);
    });
    for (const z of [0.9, -0.74]) k.pair(geo.cyl(0.13, 0.13, 1.74, 12), glass, [0.98, 0.87, z]);
    k.pair(geo.cyl(0.07, 0.07, 1.64, 8), glass, [0.98, 0.5, 0.08], [HALF_PI, 0, 0]);
  }));
}

function chairGoop(group, phase) {
  const goo = mat('#5ad43c', { rough: 0.22 });
  const gooDark = mat('#3cae2c', { rough: 0.25 });
  const shine = mat('#c4f7aa', { rough: 0.2 });
  const drip = (k, x, yTop, z, len) => {
    k.add(geo.cyl(0.12, 0.14, len, 10), goo, [x, yTop - len / 2, z]);
    k.add(geo.sphere(0.16, 10, 8), goo, [x, yTop - len, z]);
  };
  group.add(baked('chair:goop', (k) => {
    // puddle with blobby rim and a melting column
    k.add(geo.cyl(1.4, 1.46, 0.14, 24), gooDark, [0, 0.07, 0.05]);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3;
      k.add(geo.sphere(0.3, 12, 8), gooDark, [Math.cos(a) * 1.16, 0.14, 0.05 + Math.sin(a) * 1.16], null, [1, 0.45, 1]);
    }
    const profile = [[0, 0], [1.28, 0], [1.2, 0.14], [1.0, 0.42], [0.9, 0.8], [0.96, 1.2], [1.12, 1.5], [0, 1.55]];
    k.add(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20), goo, [0, 0, 0.05]);
    // seat blob (flat top at seat height) with drips over the edges
    k.add(geo.rbox(2.6, 0.56, 2.4, 0.27, 3), goo, [0, SEAT_Y - 0.28, 0.05]);
    drip(k, -0.85, 1.62, 1.13, 0.55);
    drip(k, 0.62, 1.62, 1.13, 0.38);
    drip(k, 1.18, 1.62, 0.45, 0.62);
    drip(k, -1.18, 1.62, -0.35, 0.45);
    // lumpy backrest with drips running down its front
    k.add(geo.rbox(2.4, 2.3, 0.6, 0.3, 3), goo, [0, 3.0, -1.0]);
    for (const [x, y, r] of [[-0.72, 4.12, 0.44], [0.04, 4.24, 0.48], [0.76, 4.06, 0.42]]) {
      k.add(geo.sphere(r, 14, 10), goo, [x, y, -1.0], null, [1, 0.9, 0.7]);
    }
    for (const [x, len] of [[-0.45, 0.8], [0.55, 0.5]]) {
      k.add(geo.cyl(0.11, 0.11, len, 10), goo, [x, 4.15 - len / 2, -0.72]);
      k.add(geo.sphere(0.14, 10, 8), goo, [x, 4.15 - len, -0.72]);
    }
    // glossy highlights
    for (const [x, y, z] of [[-0.8, 3.7, -0.69], [0.3, 3.95, -0.69], [-0.55, 4.45, -0.85], [0.95, 1.8, 1.24]]) {
      k.add(geo.sphere(0.1, 8, 6), shine, [x, y, z], null, [1, 1, 0.35]);
    }
  }));
  // a drip that slowly stretches, then lets a droplet fall into the puddle
  const stretch = pivot(group, [0.05, 1.6, 1.13], 'chair:goop:drip', (k) => drip(k, 0, 0, 0, 0.42));
  const droplet = meshOf(geo.sphere(0.11, 10, 8), goo);
  droplet.position.set(0.05, 0.5, 1.13);
  droplet.visible = false;
  group.add(droplet);
  group.userData.update = (t) => {
    const c = (t + phase) % 2.8;
    if (c < 1.9) {
      stretch.scale.y = 1 + 0.6 * (c / 1.9) ** 2;
      droplet.visible = false;
    } else {
      const f = c - 1.9;
      stretch.scale.y = 1 + 0.6 * Math.max(0, 1 - f * 5);
      droplet.visible = f < 0.42;
      droplet.position.y = 1.6 - 0.42 * 1.6 - 0.16 - 4.9 * f * f;
    }
  };
}

function chairToilet(group) {
  group.add(baked('chair:toilet', (k) => {
    const porcelain = mat('#f6f9fc', { rough: 0.16 });
    const chrome = mat('#cfd6df', { rough: 0.22, metal: 0.6 });
    const water = mat('#5ec8ff', { rough: 0.05, emissive: '#1c6fb0', glow: 0.35 });
    const oval = [1, 1, 1.2];
    // bowl + pedestal (lathe: up the outside, over the rim, down into the bowl)
    const profile = [[0, 0], [0.8, 0], [0.82, 0.06], [0.64, 0.18], [0.56, 0.5], [0.6, 0.9], [0.78, 1.25], [0.95, 1.55],
      [1.0, 1.68], [0.97, 1.72], [0.86, 1.72], [0.78, 1.6], [0.68, 1.45], [0.5, 1.3], [0, 1.22]];
    k.add(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 28), porcelain, [0, 0, 0.15], null, oval);
    k.add(geo.cyl(0.66, 0.66, 0.04, 24), water, [0, 1.42, 0.15], null, oval);
    // seat ring (top exactly at seat height) and the raised lid as backrest
    const ring = new THREE.Shape().absellipse(0, 0, 1.0, 1.22, 0, TAU);
    ring.holes.push(new THREE.Path().absellipse(0, 0, 0.62, 0.8, 0, TAU));
    const ringGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.18, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 28 });
    k.add(ringGeo, porcelain, [0, SEAT_Y - 0.23, 0.15], [-HALF_PI, 0, 0]);
    const lid = new THREE.Shape().absellipse(0, 1.2, 1.0, 1.2, 0, TAU);
    const lidGeo = new THREE.ExtrudeGeometry(lid, { depth: 0.1, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 28 });
    k.add(lidGeo, porcelain, [0, SEAT_Y - 0.02, -0.9]);
    // tank on a porcelain neck, flush handle on the front-left
    k.add(geo.rbox(1.3, 0.8, 0.6, 0.2, 2), porcelain, [0, 1.35, -0.95]);
    k.add(geo.rbox(2.6, 1.7, 0.6, 0.14, 2), porcelain, [0, 2.55, -1.2]);
    k.add(geo.rbox(2.72, 0.18, 0.72, 0.07, 2), porcelain, [0, 3.48, -1.2]);
    k.add(geo.cyl(0.14, 0.14, 0.06, 16), chrome, [-1.14, 3.05, -0.88], [HALF_PI, 0, 0]);
    k.add(geo.rbox(0.36, 0.1, 0.1, 0.04, 1), chrome, [-1.3, 3.05, -0.83]);
    // spare roll on the tank lid
    k.add(geo.cyl(0.24, 0.24, 0.34, 18), mat('#ffffff', { rough: 0.9 }), [0.62, 3.74, -1.2]);
    k.add(geo.cyl(0.08, 0.08, 0.35, 10), mat('#c9a77c', { rough: 0.9 }), [0.62, 3.745, -1.2]);
  }));
}

function chairSlime(group, phase) {
  const pink = jellyMat('#ff5ec4', '#8a0f68');
  const purple = jellyMat('#a45cff', '#3d0f8a');
  const bubbleMat = mat('#fff0fb', { rough: 0.15, emissive: '#ff9ad8', glow: 0.3 });
  const seat = new THREE.Group();
  group.add(seat);
  seat.add(baked('chair:slime:seat', (k) => {
    k.add(geo.rbox(2.6, 1.95, 2.4, 0.45, 3), pink, [0, SEAT_Y - 0.975, 0.05]);
    k.add(geo.cyl(1.4, 1.44, 0.08, 28), pink, [0, 0.04, 0.05]);
  }));
  const back = pivot(group, [0, 1.9, -0.95], 'chair:slime:back', (k) => {
    k.add(geo.rbox(2.6, 2.5, 0.7, 0.32, 3), purple, [0, 1.25, 0]);
    k.pair(geo.sphere(0.34, 14, 10), purple, [0.78, 2.5, 0], null, [1, 0.85, 0.8]);
  });
  // opaque bubbles drifting up inside the translucent jelly (seen through it), one
  // instanced mesh per jelly part; bubble = [x, z, radius, rise speed, cycle offset]
  const field = (parent, y0, range, bubbles) => {
    const mesh = new THREE.InstancedMesh(geo.sphere(1, 10, 8), bubbleMat, bubbles.length);
    mesh.frustumCulled = false; // instances move every frame; they stay inside the chair anyway
    parent.add(mesh);
    return { mesh, y0, range, bubbles };
  };
  const fields = [
    field(seat, 0.3, 1.45, [[-0.7, 0.5, 0.12, 0.16, 0], [0.4, -0.3, 0.16, 0.21, 0.37], [0.8, 0.7, 0.09, 0.26, 0.74],
      [-0.2, 0.9, 0.11, 0.16, 0.11], [-0.9, -0.5, 0.1, 0.21, 0.48], [0.1, 0.1, 0.14, 0.26, 0.85], [0.6, -0.8, 0.08, 0.16, 0.22]]),
    field(back, 0.35, 1.8, [[-0.6, 0.1, 0.1, 0.13, 0], [0.5, -0.1, 0.13, 0.19, 0.29], [0.05, 0.12, 0.08, 0.13, 0.58],
      [0.9, 0.05, 0.09, 0.19, 0.87], [-0.95, -0.1, 0.11, 0.13, 0.16]]),
  ];
  group.userData.update = (t) => {
    const tt = t + phase;
    const w = Math.sin(tt * 2.4);
    seat.scale.set(1 + 0.025 * w, 1, 1 - 0.025 * w); // seat top stays at SEAT_Y
    back.rotation.x = 0.05 * Math.sin(tt * 2.4 - 0.9);
    back.scale.set(1 - 0.02 * w, 1 + 0.03 * w, 1);
    for (let j = 0; j < fields.length; j++) {
      const f = fields[j];
      for (let i = 0; i < f.bubbles.length; i++) {
        const b = f.bubbles[i];
        const u = (tt * b[3] + b[4]) % 1;
        const s = b[2] * Math.min(1, u * 8, (1 - u) * 8);
        f.mesh.setMatrixAt(i, _m4.makeScale(s, s, s).setPosition(b[0], f.y0 + u * f.range, b[1]));
      }
      f.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  group.userData.update(0);
}

function chairFlower(group, phase) {
  const stem = mat('#62b845', { rough: 0.7 });
  const leaf = mat('#8fdc6a', { rough: 0.7 });
  const cushion = mat('#fff0a3', { rough: 0.85 });
  const petals = [mat('#ffb0cf', { rough: 0.7 }), mat('#d4b8ff', { rough: 0.7 }), mat('#ffcaa6', { rough: 0.7 })];
  const leafAt = (k, x, y, z, yaw, pitch, size) =>
    k.frame([x, y, z], [0, yaw, 0], () => k.add(geo.sphere(0.5, 12, 8), leaf, [0, 0, size * 0.45], [pitch, 0, 0], [size * 0.45, 0.1, size]));
  group.add(baked('chair:flower', (k) => {
    // four splayed stem legs with leaves, plus a leaf rosette on the ground
    for (const [x, z] of [[0.6, 0.62], [-0.6, 0.62], [0.6, -0.5], [-0.6, -0.5]]) {
      k.add(geo.cyl(0.1, 0.13, 1.72, 8), stem, [x, 0.88, z], [-Math.sign(z) * 0.1, 0, Math.sign(x) * 0.1]);
      leafAt(k, x * 1.05, 0.8, z * 1.05, Math.atan2(x, z), -0.5, 0.55);
    }
    for (let i = 0; i < 6; i++) leafAt(k, 0, 0.14, 0.05, (i / 6) * TAU + 0.5, -0.12, 1.3);
    // round cushion (flower center) with a ring of little petals
    k.add(geo.cyl(1.0, 1.0, 0.4, 28), cushion, [0, SEAT_Y - 0.2, 0.05]);
    k.add(geo.torus(1.0, 0.2, 10, 32), cushion, [0, SEAT_Y - 0.2, 0.05], [HALF_PI, 0, 0]);
    for (let i = 0; i < 12; i++) {
      k.frame([0, SEAT_Y - 0.3, 0.05], [0, (i / 12) * TAU, 0], () =>
        k.add(geo.sphere(0.5, 12, 8), petals[i % 2 ? 0 : 2], [0, 0, 1.08], [0.25, 0, 0], [0.6, 0.18, 0.72]));
    }
    // stem holding the flower-head backrest
    k.add(geo.cyl(0.13, 0.15, 2.1, 8), stem, [0, 2.75, -1.02]);
    leafAt(k, 0.1, 2.5, -1.02, 1.3, -0.6, 0.55);
    leafAt(k, -0.1, 2.3, -1.02, -1.4, -0.5, 0.5);
  }));
  // big daisy backrest with a sleepy smile; it sways gently
  const head = pivot(group, [0, 3.75, -0.9], 'chair:flower:head', (k) => {
    k.add(geo.cyl(0.47, 0.47, 0.26, 28), mat('#ffd34d', { rough: 0.7 }), [0, 0, 0.05], [HALF_PI, 0, 0]);
    for (let i = 0; i < 8; i++) {
      k.frame([0, 0, -0.02], [0, 0, (i / 8) * TAU + TAU / 16], () =>
        k.add(geo.sphere(0.5, 14, 10), petals[i % 2], [0, 0.95, 0], null, [0.62, 1.2, 0.26]));
    }
    k.add(decalGeo(FACE, 'eyes', 0.46, 0.23), decalMat(), [0, 0.08, 0.19]);
    k.add(decalGeo(FACE, 'blush', 0.62, 0.155), decalMat(), [0, -0.08, 0.186]);
    k.add(decalGeo(FACE, 'smile', 0.2, 0.1), decalMat(), [0, -0.15, 0.19]);
  });
  group.userData.update = (t) => {
    head.rotation.z = 0.06 * Math.sin((t + phase) * 1.3);
  };
}

function chairSwing(group, phase) {
  const TOP = 7.1;
  const frameWood = woodMat('#8a5a32');
  const rope = mat('#dcc08a', { rough: 0.95 });
  group.add(baked('chair:swing:frame', (k) => {
    const tilt = Math.atan2(1.25, TOP);
    const len = Math.hypot(1.25, TOP) + 0.1;
    k.pair(geo.cyl(0.13, 0.15, len, 10), frameWood, [1.32, TOP / 2 + 0.08, 0.625], [-tilt, 0, 0]);
    k.pair(geo.cyl(0.13, 0.15, len, 10), frameWood, [1.32, TOP / 2 + 0.08, -0.625], [tilt, 0, 0]);
    k.pair(geo.cyl(0.07, 0.07, 2.2, 8), frameWood, [1.32, 1.2, 0], [HALF_PI, 0, 0]);
    k.add(geo.cyl(0.17, 0.17, 3.0, 12), frameWood, [0, TOP, 0], [0, 0, HALF_PI]);
    k.pair(geo.torus(0.1, 0.03, 6, 12), mat('#9aa3ad', { rough: 0.35, metal: 0.5 }), [1.02, TOP - 0.2, 0], [0, HALF_PI, 0]);
  }));
  // swinging part (pivot on the top beam): V-shaped rope pairs and the plank seat
  const swing = new THREE.Group();
  swing.position.y = TOP;
  group.add(swing);
  swing.add(baked('chair:swing:seat', (k) => {
    const seatY = SEAT_Y - TOP;
    for (const x of [-1.02, 1.02]) {
      for (const z of [-0.5, 0.5]) {
        k.rod(rope, [x, -0.28, 0], [x, seatY + 0.02, z], 0.045);
        k.add(geo.sphere(0.08, 8, 6), rope, [x, seatY + 0.04, z]);
      }
    }
    k.add(geo.rbox(2.5, 0.22, 1.3, 0.06, 2), woodMat('#c58c55'), [0, seatY - 0.11, 0]);
  }));
  group.userData.seatAnchor = addAnchor(swing, 0, SEAT_Y - TOP, 0);
  group.userData.update = (t) => {
    swing.rotation.x = 0.07 * Math.sin((t + phase) * 1.6);
  };
}

function chairGamer(group) {
  const black = mat('#202227', { rough: 0.5 });
  const red = mat('#e3263b', { rough: 0.45 });
  const BACK_PIVOT = [0, SEAT_Y - 0.05, -0.86];
  const RECLINE = -0.1;
  group.add(baked('chair:gamer', (k) => {
    const dark = mat('#34373f', { rough: 0.45 });
    const chrome = mat('#b4bcc8', { rough: 0.25, metal: 0.6 });
    // five-star base with casters and a gas lift
    for (let i = 0; i < 5; i++) {
      k.frame([0, 0, 0], [0, (i / 5) * TAU, 0], () => {
        k.add(geo.rbox(0.24, 0.16, 1.2, 0.06, 1), black, [0, 0.36, 0.62], [0.12, 0, 0]);
        k.add(geo.rbox(0.16, 0.2, 0.2, 0.05, 1), black, [0, 0.3, 1.16]);
        k.add(geo.sphere(0.14, 10, 8), dark, [0, 0.14, 1.18]);
      });
    }
    k.add(geo.cyl(0.24, 0.26, 0.3, 12), black, [0, 0.42, 0]);
    k.add(geo.cyl(0.18, 0.2, 0.5, 12), black, [0, 0.8, 0]);
    k.add(geo.cyl(0.11, 0.11, 0.6, 10), chrome, [0, 1.2, 0]);
    k.add(geo.rbox(1.1, 0.16, 1.1, 0.04, 1), dark, [0, 1.52, 0]);
    // bucket seat with raised red bolsters and red stitching stripes
    k.add(geo.rbox(2.2, 0.4, 2.1, 0.14, 2), black, [0, SEAT_Y - 0.2, 0.1]);
    k.pair(geo.rbox(0.34, 0.52, 2.0, 0.15, 2), red, [1.16, SEAT_Y - 0.11, 0.1]);
    k.pair(geo.box(0.12, 0.02, 1.7), red, [0.5, SEAT_Y - 0.006, 0.12]);
    // reclined racing backrest: wings, stripes, harness slots, headrest pillow
    k.frame(BACK_PIVOT, [RECLINE, 0, 0], () => {
      k.add(geo.rbox(2.0, 3.4, 0.42, 0.16, 2), black, [0, 1.75, -0.05]);
      k.pair(geo.rbox(0.36, 2.3, 0.6, 0.16, 2), red, [1.12, 1.35, 0.02]);
      k.pair(geo.rbox(0.3, 0.9, 0.5, 0.14, 2), black, [1.04, 2.85, -0.02]);
      k.pair(geo.box(0.14, 2.1, 0.02), red, [0.62, 1.25, 0.165]);
      k.pair(geo.rbox(0.26, 0.46, 0.03, 0.01, 1), mat('#0b0c0f', { rough: 0.9 }), [0.45, 2.3, 0.16]);
      k.add(geo.rbox(1.1, 0.5, 0.24, 0.12, 2), red, [0, 3.0, 0.24]);
    });
  }));
  // RGB strip around the backrest face; the rainbow scrolls along it
  const strip = meshOf(cached('geo:rgbStrip', () => {
    const pts = roundedRectShape(1.66, 3.1, 0.25).getSpacedPoints(96).slice(0, -1).map((p) => new THREE.Vector3(p.x, p.y + 0.22, 0.19));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.045, 6, true);
  }), rgbMat());
  const rainbow = strip.material.emissiveMap;
  strip.position.set(BACK_PIVOT[0], BACK_PIVOT[1], BACK_PIVOT[2]);
  strip.rotation.x = RECLINE;
  group.add(strip);
  group.userData.update = (t) => {
    rainbow.offset.x = -((t * 0.3) % 1);
  };
}

function chairElectric(group, phase) {
  const glow = boltMat();
  const spark = mat('#effdff', { emissive: '#8ff6ff', glow: 2.2, shadow: false });
  const BALL_Y = 5.12;
  group.add(baked('chair:electric', (k) => {
    const steel = mat('#66727f', { rough: 0.32, metal: 0.55 });
    const dark = mat('#2c323b', { rough: 0.45, metal: 0.3 });
    const copper = mat('#e0873c', { rough: 0.35, metal: 0.5 });
    // tubular legs with foot pads
    for (const z of [0.9, -0.8]) {
      k.pair(geo.cyl(0.11, 0.13, 1.74, 10), steel, [0.98, 0.87, z]);
      k.pair(geo.cyl(0.2, 0.22, 0.08, 12), dark, [0.98, 0.04, z]);
    }
    // riveted metal seat with a hazard-stripe front
    k.add(geo.rbox(2.4, 0.3, 2.2, 0.06, 2), dark, [0, SEAT_Y - 0.15, 0.05]);
    k.add(geo.plane(), hazardMat(), [0, SEAT_Y - 0.15, 1.156], null, [2.2, 0.2, 1]);
    for (const x of [-1.08, 1.08]) k.add(geo.sphere(0.05, 8, 6), steel, [x, SEAT_Y - 0.15, 1.15]);
    k.pair(boltGeometry(), glow, [1.206, SEAT_Y - 0.17, 0.05], [0, HALF_PI, HALF_PI], [0.4, 0.85, 0.3]);
    // backrest: posts with copper coils, panel with a big bolt, glowing tesla balls on top
    k.pair(geo.cyl(0.12, 0.12, 3.3, 10), steel, [1.05, 3.3, -0.85]);
    k.add(geo.rbox(2.0, 2.5, 0.16, 0.05, 1), dark, [0, 3.35, -0.88]);
    k.add(geo.cyl(0.09, 0.09, 2.1, 10), steel, [0, 4.75, -0.85], [0, 0, HALF_PI]);
    for (const y of [4.02, 4.26, 4.5]) k.pair(geo.torus(0.17, 0.045, 6, 16), copper, [1.05, y, -0.85], [HALF_PI, 0, 0]);
    k.pair(geo.sphere(0.23, 16, 12), glow, [1.05, BALL_Y, -0.85]);
    k.add(boltGeometry(), glow, [0, 3.35, -0.8], null, [1.05, 1.2, 1]);
  }));
  // flickering arcs between the tesla balls (3 zigzag variants) and sparks around the seat
  const arcs = [0, 1, 2].map((v) => {
    const arc = baked(`chair:electric:arc${v}`, (k) => {
      let prev = [-0.86, 0, 0];
      for (let i = 1; i <= 7; i++) {
        const x = -0.86 + (i / 7) * 1.72;
        const next = i === 7 ? [0.86, 0, 0] : [x, (hash(v * 31 + i) - 0.5) * 0.42, (hash(v * 17 + i * 3) - 0.5) * 0.3];
        k.rod(spark, prev, next, 0.035, 4);
        prev = next;
      }
    });
    arc.position.set(0, BALL_Y, -0.85);
    group.add(arc);
    return arc;
  });
  const spots = [[1.25, 1.6, 0.9], [-1.25, 1.7, -0.3], [0.6, 0.3, 1.1], [-0.7, 0.2, -0.9], [1.1, 4.95, -0.6], [-1.1, 4.9, -1.1]];
  const sparks = spots.slice(0, 3).map((p) => {
    const s = meshOf(geo.oct(0.09), spark);
    s.position.set(p[0], p[1], p[2]);
    s.visible = false;
    group.add(s);
    return s;
  });
  group.userData.update = (t) => {
    const tt = t + phase;
    const tick = Math.floor(tt * 14);
    glow.emissiveIntensity = hash(Math.floor(t * 16)) < 0.12 ? 0.5 : 1.7 + 0.5 * Math.sin(t * 9);
    for (let i = 0; i < arcs.length; i++) arcs[i].visible = false;
    if (hash(tick) < 0.6) {
      const a = arcs[tick % 3];
      a.visible = true;
      a.scale.y = hash(tick + 0.5) < 0.5 ? 1 : -1;
    }
    for (let i = 0; i < sparks.length; i++) {
      const h = hash(Math.floor(tt * 6) * 7 + i * 13);
      const s = sparks[i];
      s.visible = h < 0.45;
      if (s.visible) {
        const p = spots[Math.floor(h * 13) % spots.length];
        s.position.set(p[0], p[1], p[2]);
        s.rotation.set(h * 9, h * 5, 0);
        s.scale.setScalar(0.6 + h * 2);
      }
    }
  };
}

function chairThrone(group, phase) {
  const gold = mat('#ffc53a', { rough: 0.3, metal: 0.45, emissive: '#6b4300', glow: 0.25 });
  const velvet = mat('#c8142c', { rough: 0.9 });
  const gems = ['#ff2d55', '#2f7bff', '#19d27a'].map((c) => mat(c, { rough: 0.12, metal: 0.1, flat: true, emissive: c, glow: 0.35 }));
  group.add(baked('chair:throne', (k) => {
    // gold plinth with a red carpet
    k.add(geo.rbox(2.9, 0.3, 2.9, 0.08, 2), gold, [0, 0.15, 0]);
    k.add(geo.rbox(2.5, 0.06, 2.5, 0.03, 1), mat('#951026', { rough: 0.9 }), [0, 0.32, 0.05]);
    // legs with ball feet, seat frame, velvet cushion (top at seat height)
    for (const z of [0.95, -0.8]) {
      k.pair(geo.sphere(0.24, 12, 10), gold, [1.05, 0.5, z]);
      k.pair(geo.cyl(0.15, 0.2, 1.1, 12), gold, [1.05, 1.05, z]);
    }
    k.add(geo.rbox(2.6, 0.36, 2.4, 0.08, 2), gold, [0, 1.62, 0.05]);
    k.add(geo.rbox(2.3, 0.26, 2.15, 0.12, 2), velvet, [0, SEAT_Y - 0.13, 0.1]);
    // low armrests ending in gold scroll balls
    k.pair(geo.rbox(0.3, 0.16, 2.0, 0.06, 2), gold, [1.3, 2.12, 0.05]);
    k.pair(geo.rbox(0.24, 0.09, 1.7, 0.04, 1), velvet, [1.3, 2.23, -0.02]);
    k.pair(geo.cyl(0.09, 0.11, 0.4, 10), gold, [1.3, 1.9, 0.9]);
    k.pair(geo.sphere(0.17, 12, 10), gold, [1.3, 2.2, 1.08]);
    // tall back: gold posts + crest framing a tufted velvet panel, crown points with gems
    k.pair(geo.rbox(0.34, 3.7, 0.42, 0.08, 2), gold, [1.18, 3.55, -0.95]);
    k.pair(geo.sphere(0.2, 12, 10), gold, [1.18, 5.58, -0.95]);
    k.add(geo.rbox(2.1, 3.0, 0.24, 0.1, 2), velvet, [0, 3.55, -0.97]);
    for (let row = 0; row < 4; row++) {
      for (const x of row % 2 ? [-0.3, 0.3] : [-0.6, 0, 0.6]) k.add(geo.sphere(0.055, 8, 6), gold, [x, 2.6 + row * 0.6, -0.84]);
    }
    k.add(geo.rbox(2.5, 0.34, 0.44, 0.08, 2), gold, [0, 5.15, -0.95]);
    k.add(geo.cone(0.17, 0.5, 4), gold, [0, 5.57, -0.95], [0, Math.PI / 4, 0]);
    k.pair(geo.cone(0.13, 0.36, 4), gold, [0.75, 5.5, -0.95], [0, Math.PI / 4, 0]);
    k.add(geo.oct(0.1), gems[0], [0, 5.87, -0.95]);
    k.pair(geo.oct(0.08), gems[2], [0.75, 5.72, -0.95]);
    k.add(geo.oct(0.2), gems[0], [0, 5.15, -0.72], null, [1, 1.3, 0.6]);
    k.pair(geo.oct(0.13), gems[1], [1.18, 4.6, -0.73], null, [1, 1.3, 0.6]);
    k.pair(geo.oct(0.11), gems[2], [1.18, 3.3, -0.73], null, [1, 1.3, 0.6]);
    k.pair(geo.oct(0.1), gems[1], [1.3, 2.2, 1.26], null, [1, 1, 0.6]);
  }));
  const twinkle = addSparkles(group, '#fff3b0', [[-1.0, 5.5, -0.6], [0.95, 5.95, -0.7], [0.35, 4.7, -0.55], [-0.5, 6.1, -0.9], [1.4, 3.9, -0.6]], 0.7);
  group.userData.update = (t) => twinkle(t + phase);
}

function boltGeometry() {
  return cached('geo:bolt', () => {
    const s = new THREE.Shape();
    const pts = [[-0.12, 0.8], [0.3, 0.8], [0.08, 0.18], [0.34, 0.18], [-0.2, -0.8], [-0.02, -0.08], [-0.3, -0.08]];
    s.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
  });
}

function boltMat() {
  return cached('mat:bolt', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#7ff3ff', emissive: '#38e8ff', emissiveIntensity: 1.8, roughness: 0.3 });
    m.userData.noShadow = true;
    return m;
  });
}

function hazardMat() {
  return cached('mat:hazard', () => new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 }));
}

function rgbMat() {
  return cached('mat:rgb', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: rainbowTexture(), emissiveIntensity: 1.6 });
    m.userData.noShadow = true;
    return m;
  });
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  s.moveTo(x + r, 0);
  s.lineTo(x + w - r, 0);
  s.quadraticCurveTo(x + w, 0, x + w, r);
  s.lineTo(x + w, h - r);
  s.quadraticCurveTo(x + w, h, x + w - r, h);
  s.lineTo(x + r, h);
  s.quadraticCurveTo(x, h, x, h - r);
  s.lineTo(x, r);
  s.quadraticCurveTo(x, 0, x + r, 0);
  return s;
}

// ---- Pets ------------------------------------------------------------------------------
// Pet Simulator-style critters: one big rounded block (head = body) on four stubby feet with
// a decal face. Body block spans x ±0.55, y 0.14..1.14, z ±0.5 (face at z = +0.5).

const TOP_Y = 1.14;
const FACE_Z = 0.5;
const DECAL_Z = FACE_Z + 0.03;
const RAINBOW = ['#ff6b8b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#b197fc'];
const PET_SPARKLE = { Epic: '#e7c2ff', Legendary: '#ffe680' };

function buildCritter(pet) {
  const { kind, body, accent } = pet.model;
  const def = Object.hasOwn(PET_KINDS, kind) ? PET_KINDS[kind] : PET_KINDS.dog;
  const key = `pet:${pet.id}`;
  const c = petPalette(body, accent, def.bodyLook);
  const phase = nextPhase();
  const root = new THREE.Group();
  root.name = key;
  const bob = new THREE.Group();
  root.add(bob);
  bob.add(baked(key, (k) => {
    k.add(geo.rbox(1.1, 1.0, 1.0, 0.22, 3), c.body, [0, 0.64, 0]);
    for (const z of [0.26, -0.26]) k.pair(geo.rbox(0.3, 0.2, 0.34, 0.08, 2), c[def.feet || 'dark'], [0.3, 0.1, z]);
    def.build(k, c);
  }));
  const eyes = def.eyes ? def.eyes(bob, c, key) : defaultEyes(bob, def.eyeY ?? 0.74, def.eyeScale ?? 1);
  const animate = def.animate ? def.animate(bob, c, key) : null;
  const twinkle = PET_SPARKLE[pet.rarity]
    ? addSparkles(root, PET_SPARKLE[pet.rarity], [[0.78, 1.3, 0.3], [-0.82, 0.9, 0.25], [0.62, 0.35, 0.6], [-0.5, 1.62, -0.2]], 0.5)
    : null;
  root.userData.update = (t) => {
    const tt = t + phase;
    if (def.hop) {
      const h = tt % 2.4;
      const air = h < 0.5 ? Math.sin((h / 0.5) * Math.PI) : 0;
      const crouch = h > 2.15 ? Math.sin(((h - 2.15) / 0.25) * Math.PI) : 0;
      bob.position.y = 0.4 * air;
      bob.scale.set(1 + 0.08 * crouch - 0.04 * air, 1 - 0.12 * crouch + 0.08 * air, 1 + 0.08 * crouch - 0.04 * air);
    } else {
      const s = Math.sin(tt * 3);
      bob.position.y = 0.06 + 0.06 * s;
      bob.scale.set(1 - 0.015 * s, 1 + 0.03 * s, 1 - 0.015 * s);
    }
    eyes.scale.y = tt % 3.7 < 0.12 ? 0.12 : 1;
    if (animate) animate(tt);
    if (twinkle) twinkle(tt);
  };
  return root;
}

function petPalette(body, accent, bodyLook = { rough: 0.55 }) {
  return {
    body: mat(body, bodyLook),
    accent: mat(accent, { rough: 0.55 }),
    dark: mat(shade(body, -0.25), { rough: 0.6 }),
    light: mat(shade(body, 0.5), { rough: 0.6 }),
    accentLight: mat(shade(accent, 0.35), { rough: 0.55 }),
    accentDark: mat(shade(accent, -0.25), { rough: 0.55 }),
    glow: mat(accent, { emissive: accent, glow: 0.9 }),
    ink: mat('#2b1d19', { rough: 0.45 }),
    pink: mat('#ff9fbf', { rough: 0.6 }),
    orange: mat('#ffa12b', { rough: 0.5 }),
  };
}

function defaultEyes(parent, y, scale) {
  const m = meshOf(decalGeo(FACE, 'eyes', 0.8 * scale, 0.4 * scale), decalMat());
  m.position.set(0, y, DECAL_Z + 0.005);
  parent.add(m);
  return m;
}

function decal(k, cell, w, h, p) {
  k.add(decalGeo(FACE, cell, w, h), decalMat(), p);
}

function blush(k, y, w = 0.94) {
  decal(k, 'blush', w, w / 4, [0, y, DECAL_Z]);
}

/** Occasional quick ear twitch (radians). */
function twitch(tt) {
  const u = tt % 3.3;
  return u < 0.24 ? Math.sin((u / 0.24) * Math.PI) * 0.22 : 0;
}

/** Left/right pivots sharing one baked part; returns [right, left]. */
function pivotPair(bob, p, key, fill) {
  return [pivot(bob, p, key, fill), pivot(bob, [-p[0], p[1], p[2]], key, fill)];
}

const Q = Math.PI / 4; // turns a 4-sided cone (pyramid) so a flat face points forward

const PET_KINDS = {
  dog: {
    build(k, c) {
      k.add(geo.rbox(0.34, 0.38, 0.03, 0.1, 2), c.accent, [-0.19, 0.8, FACE_Z + 0.005]);
      k.add(geo.rbox(0.52, 0.3, 0.2, 0.09, 2), c.light, [0, 0.46, 0.56]);
      k.add(geo.rbox(0.2, 0.12, 0.1, 0.05, 2), c.ink, [0, 0.58, 0.66]);
      decal(k, 'open', 0.2, 0.1, [0, 0.4, 0.662]);
      blush(k, 0.56);
    },
    animate(bob, c, key) {
      const [earR, earL] = pivotPair(bob, [0.5, 1.04, 0.02], `${key}:ear`, (k) =>
        k.add(geo.rbox(0.2, 0.56, 0.38, 0.09, 2), c.accent, [0, -0.24, 0]));
      const tail = pivot(bob, [0, 0.6, -0.5], `${key}:tail`, (k) =>
        k.add(geo.rbox(0.15, 0.15, 0.4, 0.07, 2), c.accent, [0, 0.13, -0.13], [0.8, 0, 0]));
      return (tt) => {
        const f = 0.12 * Math.sin(tt * 4);
        earR.rotation.z = 0.28 + f;
        earL.rotation.z = -0.28 - f;
        tail.rotation.y = 0.6 * Math.sin(tt * 11);
      };
    },
  },

  cat: {
    feet: 'accent',
    build(k, c) {
      k.add(geo.rbox(0.56, 0.28, 0.06, 0.1, 2), c.accent, [0, 0.46, 0.5]);
      k.add(geo.rbox(0.12, 0.08, 0.04, 0.03, 1), c.pink, [0, 0.575, 0.54]);
      decal(k, 'cat', 0.22, 0.11, [0, 0.47, 0.536]);
      blush(k, 0.58);
      for (const [dy, a] of [[0.05, 0.14], [-0.01, 0], [-0.07, -0.14]]) {
        k.pair(geo.box(0.34, 0.02, 0.02), c.ink, [0.5, 0.5 + dy, 0.53], [0, 0, a]);
      }
      for (const x of [-0.18, 0, 0.18]) k.add(geo.rbox(0.09, 0.04, 0.3, 0.02, 1), c.dark, [x, TOP_Y - 0.005, 0.12]);
    },
    animate(bob, c, key) {
      const [earR, earL] = pivotPair(bob, [0.32, 1.1, 0.02], `${key}:ear`, (k) => {
        k.add(geo.cone(0.2, 0.36, 4), c.body, [0, 0.16, 0], [0, Q, 0]);
        k.add(geo.cone(0.12, 0.22, 4), c.pink, [0, 0.12, 0.07], [0, Q, 0], [1, 1, 0.5]);
      });
      const tail = pivot(bob, [0, 0.4, -0.48], `${key}:tail`, (k) => {
        k.add(geo.cyl(0.07, 0.08, 0.5, 8), c.body, [0, 0.23, -0.1], [-0.4, 0, 0]);
        k.add(geo.sphere(0.1, 10, 8), c.accent, [0, 0.46, -0.2]);
      });
      return (tt) => {
        const tw = twitch(tt);
        earR.rotation.z = -0.15 - tw;
        earL.rotation.z = 0.15 + tw;
        tail.rotation.z = 0.35 * Math.sin(tt * 2.6);
      };
    },
  },

  bunny: {
    build(k, c) {
      k.add(geo.rbox(0.14, 0.09, 0.05, 0.03, 1), c.accent, [0, 0.58, 0.52]);
      decal(k, 'teeth', 0.22, 0.11, [0, 0.47, DECAL_Z]);
      blush(k, 0.58);
      k.add(geo.sphere(0.18, 12, 10), c.body, [0, 0.42, -0.52]);
    },
    animate(bob, c, key) {
      const ear = (k, y, len) => {
        k.add(geo.rbox(0.22, len, 0.13, 0.09, 2), c.body, [0, y, 0]);
        k.add(geo.rbox(0.11, len - 0.14, 0.02, 0.01, 1), c.accent, [0, y, 0.066]);
      };
      const up = pivot(bob, [0.22, 1.08, 0], `${key}:ear`, (k) => ear(k, 0.28, 0.56));
      const floppy = pivot(bob, [-0.22, 1.08, 0], `${key}:ear2`, (k) => {
        ear(k, 0.15, 0.3);
        k.frame([0, 0.28, 0], [1.0, 0, 0], () => ear(k, 0.13, 0.28));
      });
      return (tt) => {
        up.rotation.z = -0.12 - twitch(tt + 1.3);
        floppy.rotation.z = 0.16 + 0.06 * Math.sin(tt * 2);
      };
    },
  },

  frog: {
    hop: true,
    build(k, c) {
      k.pair(geo.sphere(0.25, 16, 12), c.body, [0.3, 1.1, 0.2]);
      k.add(geo.rbox(0.8, 0.32, 0.06, 0.12, 2), c.accent, [0, 0.32, 0.49]);
      decal(k, 'wide', 0.62, 0.155, [0, 0.62, DECAL_Z]);
      blush(k, 0.74, 1.0);
    },
    eyes(bob, c, key) {
      return pivot(bob, [0, 1.1, 0.2], `${key}:eyes`, (k) => {
        const white = mat('#ffffff', { rough: 0.3 });
        for (const x of [-0.3, 0.3]) {
          k.add(geo.sphere(0.17, 14, 10), c.ink, [x, 0.02, 0.2], null, [1, 1.08, 0.5]);
          k.add(geo.sphere(0.055, 8, 6), white, [x + 0.06, 0.09, 0.28]);
          k.add(geo.sphere(0.028, 6, 4), white, [x - 0.05, -0.05, 0.28]);
        }
      });
    },
  },

  pig: {
    feet: 'accent',
    eyeY: 0.8,
    build(k, c) {
      k.add(geo.rbox(0.4, 0.28, 0.14, 0.09, 2), c.accentLight, [0, 0.5, 0.56]);
      decal(k, 'nostrils', 0.34, 0.17, [0, 0.5, 0.632]);
      decal(k, 'smile', 0.2, 0.1, [0, 0.29, DECAL_Z]);
      blush(k, 0.6);
    },
    animate(bob, c, key) {
      const [earR, earL] = pivotPair(bob, [0.34, 1.1, 0.12], `${key}:ear`, (k) =>
        k.add(geo.cone(0.17, 0.28, 4), c.accent, [0, 0.12, 0], [0, Q, 0], [1, 1, 0.45]));
      const tail = pivot(bob, [0, 0.66, -0.52], `${key}:tail`, (k) =>
        k.add(geo.torus(0.11, 0.035, 6, 14, TAU * 0.85), c.accent, [0, 0, -0.04]));
      return (tt) => {
        const f = 0.08 * Math.sin(tt * 3);
        earR.rotation.set(0.55, 0, -0.4 - f);
        earL.rotation.set(0.55, 0, 0.4 + f);
        tail.rotation.z = 0.6 * Math.sin(tt * 7);
      };
    },
  },

  fox: {
    feet: 'ink',
    eyeY: 0.8,
    build(k, c) {
      k.add(geo.rbox(1.0, 0.46, 0.08, 0.14, 2), c.accent, [0, 0.4, 0.48]);
      k.add(geo.rbox(0.34, 0.22, 0.2, 0.08, 2), c.accent, [0, 0.52, 0.6]);
      k.add(geo.rbox(0.13, 0.09, 0.07, 0.03, 1), c.ink, [0, 0.61, 0.7]);
      decal(k, 'smile', 0.16, 0.08, [0, 0.47, 0.702]);
      blush(k, 0.56);
    },
    animate(bob, c, key) {
      const [earR, earL] = pivotPair(bob, [0.3, 1.1, 0], `${key}:ear`, (k) => {
        k.add(geo.cone(0.21, 0.44, 4), c.body, [0, 0.2, 0], [0, Q, 0]);
        k.add(geo.cone(0.12, 0.26, 4), c.accent, [0, 0.14, 0.08], [0, Q, 0], [1, 1, 0.5]);
        k.add(geo.cone(0.075, 0.14, 4), c.ink, [0, 0.36, 0], [0, Q, 0]);
      });
      const tail = pivot(bob, [0, 0.42, -0.46], `${key}:tail`, (k) => {
        k.add(geo.sphere(0.3, 14, 10), c.body, [0, 0.22, -0.3], [0.65, 0, 0], [0.85, 0.85, 1.4]);
        k.add(geo.sphere(0.21, 12, 8), c.accent, [0, 0.47, -0.62]);
      });
      return (tt) => {
        const tw = twitch(tt + 0.7);
        earR.rotation.z = -0.1 - tw;
        earL.rotation.z = 0.1 + tw;
        tail.rotation.y = 0.45 * Math.sin(tt * 4);
      };
    },
  },

  bear: {
    build(k, c) {
      k.add(geo.rbox(0.52, 0.32, 0.16, 0.1, 2), c.accent, [0, 0.46, 0.56]);
      k.add(geo.rbox(0.2, 0.12, 0.08, 0.05, 2), c.ink, [0, 0.58, 0.64]);
      decal(k, 'smile', 0.2, 0.1, [0, 0.41, 0.642]);
      blush(k, 0.58);
      k.add(geo.sphere(0.14, 10, 8), c.body, [0, 0.42, -0.52]);
    },
    animate(bob, c, key) {
      const [earR, earL] = pivotPair(bob, [0.36, 1.1, 0], `${key}:ear`, (k) => {
        k.add(geo.cyl(0.19, 0.19, 0.14, 18), c.body, [0, 0.08, 0], [HALF_PI, 0, 0]);
        k.add(geo.cyl(0.11, 0.11, 0.02, 14), c.accent, [0, 0.07, 0.075], [HALF_PI, 0, 0]);
      });
      return (tt) => {
        const f = 0.1 * Math.sin(tt * 2.5);
        earR.rotation.z = -f;
        earL.rotation.z = f;
      };
    },
  },

  penguin: {
    feet: 'orange',
    eyeY: 0.76,
    build(k, c) {
      k.add(geo.rbox(0.86, 0.82, 0.08, 0.2, 2), c.accent, [0, 0.58, 0.48]);
      k.add(geo.cone(0.1, 0.22, 4), c.orange, [0, 0.58, 0.62], [HALF_PI, 0, 0]);
      blush(k, 0.6, 0.86);
      k.add(geo.cone(0.09, 0.22, 6), c.body, [0.04, TOP_Y + 0.08, 0.08], [0, 0, -0.35]);
    },
    animate(bob, c, key) {
      const [fr, fl] = pivotPair(bob, [0.54, 0.88, 0], `${key}:flipper`, (k) =>
        k.add(geo.rbox(0.1, 0.52, 0.34, 0.05, 2), c.body, [0, -0.24, 0]));
      return (tt) => {
        const f = 0.35 + 0.28 * Math.sin(tt * 6);
        fr.rotation.z = f;
        fl.rotation.z = -f;
      };
    },
  },

  owl: {
    feet: 'accent',
    eyeScale: 1.3,
    build(k, c) {
      k.pair(geo.cyl(0.27, 0.27, 0.04, 22), c.light, [0.24, 0.74, 0.5], [HALF_PI, 0, 0]);
      k.add(geo.cone(0.09, 0.2, 4), c.accent, [0, 0.54, 0.56], [HALF_PI + 0.35, 0, 0]);
      k.add(geo.rbox(0.56, 0.3, 0.05, 0.14, 3), c.light, [0, 0.31, 0.5]);
      for (const [x, y] of [[-0.12, 0.35], [0.12, 0.35], [0, 0.26]]) {
        k.add(geo.cone(0.05, 0.07, 3), c.dark, [x, y, 0.53], [0, 0, Math.PI], [1, 1, 0.3]);
      }
      blush(k, 0.5, 0.96);
      k.pair(geo.cone(0.13, 0.36, 4), c.dark, [0.36, TOP_Y + 0.12, -0.02], [0, Q, -0.35]);
    },
    animate(bob, c, key) {
      const [wr, wl] = pivotPair(bob, [0.55, 0.92, -0.04], `${key}:wing`, (k) =>
        k.add(geo.rbox(0.12, 0.62, 0.6, 0.06, 2), c.dark, [0, -0.26, 0]));
      return (tt) => {
        const burst = Math.sin(tt * 0.9) > 0.3 ? 1 : 0.15;
        const f = 0.12 + 0.4 * burst * Math.abs(Math.sin(tt * 9));
        wr.rotation.z = f;
        wl.rotation.z = -f;
      };
    },
  },

  unicorn: {
    feet: 'accent',
    build(k, c) {
      const gold = mat('#ffd84d', { rough: 0.3, metal: 0.3 });
      k.frame([0, TOP_Y - 0.02, 0.26], [0.25, 0, 0], () => {
        k.add(geo.cone(0.1, 0.5, 12), gold, [0, 0.25, 0]);
        k.add(geo.torus(0.085, 0.02, 6, 14), gold, [0, 0.1, 0], [HALF_PI, 0, 0]);
        k.add(geo.torus(0.06, 0.018, 6, 14), gold, [0, 0.23, 0], [HALF_PI, 0, 0]);
      });
      const mane = [[0, 1.24, 0.08], [0, 1.3, -0.12], [0, 1.25, -0.32], [0, 1.06, -0.5], [0, 0.84, -0.54], [0, 0.62, -0.52]];
      mane.forEach((p, i) => k.add(geo.rbox(0.28, 0.26, 0.24, 0.1, 2), mat(RAINBOW[i], { rough: 0.5 }), p));
      k.add(geo.rbox(0.2, 0.2, 0.14, 0.07, 2), mat(RAINBOW[5], { rough: 0.5 }), [-0.2, 1.1, 0.44], [0, 0, 0.35]);
      k.add(geo.rbox(0.18, 0.18, 0.14, 0.07, 2), mat(RAINBOW[0], { rough: 0.5 }), [0.2, 1.12, 0.44], [0, 0, -0.35]);
      k.pair(geo.cone(0.12, 0.26, 4), c.body, [0.36, TOP_Y + 0.1, -0.02], [0, Q, -0.2]);
      k.pair(geo.cone(0.07, 0.16, 4), c.pink, [0.365, TOP_Y + 0.08, 0.035], [0, Q, -0.2], [1, 1, 0.5]);
      decal(k, 'smile', 0.2, 0.1, [0, 0.45, DECAL_Z]);
      blush(k, 0.56);
    },
    animate(bob, c, key) {
      const tail = pivot(bob, [0, 0.5, -0.5], `${key}:tail`, (k) => {
        ['#ff7eb6', '#b197fc', '#74c0fc'].forEach((color, i) =>
          k.add(geo.sphere(0.15 - i * 0.02, 12, 8), mat(color, { rough: 0.5 }), [0, -0.05 - i * 0.14, -0.12 - i * 0.08]));
      });
      return (tt) => {
        tail.rotation.z = 0.3 * Math.sin(tt * 3);
      };
    },
  },

  dragon: {
    build(k, c) {
      k.pair(geo.cone(0.09, 0.36, 8), mat('#fff1c1', { rough: 0.4 }), [0.3, TOP_Y + 0.1, -0.12], [-0.5, 0, -0.25]);
      k.add(geo.rbox(0.72, 0.36, 0.05, 0.1, 2), c.accent, [0, 0.33, 0.5]);
      for (const y of [0.27, 0.38]) k.add(geo.box(0.58, 0.018, 0.02), c.accentDark, [0, y, 0.53]);
      for (let i = 0; i < 3; i++) k.add(geo.cone(0.09, 0.2, 4), c.accent, [0, TOP_Y + 0.06, -0.08 - i * 0.16], [0, Q, 0]);
      for (const y of [0.95, 0.74]) k.add(geo.cone(0.08, 0.18, 4), c.accent, [0, y, -0.53], [-HALF_PI, 0, 0]);
      decal(k, 'fang', 0.24, 0.12, [0, 0.52, DECAL_Z]);
      blush(k, 0.58);
    },
    animate(bob, c, key) {
      const wing = (k) => {
        k.add(wingGeometry(), c.accent, [0, 0, 0], null, 1.3);
        k.rod(c.body, [0, 0, 0.04], [0.16, 0.39, 0.04], 0.04);
        k.rod(c.body, [0.16, 0.39, 0.04], [0.8, 0.6, 0.04], 0.035);
      };
      const [wr, wl] = pivotPair(bob, [0.28, 0.9, -0.48], `${key}:wing`, wing);
      wl.scale.x = -1;
      const tail = pivot(bob, [0, 0.36, -0.48], `${key}:tail`, (k) => {
        k.add(geo.cone(0.15, 0.6, 8), c.body, [0, 0, -0.28], [-HALF_PI, 0, 0]);
        k.add(geo.oct(0.13), c.accent, [0, 0, -0.6], null, [0.5, 1, 1]);
      });
      // periodic little flame puff from the mouth
      const puff = new THREE.Group();
      puff.position.set(0, 0.52, 0.56);
      bob.add(puff);
      const flames = [
        mat('#ffe14d', { emissive: '#ffc400', glow: 1.4, shadow: false }),
        mat('#ff8a1c', { emissive: '#ff6a00', glow: 1.4, shadow: false }),
        mat('#ff5a1c', { emissive: '#ff3d00', glow: 1.2, shadow: false }),
      ].map((m) => {
        const mesh = meshOf(geo.sphere(0.1, 10, 8), m);
        mesh.visible = false;
        puff.add(mesh);
        return mesh;
      });
      return (tt) => {
        const f = 0.35 * Math.sin(tt * 8);
        wr.rotation.set(0, 0.5, f);
        wl.rotation.set(0, -0.5, -f);
        tail.rotation.y = 0.4 * Math.sin(tt * 3);
        const u = (tt % 3.4) / 0.9;
        for (let i = 0; i < flames.length; i++) {
          const v = u - i * 0.12;
          const m = flames[i];
          m.visible = v > 0 && v < 1;
          if (m.visible) {
            m.position.set(0, v * 0.1, 0.05 + v * 0.45);
            m.scale.setScalar(Math.sin(v * Math.PI) * (1.6 - i * 0.3));
          }
        }
      };
    },
  },

  robot: {
    bodyLook: { rough: 0.35, metal: 0.35 },
    build(k, c) {
      k.add(geo.rbox(0.88, 0.58, 0.05, 0.08, 2), mat('#0f172a', { rough: 0.3 }), [0, 0.72, 0.5]);
      k.add(decalGeo(ROBOT, 'mouth', 0.3, 0.15), robotFaceMat(), [0, 0.57, DECAL_Z]);
      k.pair(geo.cyl(0.14, 0.14, 0.1, 16), c.dark, [0.58, 0.72, 0], [0, 0, HALF_PI]);
      k.pair(geo.cyl(0.08, 0.08, 0.04, 12), c.glow, [0.64, 0.72, 0], [0, 0, HALF_PI]);
      for (const [x, color] of [[-0.18, '#ff5c5c'], [0, '#ffd43b'], [0.18, '#4cd964']]) {
        k.add(geo.cyl(0.055, 0.055, 0.05, 12), mat(color, { emissive: color, glow: 0.35 }), [x, 0.3, 0.5], [HALF_PI, 0, 0]);
      }
      k.pair(geo.sphere(0.035, 6, 4), c.dark, [0.4, 0.3, 0.495]);
    },
    eyes(bob) {
      const m = meshOf(decalGeo(ROBOT, 'eyes', 0.66, 0.33), robotFaceMat());
      m.position.set(0, 0.8, DECAL_Z + 0.005);
      bob.add(m);
      return m;
    },
    animate(bob, c, key) {
      const antenna = pivot(bob, [0, TOP_Y - 0.02, 0], `${key}:antenna`, (k) => {
        k.add(geo.cyl(0.03, 0.04, 0.3, 8), c.dark, [0, 0.15, 0]);
        k.add(geo.sphere(0.09, 12, 10), c.glow, [0, 0.33, 0]);
      });
      return (tt) => {
        antenna.rotation.z = 0.18 * Math.sin(tt * 4.5);
        antenna.rotation.x = 0.08 * Math.sin(tt * 3.1);
      };
    },
  },
};

function wingGeometry() {
  return cached('geo:wing', () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.02);
    s.lineTo(0.12, 0.3);
    s.lineTo(0.62, 0.46);
    s.quadraticCurveTo(0.56, 0.26, 0.6, 0.1);
    s.quadraticCurveTo(0.45, 0.2, 0.36, 0.02);
    s.quadraticCurveTo(0.22, 0.12, 0.08, -0.12);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 6 });
  });
}

// ---- Lucky blocks ----------------------------------------------------------------------

function blockMaterial(block) {
  return cached(`mat:block:${block.id}`, () => {
    if (block.id !== 'secret') return new THREE.MeshStandardMaterial({ map: blockFaceTexture(block), roughness: 0.45 });
    return new THREE.MeshStandardMaterial({
      map: blockFaceTexture(block), emissive: '#ffffff', emissiveMap: secretGlowTexture(), emissiveIntensity: 1.2, roughness: 0.4,
    });
  });
}

function starterBlock(block) {
  const group = new THREE.Group();
  group.name = `block:${block.id}`;
  const cube = meshOf(geo.rbox(3, 3, 3, 0.16, 2), blockMaterial(block));
  group.add(cube);
  const phase = nextPhase();
  group.userData.update = (t) => {
    cube.position.y = 1.56 + 0.06 * Math.sin((t + phase) * 1.8);
  };
  group.userData.update(0);
  return group;
}

function secretBlock(block) {
  const group = new THREE.Group();
  group.name = `block:${block.id}`;
  const material = blockMaterial(block);
  const cube = meshOf(geo.rbox(3, 3, 3, 0.16, 2), material);
  group.add(cube);
  // faint purple aura around the block and a glow pool on the ground
  const auraMat = cached('mat:secretAura', () => new THREE.SpriteMaterial({
    map: glowTexture(), color: '#b86bff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5,
  }));
  const aura = new THREE.Sprite(auraMat);
  group.add(aura);
  const pool = new THREE.Mesh(geo.plane(), cached('mat:secretPool', () => new THREE.MeshBasicMaterial({
    map: glowTexture(), color: '#a855f7', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55,
  })));
  pool.rotation.x = -HALF_PI;
  pool.position.y = 0.03;
  pool.scale.setScalar(5.6);
  group.add(pool);
  const twinkle = addSparkles(group, '#f0d4ff', [[1.9, 3.4, 1.0], [-1.8, 2.6, 1.3], [1.2, 0.9, 1.9], [-1.4, 4.0, -1.2], [0.2, 4.3, 1.6]], 0.8);
  const phase = nextPhase();
  group.userData.update = (t) => {
    const tt = t + phase;
    const y = 1.8 + 0.2 * Math.sin(tt * 1.4);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    cube.position.y = y;
    cube.rotation.y = tt * 0.5;
    aura.position.y = y;
    aura.scale.setScalar(5.6 + 0.6 * pulse);
    auraMat.opacity = 0.35 + 0.25 * pulse;
    material.emissiveIntensity = 0.9 + 0.6 * pulse;
    twinkle(tt);
  };
  group.userData.update(0);
  return group;
}

// ---- Canvas textures -------------------------------------------------------------------

function canvasTexture(key, w, h, draw, setup = null) {
  return cached(`tex|${key}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (setup) setup(t);
    return t;
  });
}

function ellipse(g, x, y, rx, ry) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fill();
}

/** Face decal atlas: cells are [x0, y0, x1, y1] in canvas pixels. */
const FACE = {
  key: 'face', w: 512, h: 256,
  cells: {
    eyes: [0, 0, 256, 128], blush: [256, 0, 512, 64], smile: [256, 64, 384, 128], cat: [384, 64, 512, 128],
    open: [0, 128, 128, 192], fang: [128, 128, 256, 192], teeth: [256, 128, 384, 192], nostrils: [384, 128, 512, 192],
    wide: [0, 192, 256, 256],
  },
};
const ROBOT = { key: 'robot', w: 256, h: 256, cells: { eyes: [0, 0, 256, 128], mouth: [0, 128, 256, 256] } };

/** Plane of size w×h showing one atlas cell. */
function decalGeo(atlas, cell, w, h) {
  return cached(`decal|${atlas.key}|${cell}|${w}|${h}`, () => {
    const [x0, y0, x1, y1] = atlas.cells[cell];
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / atlas.w, 1 - (y1 - uv.getY(i) * (y1 - y0)) / atlas.h);
    }
    return g;
  });
}

function faceAtlas() {
  return canvasTexture(FACE.key, FACE.w, FACE.h, (g) => {
    const ink = '#2b1b1b';
    const cell = (name, draw) => {
      g.save();
      g.translate(FACE.cells[name][0], FACE.cells[name][1]);
      draw();
      g.restore();
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    cell('eyes', () => {
      for (const cx of [70, 186]) {
        const grad = g.createLinearGradient(0, 18, 0, 110);
        grad.addColorStop(0, '#141219');
        grad.addColorStop(0.6, '#1d1a2b');
        grad.addColorStop(1, '#4d4680');
        g.fillStyle = grad;
        ellipse(g, cx, 64, 36, 46);
        g.fillStyle = '#ffffff';
        ellipse(g, cx + 12, 46, 12, 13);
        ellipse(g, cx - 13, 84, 6, 6);
      }
    });
    cell('blush', () => {
      for (const cx of [44, 212]) {
        g.save();
        g.translate(cx, 32);
        g.scale(1, 0.5);
        const r = g.createRadialGradient(0, 0, 0, 0, 0, 30);
        r.addColorStop(0, 'rgba(255,105,145,0.75)');
        r.addColorStop(0.55, 'rgba(255,105,145,0.5)');
        r.addColorStop(1, 'rgba(255,105,145,0)');
        g.fillStyle = r;
        ellipse(g, 0, 0, 30, 30);
        g.restore();
      }
    });
    cell('smile', () => {
      g.strokeStyle = ink;
      g.lineWidth = 7;
      g.beginPath();
      g.arc(64, 18, 20, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    });
    cell('cat', () => {
      g.strokeStyle = ink;
      g.lineWidth = 6;
      for (const cx of [52, 76]) {
        g.beginPath();
        g.arc(cx, 22, 12, 0.05 * Math.PI, 0.95 * Math.PI);
        g.stroke();
      }
    });
    const openMouth = (fangs) => {
      const path = () => {
        g.beginPath();
        g.moveTo(38, 14);
        g.lineTo(90, 14);
        g.quadraticCurveTo(90, 58, 64, 58);
        g.quadraticCurveTo(38, 58, 38, 14);
        g.closePath();
      };
      path();
      g.fillStyle = '#5a1822';
      g.fill();
      g.save();
      path();
      g.clip();
      g.fillStyle = '#ff6f8a';
      ellipse(g, 64, 54, 18, 11);
      g.restore();
      if (fangs) {
        g.fillStyle = '#ffffff';
        for (const x of [45, 74]) {
          g.beginPath();
          g.moveTo(x, 14);
          g.lineTo(x + 10, 14);
          g.lineTo(x + 5, 29);
          g.fill();
        }
      }
      path();
      g.strokeStyle = ink;
      g.lineWidth = 4;
      g.stroke();
    };
    cell('open', () => openMouth(false));
    cell('fang', () => openMouth(true));
    cell('teeth', () => {
      g.fillStyle = '#ffffff';
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.fillRect(52, 24, 24, 17);
      g.strokeRect(52, 24, 24, 17);
      g.beginPath();
      g.moveTo(64, 24);
      g.lineTo(64, 41);
      g.stroke();
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(42, 14);
      g.quadraticCurveTo(53, 28, 64, 20);
      g.quadraticCurveTo(75, 28, 86, 14);
      g.stroke();
    });
    cell('nostrils', () => {
      g.fillStyle = '#a8435f';
      ellipse(g, 34, 32, 12, 17);
      ellipse(g, 94, 32, 12, 17);
    });
    cell('wide', () => {
      g.strokeStyle = '#1f3312';
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(36, 18);
      g.quadraticCurveTo(128, 64, 220, 18);
      g.stroke();
    });
  });
}

function robotAtlas() {
  return canvasTexture(ROBOT.key, ROBOT.w, ROBOT.h, (g) => {
    g.fillStyle = '#8ffaff';
    g.strokeStyle = '#8ffaff';
    g.shadowColor = '#38bdf8';
    g.shadowBlur = 18;
    ellipse(g, 76, 64, 24, 34);
    ellipse(g, 180, 64, 24, 34);
    g.lineCap = 'round';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(128, 146, 50, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  });
}

function grainTexture() {
  return canvasTexture('grain', 128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = hash(i) * w;
      g.strokeStyle = `rgba(90,55,25,${0.06 + hash(i + 50) * 0.1})`;
      g.lineWidth = 1 + hash(i + 99) * 3;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 6, h * 0.33, x - 6, h * 0.66, x + (hash(i + 7) - 0.5) * 8, h);
      g.stroke();
    }
  });
}

function glintTexture() {
  return canvasTexture('glint', 128, 128, (g, w, h) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineCap = 'round';
    for (const [lw, x0, y0, x1, y1] of [[12, 18, 96, 96, 18], [5, 46, 112, 112, 46]]) {
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  });
}

function hazardTexture() {
  return canvasTexture('hazard', 176, 16, (g, w, h) => {
    g.fillStyle = '#ffd21f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1b1b';
    for (let x = -16; x < w + 16; x += 16) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 8, h);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 8, 0);
      g.fill();
    }
  });
}

function rainbowTexture() {
  return canvasTexture('rainbow', 256, 4, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      g.fillStyle = `hsl(${(x / w) * 360}, 100%, 55%)`;
      g.fillRect(x, 0, 1, h);
    }
  }, (t) => {
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(2, 1);
  });
}

function starTexture() {
  return canvasTexture('star', 64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,0.9)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.3)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(32, 2);
    g.quadraticCurveTo(35, 29, 62, 32);
    g.quadraticCurveTo(35, 35, 32, 62);
    g.quadraticCurveTo(29, 35, 2, 32);
    g.quadraticCurveTo(29, 29, 32, 2);
    g.fill();
  });
}

function glowTexture() {
  return canvasTexture('glow', 128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
}

/** Chunky "?" with dark outline and drop shadow, centered in a 256² canvas. */
function questionMark(g, fill, outline, shadow) {
  const hook = () => {
    g.beginPath();
    g.arc(128, 98, 42, Math.PI * 1.08, Math.PI * 2.22);
    g.quadraticCurveTo(128, 136, 128, 162);
  };
  const glyph = (color, width, dot) => {
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = width;
    hook();
    g.stroke();
    ellipse(g, 128, 208, dot, dot);
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (shadow) {
    g.save();
    g.translate(7, 8);
    glyph(shadow, 46, 26);
    g.restore();
  }
  if (outline) glyph(outline, 46, 26);
  glyph(fill, 24, 15);
}

/** Mario-style block face: bevel shading, dark rim, corner rivets and a big "?". */
function blockFaceTexture(block) {
  const secret = block.id === 'secret';
  return canvasTexture(`block:${block.id}`, 256, 256, (g) => {
    g.fillStyle = block.color;
    g.fillRect(0, 0, 256, 256);
    const b = 18;
    const poly = (pts, color) => {
      g.fillStyle = color;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.fill();
    };
    poly([[0, 0], [256, 0], [256 - b, b], [b, b], [b, 256 - b], [0, 256]], 'rgba(255,255,255,0.35)');
    poly([[256, 256], [0, 256], [b, 256 - b], [256 - b, 256 - b], [256 - b, b], [256, 0]], 'rgba(60,20,0,0.28)');
    g.strokeStyle = secret ? '#3d1466' : '#8a5a00';
    g.lineWidth = 5;
    g.strokeRect(2.5, 2.5, 251, 251);
    if (secret) {
      g.fillStyle = 'rgba(255,255,255,0.45)';
      for (let i = 0; i < 16; i++) ellipse(g, 30 + hash(i + 3) * 196, 30 + hash(i + 40) * 196, 2.5, 2.5);
    }
    for (const [x, y] of [[34, 34], [222, 34], [34, 222], [222, 222]]) {
      g.fillStyle = secret ? '#4b1f7a' : '#a36a00';
      ellipse(g, x, y, 9, 9);
      g.fillStyle = 'rgba(255,255,255,0.6)';
      ellipse(g, x - 3, y - 3, 3, 3);
    }
    if (secret) questionMark(g, '#fff0ff', '#2a0845', 'rgba(40,0,80,0.45)');
    else questionMark(g, '#ffffff', '#1b1b1b', 'rgba(120,60,0,0.45)');
  });
}

/** Emissive map for the secret block: a glowing "?" (and faint stars) on black. */
function secretGlowTexture() {
  return canvasTexture('block:secret:glow', 256, 256, (g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 16; i++) ellipse(g, 30 + hash(i + 3) * 196, 30 + hash(i + 40) * 196, 2.5, 2.5);
    g.shadowColor = '#ff9bff';
    g.shadowBlur = 22;
    questionMark(g, '#ffd6ff', null, null);
  });
}
