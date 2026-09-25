// Classic Roblox R6 avatar: blocky parts colored from the player's look, a canvas face
// decal, procedural hair (Bald / Bacon / Spiky / Long) and a small pose-blending animation
// system (idle, walk, jump, fall, sit + typing, cheer, dizzy, reactions, eliminated flight).
//
// Model space: faces +Z, feet at y = 0. Legs 0..2, torso 2..4, head ~4..5.25.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HAIR_STYLES, sanitizeLook } from '../shared/catalog.js';
import { colorMaterial, greyHex } from './materials.js';
import { faceTexture } from './textures.js';
import { TAU, clamp, damp, easeInOutCubic, lerp } from './math.js';

export const WALK_SPEED = 16;
const HEAD_SIZE = 1.25;
const CENTER_Y = 3; // torso center: pivot for spins / leans
const SIT_LIFT = 0.5; // seated legs are horizontal, so the hips rise to rest them on the seat
const HEAD_TOP = 4 + HEAD_SIZE;
const FLIGHT_TIME = 2;
const FLIGHT_HEIGHT = 15;

// Pose channels (radians unless noted).
const LAX = 0; // left arm swing (+ = backward)
const LAZ = 1; // left arm outward
const RAX = 2;
const RAZ = 3;
const LLX = 4; // left leg swing
const LLZ = 5;
const RLX = 6;
const RLZ = 7;
const HX = 8; // head pitch (+ = look down)
const HY = 9; // head yaw
const HZ = 10; // head roll
const BX = 11; // body lean forward
const BZ = 12; // body roll
const BY = 13; // body lift (units)
const CHANNELS = 14;

const IDLE = 0;
const WALK = 1;
const JUMP = 2;
const FALL = 3;
const SIT = 4;
const STATES = 5;
const LOCO = { idle: IDLE, walk: WALK, jump: JUMP, fall: FALL };

// ---- Shared geometry ---------------------------------------------------------------------

let shared = null;
function geometries() {
  if (shared) return shared;
  const head = new RoundedBoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE, 3, 0.34);
  shared = {
    torso: new RoundedBoxGeometry(2, 2, 1, 2, 0.08),
    limb: new RoundedBoxGeometry(1, 2, 1, 2, 0.08),
    head,
    face: faceDecalGeometry(head),
    hair: { Bacon: baconHair(), Spiky: spikyHair(), Long: longHair() },
    star: starGeometry(),
  };
  return shared;
}

/** The head's +Z face (BoxGeometry group 4), pushed out a hair so it can carry the face. */
function faceDecalGeometry(head) {
  // RoundedBoxGeometry is non-indexed: group ranges address vertices directly.
  const { start, count } = head.groups.find((g) => g.materialIndex === 4);
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = head.getAttribute(name);
    g.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  g.scale(1.012, 1.012, 1.012);
  return g;
}

