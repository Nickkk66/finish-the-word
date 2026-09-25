// Particle effects (pooled, allocation-free per frame) and the glowing turn indicator.
//   sparks   – additive billboarded stars (instanced), fade to black
//   confetti – tumbling colored quads (instanced)
//   icons    – a few sprites: red ✕, heart / broken-heart halves
//   rings    – expanding flat shock rings

import * as THREE from 'three';
import { beamTexture, heartTexture, ringGlowTexture, sparkleTexture, xMarkTexture } from './textures.js';
import { TAU, easeOutBack } from './math.js';

const MAX_SPARKS = 400;
const MAX_CONFETTI = 360;
const ICONS = 12;
const RINGS = 4;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const Z = new THREE.Vector3(0, 0, 1);

const PALETTES = {
  correct: ['#3ddc54', '#a6ff9e', '#ffffff', '#6cf07d'],
  wrong: ['#ff3b4a', '#ff8a8a'],
  gold: ['#ffd43b', '#fff3b0', '#ffffff', '#ffb300'],
  hatch: ['#ffd43b', '#ffffff', '#c77dff', '#7ce8ff'],
  confetti: ['#ff3b4a', '#2f7dff', '#ffd43b', '#3ddc54', '#ff6fd8', '#b45cff', '#ff9f1c', '#35d0ff'],
};

function pick(list) {
  return list[(Math.random() * list.length) | 0];
}

function particle() {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, r: 1, g: 1, b: 1, rot: 0, spin: 0, grav: 0, drag: 0, rx: 0, ry: 0, rz: 0, phase: 0 };
}

