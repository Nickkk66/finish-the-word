// One player in the world: avatar, head labels, pet, seat hops and (for remote players)
// snapshot interpolation of network moves.

import * as THREE from 'three';
import { LAYOUT } from '../shared/constants.js';
import { PETS_BY_ID } from '../shared/catalog.js';
import { Avatar } from './avatar.js';
import { PetFollower } from './pet.js';
import { HeadStack } from './labels.js';
import { TurnRing } from './effects.js';
import { buildBackBling, disposeObject } from './cosmetics.js';
import { DECK, groundHeight, seatAngle, seatX, seatYaw, seatZ } from './layout.js';
import { clamp, damp, lerp, lerpAngle, wrapAngle } from './math.js';

const INTERP_DELAY = 90; // smooth remote motion just behind the newest snapshot
const EXTRAP_MS = 150; // briefly keep walking through missing network samples
const SNAP_DIST = 14; // teleport instead of interpolating
const SNAPSHOTS = 8;
const HOP_TIME = 0.4;
const SIT_RADIUS = LAYOUT.seatRadius - 0.15; // a touch forward on the seat
const STAND_RADIUS = LAYOUT.seatRadius + 3;

export class PlayerEntity {
  /** ctx: { scene, labels } */
  constructor(ctx, player) {
    this.ctx = ctx;
    this.id = player.id;
    this.data = player;
    this.isLocal = false;
    this.avatar = new Avatar(player.look);
    ctx.scene.add(this.avatar.root);
    this.stack = new HeadStack(ctx.labels);
    this.stack.setName(player.name);
    this.stack.setConnected(player.connected !== false);
    this.stack.setBadges(player.level, player.isAdmin);
    this.back = null;
    this.setBack(player.back, player.capeColor);
    this.aura = null;
    this.pet = null;
    this.setPet(player.pet, player.petTier);

    this.seat = -1;
    this.pos = new THREE.Vector3(); // logical feet position
    this.yaw = 0;
    this.anim = 'idle';
    this.speed = 0;
    this.render = new THREE.Vector3(); // displayed position (logical + hop blend)
    this.renderYaw = 0;
    this.hop = { t: 1, from: new THREE.Vector3(), fromYaw: 0, height: 1.2 };
    this.snaps = Array.from({ length: SNAPSHOTS }, () => ({ t: 0, x: 0, y: 0, z: 0, ry: 0, anim: 'idle' }));
    this.snapCount = 0;
    this.prev = new THREE.Vector3();
    this.moveTarget = new THREE.Vector3();
    this.status = { turn: false, out: false, hearts: null };
    this.turnRing = null;

    if (player.pos) this.place(player.pos.x, player.pos.y, player.pos.z, player.pos.ry ?? Math.PI);
    else {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 3; // a ring around the pad center, so new players rarely overlap
      this.place(LAYOUT.spawn.x + Math.cos(a) * r, 0, LAYOUT.spawn.z + Math.sin(a) * r, Math.PI);
    }
    if (player.seat >= 0) this.sit(player.seat, true);
  }

  /** Applies look / name / connection / pet from a full Player object (seat is handled by the world). */
  update(player) {
    const old = this.data;
    this.data = player;
    if (JSON.stringify(old.look) !== JSON.stringify(player.look)) this.avatar.setLook(player.look);
    if (old.name !== player.name) this.stack.setName(player.name);
    this.stack.setConnected(player.connected !== false);
    if (old.pet !== player.pet || old.petTier !== player.petTier) this.setPet(player.pet, player.petTier);
    if (old.back !== player.back || old.capeColor !== player.capeColor) this.setBack(player.back, player.capeColor);
    this.stack.setBadges(player.level, player.isAdmin, this.status.combo);
  }

  setLocal(on) {
    this.isLocal = on;
    this.stack.setLocal(on);
  }

  setBack(id, capeColor) {
    if (this.back) { this.back.removeFromParent(); disposeObject(this.back); this.back = null; }
    if (id && id !== 'none') {
      this.back = buildBackBling(id, capeColor);
      this.back.position.set(0, 3, 0);
      this.avatar.rig.add(this.back);
    }
  }