/** Merges hair parts, some indexed (cones, strands) and some not (rounded boxes). */
function merge(parts) {
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

/** Cap of hair over the top/back/sides of the head (head-centered coordinates). */
function hairCap() {
  return [
    new RoundedBoxGeometry(1.38, 0.5, 1.38, 3, 0.24).translate(0, 0.5, 0),
    new RoundedBoxGeometry(1.38, 0.95, 0.52, 2, 0.2).translate(0, 0.2, -0.44),
    new RoundedBoxGeometry(0.24, 0.62, 1.05, 2, 0.1).translate(-0.62, 0.3, -0.1),
    new RoundedBoxGeometry(0.24, 0.62, 1.05, 2, 0.1).translate(0.62, 0.3, -0.1),
  ];
}

/**
 * Rectangular strand swept along a curve, rippled along its normal (the "bacon" wave).
 * `side` sets the frame: normal = side × tangent must point away from the head.
 */
function strand(points, { width, thickness, waves = 0, amp = 0, side, segments = 28 }) {
  const curve = new THREE.CatmullRomCurve3(points);
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const S = new THREE.Vector3();
  const pos = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, P);
    curve.getTangentAt(u, T);
    N.crossVectors(side, T).normalize();
    S.crossVectors(T, N).normalize();
    P.addScaledVector(N, Math.sin(u * waves * TAU) * amp);
    const w = (width * (1 - u * u * 0.45)) / 2;
    const t = thickness / 2;
    for (const [a, b] of [[w, t], [-w, t], [-w, -t], [w, -t]]) {
      pos.push(P.x + S.x * a + N.x * b, P.y + S.y * a + N.y * b, P.z + S.z * a + N.z * b);
    }
  }
  const index = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 4;
    const b = a + 4;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      index.push(a + k, b + k, a + k2, a + k2, b + k, b + k2);
    }
  }
  const e = segments * 4;
  index.push(0, 1, 2, 0, 2, 3, e, e + 2, e + 1, e, e + 3, e + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Roblox's iconic "Bacon Hair": wavy strands over a cap, with a side-swept wavy fringe. */
function baconHair() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const parts = hairCap();
  const sideX = V(1, 0, 0);
  for (let i = 0; i < 5; i++) {
    const x = -0.52 + i * 0.26;
    parts.push(
      strand([V(x, -0.2, -0.74), V(x * 1.02, 0.45, -0.72), V(x, 0.8, -0.2), V(x, 0.82, 0.3), V(x * 0.9, 0.7, 0.72)], {
        width: 0.3, thickness: 0.14, waves: 3, amp: 0.05, side: sideX,
      }),
    );
  }
  const up = V(0, 1, 0);
  for (let i = 0; i < 3; i++) {
    const y = 0.72 - i * 0.1;
    parts.push(
      strand([V(0.58, y + 0.08, 0.5), V(0.25, y + 0.02, 0.72), V(-0.15, y - 0.12, 0.74), V(-0.62, y - 0.34, 0.62)], {
        width: 0.26, thickness: 0.13, waves: 2, amp: 0.06, side: up,
      }),
    );
  }
  return merge(parts);
}

function spikyHair() {
  const parts = hairCap();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const add = (x, y, z, tilt, dirA, len = 0.8) => {
    const g = new THREE.ConeGeometry(0.21, len, 5).translate(0, len / 2, 0);
    axis.set(Math.sin(dirA), 0, -Math.cos(dirA));
    g.applyQuaternion(q.setFromAxisAngle(axis, tilt));
    parts.push(g.translate(x, y, z));
  };
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    add(Math.cos(a) * 0.42, 0.66, Math.sin(a) * 0.42 - 0.05, 0.75, Math.atan2(Math.sin(a), Math.cos(a)));
  }
  add(0, 0.72, -0.05, 0, 0, 0.95);
  for (const x of [-0.35, 0, 0.35]) add(x, 0.62, 0.45, 1.05, Math.PI / 2, 0.7);
  return merge(parts);
}

function longHair() {
  return merge([
    ...hairCap(),
    new RoundedBoxGeometry(1.44, 1.95, 0.42, 2, 0.17).translate(0, -0.32, -0.5),
    new RoundedBoxGeometry(0.3, 1.5, 0.82, 2, 0.12).translate(-0.67, -0.2, -0.05),
    new RoundedBoxGeometry(0.3, 1.5, 0.82, 2, 0.12).translate(0.67, -0.2, -0.05),
    new RoundedBoxGeometry(1.42, 0.3, 0.3, 2, 0.12).translate(0, 0.42, 0.56),
  ]);
}

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.08 : 0.2;
    if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(shape);
}

const faceMaterials = new Map();
function faceMaterial(index) {
  let m = faceMaterials.get(index);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      map: faceTexture(index),
      transparent: true,
      alphaTest: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    faceMaterials.set(index, m);
  }
  return m;
}

let starMaterial = null;

// ---- Avatar --------------------------------------------------------------------------------