export class Effects {
  constructor(scene) {
    this.sparks = Array.from({ length: MAX_SPARKS }, particle);
    this.confetti = Array.from({ length: MAX_CONFETTI }, particle);
    this.nSparks = 0;
    this.nConfetti = 0;

    this.sparkMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: sparkleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      MAX_SPARKS,
    );
    this.confettiMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.36, 0.22),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      MAX_CONFETTI,
    );
    for (const mesh of [this.sparkMesh, this.confettiMesh]) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }

    this.icons = Array.from({ length: ICONS }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
      sprite.visible = false;
      sprite.renderOrder = 5;
      scene.add(sprite);
      return { sprite, active: false, age: 0, delay: 0, life: 1, size: 1, vx: 0, vy: 0, grav: 0, spin: 0 };
    });

    const ringMat = new THREE.MeshBasicMaterial({ map: ringGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.rings = Array.from({ length: RINGS }, () => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), ringMat.clone());
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, active: false, age: 0, life: 0.8, size: 8 };
    });
  }

  /** kind: correct | wrong | heart | eliminated | win | hatch. head/feet: world positions. */
  burst(kind, head, feet) {
    switch (kind) {
      case 'correct':
        this.sparkBurst(head, 28, PALETTES.correct, 3, 7, 0.55, 1.0, 0.45, 0.95);
        break;
      case 'wrong':
        this.icon(xMarkTexture(), head.x, head.y + 1, head.z, { life: 0.95, size: 2 });
        this.sparkBurst(head, 10, PALETTES.wrong, 2, 5, 0.4, 0.7, 0.4, 0.7);
        break;
      case 'heart':
        this.icon(heartTexture('full'), head.x, head.y + 1.1, head.z, { life: 0.5, size: 1.9 });
        this.icon(heartTexture('left'), head.x, head.y + 1.1, head.z, { delay: 0.45, life: 1, size: 1.9, vx: -1.8, vy: 1.6, grav: 7, spin: 2.2 });
        this.icon(heartTexture('right'), head.x, head.y + 1.1, head.z, { delay: 0.45, life: 1, size: 1.9, vx: 1.8, vy: 1.6, grav: 7, spin: -2.2 });
        break;
      case 'eliminated':
        this.sparkBurst(feet, 34, PALETTES.gold, 4, 10, 0.6, 1.1, 0.5, 1.1, 1.5);
        this.ring(feet, 9, 0.7, '#ffd43b');
        break;
      case 'win':
        this.confettiBurst(head, 150);
        this.sparkBurst(head, 30, PALETTES.gold, 3, 8, 0.8, 1.4, 0.5, 1.1);
        break;
      case 'hatch':
        this.sparkRing(feet, 40, PALETTES.hatch);
        this.ring(feet, 10, 0.8, '#c77dff');
        break;
    }
  }

  sparkBurst(at, n, palette, vMin, vMax, lifeMin, lifeMax, sMin, sMax, yOff = 0) {
    for (let i = 0; i < n && this.nSparks < MAX_SPARKS; i++) {
      const p = this.sparks[this.nSparks++];
      const a = Math.random() * TAU;
      const up = 0.25 + Math.random() * 0.75;
      const v = vMin + Math.random() * (vMax - vMin);
      const h = Math.sqrt(1 - up * up);
      this.initSpark(p, at.x, at.y + yOff, at.z, Math.cos(a) * h * v, up * v, Math.sin(a) * h * v, palette, lifeMin, lifeMax, sMin, sMax);
    }
  }

  sparkRing(at, n, palette) {
    for (let i = 0; i < n && this.nSparks < MAX_SPARKS; i++) {
      const p = this.sparks[this.nSparks++];
      const a = (i / n) * TAU;
      const v = 6 + Math.random() * 2.5;
      this.initSpark(p, at.x + Math.cos(a) * 0.8, at.y + 1.6, at.z + Math.sin(a) * 0.8, Math.cos(a) * v, 1 + Math.random() * 2, Math.sin(a) * v, palette, 0.7, 1.1, 0.5, 1.0);
      p.grav = 2;
    }
  }

  initSpark(p, x, y, z, vx, vy, vz, palette, lifeMin, lifeMax, sMin, sMax) {
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.age = 0;
    p.life = lifeMin + Math.random() * (lifeMax - lifeMin);
    p.size = sMin + Math.random() * (sMax - sMin);
    p.rot = Math.random() * TAU;
    p.spin = (Math.random() - 0.5) * 6;
    p.grav = 6;
    p.drag = 1.8;
    _c.set(pick(palette));
    p.r = _c.r;
    p.g = _c.g;
    p.b = _c.b;
  }

  confettiBurst(at, n) {
    for (let i = 0; i < n && this.nConfetti < MAX_CONFETTI; i++) {
      const p = this.confetti[this.nConfetti++];
      const a = Math.random() * TAU;
      const h = Math.random() * 5.5;
      p.x = at.x;
      p.y = at.y + 0.8;
      p.z = at.z;
      p.vx = Math.cos(a) * h;
      p.vz = Math.sin(a) * h;
      p.vy = 7 + Math.random() * 7;
      p.age = 0;
      p.life = 2.6 + Math.random() * 1.4;
      p.rx = Math.random() * TAU;
      p.ry = Math.random() * TAU;
      p.rz = Math.random() * TAU;
      p.spin = 4 + Math.random() * 8;
      p.phase = Math.random() * TAU;
      _c.set(pick(PALETTES.confetti));
      p.r = _c.r;
      p.g = _c.g;
      p.b = _c.b;
    }
  }

  icon(texture, x, y, z, { delay = 0, life = 1, size = 1.5, vx = 0, vy = 0, grav = 0, spin = 0 }) {
    const it = this.icons.find((i) => !i.active);
    if (!it) return;
    Object.assign(it, { active: true, age: -delay, life, size, vx, vy, grav, spin });
    it.sprite.material.map = texture;
    it.sprite.material.rotation = 0;
    it.sprite.material.opacity = 1;
    it.sprite.material.needsUpdate = true;
    it.sprite.position.set(x, y, z);
    it.sprite.visible = false;
  }

  ring(at, size, life, color) {
    const r = this.rings.find((i) => !i.active);
    if (!r) return;
    Object.assign(r, { active: true, age: 0, life, size });
    r.mesh.material.color.set(color);
    r.mesh.position.set(at.x, at.y + 0.12, at.z);
    r.mesh.visible = true;
  }

  update(dt, camera) {
    const camQ = camera.quaternion;

    // Sparks: billboards that drift, slow down and fade (additive: fade to black).
    let n = this.nSparks;
    for (let i = 0; i < n; ) {
      const p = this.sparks[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.sparks[i] = this.sparks[n - 1];
        this.sparks[n - 1] = p;
        n--;
        continue;
      }
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const k = p.age / p.life;
      const fade = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
      _qz.setFromAxisAngle(Z, p.rot);
      _q.copy(camQ).multiply(_qz);
      const s = p.size * (0.7 + 0.3 * fade);
      this.sparkMesh.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s)));
      this.sparkMesh.instanceColor.setXYZ(i, p.r * fade, p.g * fade, p.b * fade);
      i++;
    }
    this.nSparks = n;
    this.sparkMesh.count = n;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    this.sparkMesh.instanceColor.needsUpdate = true;

    // Confetti: pops up, then flutters down tumbling; shrinks away at the end.
    n = this.nConfetti;
    for (let i = 0; i < n; ) {
      const p = this.confetti[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.confetti[i] = this.confetti[n - 1];
        this.confetti[n - 1] = p;
        n--;
        continue;
      }
      const drag = Math.max(0, 1 - 1.6 * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = Math.max(p.vy - 11 * dt, -3.2);
      p.x += (p.vx + Math.sin(p.age * 5 + p.phase) * 0.6) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.spin * dt;
      p.rz += p.spin * 0.7 * dt;
      const k = p.age / p.life;
      const s = k > 0.8 ? (1 - k) / 0.2 : 1;
      _q.setFromEuler(_e.set(p.rx, p.ry, p.rz));
      this.confettiMesh.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s)));
      this.confettiMesh.instanceColor.setXYZ(i, p.r, p.g, p.b);
      i++;
    }
    this.nConfetti = n;
    this.confettiMesh.count = n;
    this.confettiMesh.instanceMatrix.needsUpdate = true;
    this.confettiMesh.instanceColor.needsUpdate = true;

    for (const it of this.icons) {
      if (!it.active) continue;
      it.age += dt;
      if (it.age < 0) continue;
      if (it.age >= it.life) {
        it.active = false;
        it.sprite.visible = false;
        continue;
      }
      const k = it.age / it.life;
      it.vy -= it.grav * dt;
      it.sprite.position.x += it.vx * dt;
      it.sprite.position.y += it.vy * dt;
      it.sprite.material.rotation += it.spin * dt;
      const s = it.size * (it.age < 0.25 ? Math.max(0.01, easeOutBack(it.age / 0.25)) : 1);
      it.sprite.scale.set(s, s, 1);
      it.sprite.material.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
      it.sprite.visible = true;
    }

    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const s = 0.5 + r.size * (1 - (1 - k) ** 3);
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = 1 - k;
    }
  }
}