  setPet(petId, tier = 1) {
    if (this.pet?.petId === petId && this.pet?.tier === tier) return;
    const at = this.pet?.object.position.clone();
    this.pet?.dispose();
    this.pet = null;
    if (petId && PETS_BY_ID[petId]) {
      this.pet = new PetFollower(petId, tier);
      if (at) {
        this.pet.object.position.copy(at);
        this.pet.placed = true;
      }
      this.ctx.scene.add(this.pet.object);
    }
  }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.render.set(x, y, z);
    this.renderYaw = yaw;
    this.prev.copy(this.pos);
    this.hop.t = 1;
    this.snapCount = 0;
  }

  startHop(height) {
    this.hop.t = 0;
    this.hop.from.copy(this.render);
    this.hop.fromYaw = this.renderYaw;
    this.hop.height = height;
  }

  sit(seat, instant = false) {
    this.seat = seat;
    if (!instant) this.startHop(1.4);
    this.pos.set(seatX(seat, SIT_RADIUS), DECK.top, seatZ(seat, SIT_RADIUS));
    this.yaw = seatYaw(seat);
    if (instant) this.place(this.pos.x, this.pos.y, this.pos.z, this.yaw);
    this.avatar.setSeated(true);
    this.snapCount = 0;
  }

  /** Hops out behind the chair, facing away from the table. */
  stand() {
    const seat = this.seat;
    this.seat = -1;
    this.avatar.setSeated(false);
    this.avatar.setTyping(false);
    if (seat < 0) return;
    this.startHop(1.2);
    const x = seatX(seat, STAND_RADIUS);
    const z = seatZ(seat, STAND_RADIUS);
    this.pos.set(x, groundHeight(x, z), z);
    this.yaw = seatAngle(seat);
    this.prev.copy(this.pos);
    this.snapCount = 0;
  }

  /** Remote move from the network (ignored while seated: the seat owns the transform). */
  pushMove(m, now) {
    if (this.seat >= 0 || !Number.isFinite(m.x) || !Number.isFinite(m.z)) return;
    const y = Number.isFinite(m.y) ? m.y : 0;
    const ry = Number.isFinite(m.ry) ? m.ry : this.yaw;
    const last = this.snapCount ? this.snaps[this.snapCount - 1] : null;
    const ref = last ?? this.pos;
    if (Math.hypot(m.x - ref.x, m.z - ref.z, y - ref.y) > SNAP_DIST) {
      this.place(m.x, y, m.z, ry);
    }
    if (this.snapCount === SNAPSHOTS) {
      this.snaps.push(this.snaps.shift());
      this.snapCount--;
    }
    const s = this.snaps[this.snapCount++];
    s.t = now;
    s.x = m.x;
    s.y = y;
    s.z = m.z;
    s.ry = ry;
    s.anim = typeof m.anim === 'string' ? m.anim : 'idle';
  }

  /** Local player: the motor owns the logical transform. */
  setMotorState(motor) {
    this.pos.copy(motor.pos);
    this.yaw = motor.yaw;
    this.anim = motor.anim;
    this.speed = motor.speed;
  }

  interpolate(dt, now) {
    const n = this.snapCount;
    if (!n) return;
    const s = this.snaps;
    const rt = now - INTERP_DELAY;
    let a = s[0];
    let b = s[0];
    let k = 0;
    if (rt >= s[n - 1].t) {
      a = b = s[n - 1];
    } else if (rt > s[0].t) {
      let i = 0;
      while (i < n - 2 && s[i + 1].t <= rt) i++;
      a = s[i];
      b = s[i + 1];
      k = clamp((rt - a.t) / Math.max(1, b.t - a.t), 0, 1);
    }
    const target = this.moveTarget.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
    let targetYaw = lerpAngle(a.ry, b.ry, k);
    if (rt > s[n - 1].t && n > 1 && s[n - 1].anim === 'walk') {
      const last = s[n - 1], before = s[n - 2];
      const elapsed = Math.max(1, last.t - before.t);
      const lead = Math.min(EXTRAP_MS, rt - last.t) / elapsed;
      target.x += (last.x - before.x) * lead;
      target.y += (last.y - before.y) * lead;
      target.z += (last.z - before.z) * lead;
      targetYaw = lerpAngle(before.ry, last.ry, 1 + lead);
    }
    const smooth = 1 - Math.exp(-18 * dt);
    this.pos.lerp(target, smooth);
    this.yaw = lerpAngle(this.yaw, targetYaw, smooth);
    const moved = Math.hypot(this.pos.x - this.prev.x, this.pos.z - this.prev.z) / Math.max(dt, 1e-3);
    this.prev.copy(this.pos);
    this.speed = damp(this.speed, moved, 10, dt);
    const anim = k < 0.5 ? a.anim : b.anim;
    // Walk / idle come from the actual motion so a stale "walk" never moonwalks in place.
    this.anim = anim === 'jump' || anim === 'fall' ? anim : this.speed > 1.2 ? 'walk' : 'idle';
  }

  setStatus(status) {
    const st = this.status;
    if (typeof status.turn === 'boolean') st.turn = status.turn;
    if (typeof status.out === 'boolean') st.out = status.out;
    if ('hearts' in status) st.hearts = status.hearts;
    if ('combo' in status) st.combo = status.combo;
    this.stack.setBadges(this.data.level, this.data.isAdmin, st.combo);
    if (st.combo >= 3 && !this.aura) {
      const positions = new Float32Array(24 * 3);
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; positions[i * 3] = Math.sin(a) * 1.7; positions[i * 3 + 1] = (i % 6) * .5; positions[i * 3 + 2] = Math.cos(a) * 1.7; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.aura = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ff9f20', size: .5, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.ctx.scene.add(this.aura);
    }
    if (this.aura) this.aura.visible = st.combo >= 3;
    this.avatar.setOut(st.out);
    this.avatar.rouletteSleeping = !!status.roulette && st.out;
    this.avatar.setTyping(st.turn && !status.roulette);
    this.stack.setOut(st.out);
    this.stack.setHearts(st.out ? null : st.hearts);
    this.stack.setTurn(st.turn);
    if (st.turn && !this.turnRing) {
      this.turnRing = new TurnRing();
      this.ctx.scene.add(this.turnRing.object);
    } else if (!st.turn && this.turnRing) {
      this.turnRing.dispose();
      this.turnRing = null;
    }
  }

  /** Per frame: blend hops, animate, and position pet / labels / turn ring. */
  tick(dt, t, now) {
    if (!this.isLocal && this.seat < 0) this.interpolate(dt, now);
    const r = this.render;
    if (this.hop.t < 1) {
      this.hop.t = Math.min(1, this.hop.t + dt / HOP_TIME);
      const e = this.hop.t * (2 - this.hop.t);
      r.lerpVectors(this.hop.from, this.pos, e);
      r.y += Math.sin(this.hop.t * Math.PI) * this.hop.height;
      this.renderYaw = lerpAngle(this.hop.fromYaw, this.yaw, e);
    } else {
      r.copy(this.pos);
      this.renderYaw = this.yaw;
    }
    const root = this.avatar.root;
    root.position.copy(r);
    root.rotation.y = this.renderYaw;
    this.avatar.setLocomotion(this.seat >= 0 ? 'idle' : this.anim, this.speed);
    this.avatar.update(dt, t);
    this.back?.userData.update?.(t, dt, this.seat >= 0, this.speed);
    if (this.back && !this.back.userData.update) this.back.scale.setScalar(this.seat >= 0 ? .7 : 1);
    if (this.aura?.visible) { this.aura.position.copy(r); this.aura.rotation.y = t * 1.5; this.aura.position.y += Math.sin(t * 4) * .2; }

    this.stack.anchor.set(r.x, r.y + this.avatar.headTop() + 0.55, r.z);
    if (this.pet) this.updatePet(dt, t);
    if (this.turnRing) {
      this.turnRing.object.position.set(r.x, this.seat >= 0 ? DECK.top : r.y, r.z);
      this.turnRing.update(t);
    }
  }

  updatePet(dt, t) {
    let x;
    let y;
    let z;
    let yaw;
    if (this.seat >= 0) {
      // Hovers in the gap beside its owner's chair, facing the table.
      const a = seatAngle(this.seat) + Math.PI / 8;
      x = Math.sin(a) * (LAYOUT.seatRadius + 1.6);
      z = Math.cos(a) * (LAYOUT.seatRadius + 1.6);
      y = DECK.top + 3.1;
      yaw = a + Math.PI;
    } else {
      const s = Math.sin(this.renderYaw);
      const c = Math.cos(this.renderYaw);
      // Right-behind the owner, at shoulder height.
      x = this.render.x + c * 2.3 + s * -1.4;
      z = this.render.z - s * 2.3 + c * -1.4;
      y = Math.max(groundHeight(x, z), this.render.y) + 2.1;
      const moving = this.speed > 1.5;
      yaw = moving ? this.renderYaw : this.renderYaw + wrapAngle(Math.atan2(this.render.x - x, this.render.z - z) - this.renderYaw) * 0.5;
    }
    this.pet.update(dt, t, x, y, z, yaw);
  }

  /** World position just above the head / at the feet (for effects). */
  headPosition(out) {
    return out.set(this.render.x, this.render.y + this.avatar.headTop() + 0.4, this.render.z);
  }

  dispose() {
    if (this.back) disposeObject(this.back);
    if (this.aura) { this.aura.removeFromParent(); this.aura.geometry.dispose(); this.aura.material.dispose(); }
    this.avatar.dispose();
    this.stack.destroy();
    this.pet?.dispose();
    this.turnRing?.dispose();
  }
}