export class Avatar {
  constructor(look) {
    const G = geometries();
    this.root = new THREE.Group(); // world position + facing (owned by the player entity)
    this.body = new THREE.Group(); // local offsets: sit lift, hops, eliminated flight
    this.spin = new THREE.Group(); // rotations around the torso center
    this.spin.position.y = CENTER_Y;
    this.rig = new THREE.Group();
    this.rig.position.y = -CENTER_Y;
    this.root.add(this.body);
    this.body.add(this.spin);
    this.spin.add(this.rig);

    const part = (geo, x, y, z) => {
      const m = new THREE.Mesh(geo);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    const pivot = (x, y, z, child) => {
      const p = new THREE.Group();
      p.position.set(x, y, z);
      p.add(child);
      this.rig.add(p);
      return p;
    };
    this.torso = part(G.torso, 0, 3, 0);
    this.rig.add(this.torso);
    this.lArmMesh = part(G.limb, 0, -0.5, 0);
    this.rArmMesh = part(G.limb, 0, -0.5, 0);
    this.lLegMesh = part(G.limb, 0, -1, 0);
    this.rLegMesh = part(G.limb, 0, -1, 0);
    // R6 joints: shoulders 0.5 below the top of the arm, hips at the top of the legs.
    this.lArm = pivot(-1.5, 3.5, 0, this.lArmMesh);
    this.rArm = pivot(1.5, 3.5, 0, this.rArmMesh);
    this.lLeg = pivot(-0.5, 2, 0, this.lLegMesh);
    this.rLeg = pivot(0.5, 2, 0, this.rLegMesh);

    this.head = new THREE.Group(); // pivot at the neck
    this.head.position.set(0, 4, 0);
    this.rig.add(this.head);
    this.headMesh = part(G.head, 0, HEAD_SIZE / 2, 0);
    this.face = new THREE.Mesh(G.face);
    this.face.position.copy(this.headMesh.position);
    this.hair = part(G.hair.Bacon, 0, HEAD_SIZE / 2, 0);
    this.head.add(this.headMesh, this.face, this.hair);

    this.weights = new Float32Array(STATES);
    this.weights[IDLE] = 1;
    this.pose = new Float32Array(CHANNELS);
    this.tmp = new Float32Array(CHANNELS);
    this.loco = IDLE;
    this.speed = 0;
    this.walkPhase = 0;
    this.seated = false;
    this.typing = false;
    this.out = false;
    this.wType = 0;
    this.wDizzy = 0;
    this.wCheer = 0;
    this.cheerT = 0;
    this.shakeT = 0;
    this.flinchT = 0;
    this.nodT = 0;
    this.flightT = -1;
    this.landT = 0;
    this.stars = null;
    this.look = null;
    this.setLook(look);
  }

  setLook(look) {
    this.look = sanitizeLook(look);
    this.applyColors();
    const style = HAIR_STYLES[this.look.hairStyle];
    const hairGeo = geometries().hair[style];
    this.hair.visible = !!hairGeo;
    if (hairGeo) this.hair.geometry = hairGeo;
    this.face.material = faceMaterial(this.look.face);
  }

  applyColors() {
    const c = this.out ? greyHex : (h) => h;
    const skin = colorMaterial(c(this.look.skin));
    this.headMesh.material = skin;
    this.lArmMesh.material = skin;
    this.rArmMesh.material = skin;
    this.torso.material = colorMaterial(c(this.look.shirt));
    this.lLegMesh.material = this.rLegMesh.material = colorMaterial(c(this.look.pants));
    this.hair.material = colorMaterial(c(this.look.hair));
  }

  /** anim: 'idle' | 'walk' | 'jump' | 'fall'; speed in units/s (drives the walk cycle). */
  setLocomotion(anim, speed) {
    this.loco = LOCO[anim] ?? IDLE;
    this.speed = speed;
  }

  setSeated(on) {
    this.seated = on;
  }

  setTyping(on) {
    this.typing = on;
  }

  /** Knocked out: greyed out and dizzy. */
  setOut(on) {
    if (on === this.out) return;
    this.out = on;
    this.applyColors();
  }

  cheer(seconds = 3) {
    this.cheerT = Math.max(this.cheerT, seconds);
  }
  shakeHead() {
    this.shakeT = 0.6;
  }
  flinch() {
    this.flinchT = 0.55;
  }
  nod() {
    this.nodT = 0.5;
  }
  /** Eliminated: launched ~15 units up in an arc with spins, landing back where it started. */
  launch() {
    this.flightT = 0;
  }

  /** Height of the top of the head above the root (includes sit lift / hops / flight). */
  headTop() {
    return this.body.position.y + HEAD_TOP;
  }

  update(dt, t) {
    const w = this.weights;
    const target = this.seated ? SIT : this.loco;
    for (let s = 0; s < STATES; s++) {
      w[s] = damp(w[s], s === target ? 1 : 0, s === JUMP || s === FALL ? 16 : 10, dt);
    }
    this.walkPhase += dt * Math.max(this.speed, 4) * 0.62;

    const o = this.pose;
    o.fill(0);
    let total = 0;
    for (let s = 0; s < STATES; s++) {
      if (w[s] < 0.002) continue;
      this.statePose(s, t, this.tmp);
      for (let k = 0; k < CHANNELS; k++) o[k] += this.tmp[k] * w[s];
      total += w[s];
    }
    if (total > 0) for (let k = 0; k < CHANNELS; k++) o[k] /= total;

    this.applyModifiers(dt, t, o);
    this.applyPose(dt, t, o);
  }

  statePose(state, t, o) {
    o.fill(0);
    switch (state) {
      case IDLE: {
        const b = Math.sin(t * 1.8);
        o[LAX] = b * 0.05;
        o[RAX] = -b * 0.05;
        o[LAZ] = o[RAZ] = 0.05 + b * 0.015;
        o[HX] = Math.sin(t * 0.9) * 0.03;
        o[HY] = Math.sin(t * 0.37) * 0.14;
        o[BY] = b * 0.02;
        break;
      }
      case WALK: {
        const s = Math.sin(this.walkPhase);
        const amp = 0.35 + 0.6 * clamp(this.speed / WALK_SPEED, 0, 1);
        o[LLX] = s * amp;
        o[RLX] = -s * amp;
        o[LAX] = -s * amp;
        o[RAX] = s * amp;
        o[LAZ] = o[RAZ] = 0.05;
        o[BX] = 0.05;
        o[BY] = Math.abs(Math.cos(this.walkPhase)) * 0.12;
        break;
      }
      case JUMP:
        o[LAX] = o[RAX] = -2.95;
        o[LAZ] = o[RAZ] = 0.14;
        o[LLX] = -0.15;
        o[RLX] = 0.08;
        break;
      case FALL: {
        const f = Math.sin(t * 9) * 0.12;
        o[LAX] = -2.4 + f;
        o[RAX] = -2.4 - f;
        o[LAZ] = o[RAZ] = 0.5;
        o[LLX] = -0.35;
        o[RLX] = 0.25;
        break;
      }
      case SIT:
        o[LLX] = o[RLX] = -1.5;
        o[LLZ] = o[RLZ] = 0.04;
        o[LAX] = o[RAX] = -1.2;
        o[LAZ] = o[RAZ] = -0.07;
        o[HX] = 0.1 + Math.sin(t * 0.7) * 0.03;
        o[HY] = Math.sin(t * 0.31) * 0.18;
        o[BY] = SIT_LIFT;
        break;
    }
  }

  applyModifiers(dt, t, o) {
    this.wType = damp(this.wType, this.typing && this.seated ? 1 : 0, 8, dt);
    this.wDizzy = damp(this.wDizzy, this.out ? 1 : 0, 4, dt);
    this.cheerT = Math.max(0, this.cheerT - dt);
    this.wCheer = damp(this.wCheer, this.cheerT > 0 ? 1 : 0, 10, dt);

    if (this.wType > 0.002) {
      // Typing on the table: alternating quick arm bobs, looking down at the "keyboard".
      const k = this.wType;
      const b = Math.sin(t * 17);
      o[LAX] += k * (-0.3 + b * 0.17);
      o[RAX] += k * (-0.3 - b * 0.17);
      o[HX] += k * 0.16;
      o[HY] *= 1 - k;
    }
    if (this.wCheer > 0.002) {
      const k = this.wCheer;
      o[LAX] = lerp(o[LAX], -2.75 + Math.sin(t * 12) * 0.3, k);
      o[RAX] = lerp(o[RAX], -2.75 + Math.sin(t * 12 + 1.6) * 0.3, k);
      o[LAZ] = lerp(o[LAZ], 0.5, k);
      o[RAZ] = lerp(o[RAZ], 0.5, k);
      o[HX] -= 0.15 * k;
      o[BY] += k * Math.abs(Math.sin(t * 7)) * (this.seated ? 0.25 : 0.9);
    }
    if (this.wDizzy > 0.002) {
      const k = this.wDizzy;
      o[HZ] += k * Math.sin(t * 3.1) * 0.3;
      o[HX] += k * (0.18 + Math.cos(t * 3.1) * 0.12);
      o[BZ] += k * Math.sin(t * 1.55) * 0.07;
      o[LAX] = lerp(o[LAX], -0.35, k * 0.6);
      o[RAX] = lerp(o[RAX], -0.35, k * 0.6);
    }
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      o[HY] += Math.sin(t * 30) * 0.45 * (this.shakeT / 0.6);
    }
    if (this.flinchT > 0) {
      this.flinchT = Math.max(0, this.flinchT - dt);
      const p = Math.sin((this.flinchT / 0.55) * Math.PI);
      o[BX] -= 0.22 * p;
      o[HX] -= 0.3 * p;
      o[LAZ] += 0.55 * p;
      o[RAZ] += 0.55 * p;
    }
    if (this.nodT > 0) {
      this.nodT = Math.max(0, this.nodT - dt);
      o[HX] += Math.sin((1 - this.nodT / 0.5) * TAU) * 0.25;
    }
  }