// ---- Turn indicator ----

let ringMaterial = null;
let beamMaterial = null;
let ringGeo = null;
let beamGeo = null;

/** Pulsing golden ring on the floor with a soft light column, placed under a seat. */
export class TurnRing {
  constructor() {
    ringMaterial ??= new THREE.MeshBasicMaterial({ map: ringGlowTexture(), color: '#ffd43b', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    beamMaterial ??= new THREE.MeshBasicMaterial({ map: beamTexture(), color: '#ffe066', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    ringGeo ??= new THREE.PlaneGeometry(5.4, 5.4).rotateX(-Math.PI / 2);
    beamGeo ??= new THREE.CylinderGeometry(2.2, 2.2, 7, 32, 1, true).translate(0, 3.5, 0);
    this.object = new THREE.Group();
    this.ring = new THREE.Mesh(ringGeo, ringMaterial);
    this.ring.position.y = 0.06;
    this.beam = new THREE.Mesh(beamGeo, beamMaterial);
    this.object.add(this.ring, this.beam);
  }

  update(t) {
    const pulse = 1 + Math.sin(t * 6) * 0.07;
    this.ring.scale.set(pulse, 1, pulse);
    beamMaterial.opacity = 0.38 + Math.sin(t * 6) * 0.12;
  }

  dispose() {
    this.object.removeFromParent();
  }
}