  applyPose(dt, t, o) {
    let fy = 0;
    let fz = 0;
    let spinX = 0;
    let spinY = 0;
    if (this.flightT >= 0) {
      this.flightT += dt;
      const u = Math.min(this.flightT / FLIGHT_TIME, 1);
      fy = FLIGHT_HEIGHT * 4 * u * (1 - u);
      // Arcs out over the table and back: never toward the seat's table camera, which sits behind it.
      fz = Math.sin(Math.PI * u) * 4.5;
      spinY = easeInOutCubic(u) * TAU * 2;
      spinX = u * TAU;
      o[LAX] = -2.6 + Math.sin(t * 22) * 0.6;
      o[RAX] = -2.6 + Math.sin(t * 22 + 2) * 0.6;
      o[LAZ] = o[RAZ] = 0.7;
      o[LLX] = Math.sin(t * 18) * 0.7;
      o[RLX] = -Math.sin(t * 18) * 0.7;
      if (u >= 1) {
        this.flightT = -1;
        this.landT = 0.35;
      }
    }
    let squash = 1;
    if (this.landT > 0) {
      this.landT = Math.max(0, this.landT - dt);
      squash = 1 - Math.sin((this.landT / 0.35) * Math.PI) * 0.2;
    }

    this.lArm.rotation.set(o[LAX], 0, -o[LAZ]);
    this.rArm.rotation.set(o[RAX], 0, o[RAZ]);
    this.lLeg.rotation.set(o[LLX], 0, -o[LLZ]);
    this.rLeg.rotation.set(o[RLX], 0, o[RLZ]);
    this.head.rotation.set(o[HX], o[HY], o[HZ]);
    this.spin.rotation.set(o[BX] + spinX, spinY, o[BZ]);
    this.body.position.set(0, o[BY] + fy, fz);
    this.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

    this.updateStars(t);
  }

  /** Little stars circling the head while knocked out. */
  updateStars(t) {
    const visible = this.wDizzy > 0.05;
    if (!visible && !this.stars) return;
    if (!this.stars) {
      starMaterial ??= new THREE.MeshBasicMaterial({ color: '#ffd43b', side: THREE.DoubleSide });
      this.stars = new THREE.Group();
      this.stars.position.y = HEAD_SIZE + 0.35;
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(geometries().star, starMaterial);
        const a = (i / 3) * TAU;
        s.position.set(Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85);
        this.stars.add(s);
      }
      this.head.add(this.stars);
    }
    this.stars.visible = visible;
    if (visible) {
      this.stars.rotation.y = t * 3.5;
      this.stars.scale.setScalar(this.wDizzy);
      const stars = this.stars.children;
      for (let i = 0; i < stars.length; i++) {
        stars[i].position.y = Math.sin(t * 5 + i * 2) * 0.1;
        stars[i].rotation.y = -t * 3.5;
      }
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}
