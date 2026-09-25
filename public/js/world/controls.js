// Player input (keyboard, mouse orbit / wheel zoom, touch joystick + orbit + jump button)
// and the local character motor (camera-relative walking, gravity/jump, circle colliders,
// island boundary).

import * as THREE from 'three';
import { clampWalkable, groundHeight } from './layout.js';
import { WALK_SPEED } from './avatar.js';
import { damp, dampAngle } from './math.js';
import { ensureWorldStyles } from './styles.js';

const JUMP_SPEED = 42;
const GRAVITY = 160;
const RADIUS = 1; // avatar collision radius
const JOY_RADIUS = 52;

const MOVE_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

function isTextField(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export const isTouchDevice = () =>
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;

export class Input {
  constructor(canvas, overlayParent) {
    ensureWorldStyles();
    this.canvas = canvas;
    this.enabled = true; // setInputEnabled (keyboard / joystick / jump)
    this.active = false; // false in menu mode or without a local player: nothing at all
    this.pressed = new Set();
    this.jumpPressed = false; // edge (consumed)
    this.jumpHeld = false;
    this.interactPressed = false;
    this.orbitX = 0;
    this.orbitY = 0;
    this.zoomDelta = 0;
    this.joy = null; // { id, x0, y0, x, y }
    this.drag = null; // mouse orbit
    this.touches = new Map(); // orbit / pinch touches: id -> {x, y}
    this.pinch = 0;
    this.firstPerson = false;

    this.touchUI = document.createElement('div');
    this.touchUI.className = 'w-touch';
    this.joyEl = document.createElement('div');
    this.joyEl.className = 'w-joy';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'w-joy-knob';
    this.joyEl.append(this.knobEl);
    this.jumpEl = document.createElement('div');
    this.jumpEl.className = 'w-jump';
    this.jumpEl.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 14l7-7 7 7"/><path d="M5 20l7-7 7 7" opacity=".55"/></svg>';
    this.touchUI.append(this.joyEl, this.jumpEl);
    overlayParent.append(this.touchUI);

    this.listen(window, 'keydown', (e) => this.onKeyDown(e));
    this.listen(window, 'keyup', (e) => this.onKeyUp(e));
    this.listen(window, 'blur', () => this.releaseAll());
    this.listen(canvas, 'pointerdown', (e) => this.onPointerDown(e));
    this.listen(window, 'pointermove', (e) => this.onPointerMove(e));
    this.listen(window, 'pointerup', (e) => this.onPointerUp(e));
    this.listen(window, 'pointercancel', (e) => this.onPointerUp(e));
    this.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    this.listen(canvas, 'wheel', (e) => this.onWheel(e), { passive: false });
    this.listen(this.jumpEl, 'pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.active || !this.enabled) return;
      this.jumpPressed = true;
      this.jumpHeld = true;
      this.jumpEl.classList.add('w-pressed');
    });
    const jumpUp = () => {
      this.jumpHeld = false;
      this.jumpEl.classList.remove('w-pressed');
    };
    this.listen(this.jumpEl, 'pointerup', jumpUp);
    this.listen(this.jumpEl, 'pointercancel', jumpUp);
    this.listen(this.jumpEl, 'pointerleave', jumpUp);
  }

  listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.releaseAll();
  }

  /** Menu mode / no local player: ignore all input and hide touch controls. */
  setActive(on, showTouch) {
    this.active = on;
    if (!on) this.releaseAll();
    if (!on && document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    this.touchUI.classList.toggle('w-on', on && showTouch);
  }

  releaseAll() {
    this.pressed.clear();
    this.jumpHeld = false;
    this.jumpPressed = false;
    this.interactPressed = false;
    this.endJoystick();
  }

  onKeyDown(e) {
    if (!this.active || !this.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTextField(e.target) || isTextField(document.activeElement)) return;
    if (MOVE_KEYS[e.code]) {
      this.pressed.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    } else if (e.code === 'Space') {
      if (!e.repeat) this.jumpPressed = true;
      this.jumpHeld = true;
      e.preventDefault();
    } else if (e.code === 'KeyE' && !e.repeat) {
      this.interactPressed = true;
    }
  }

  onKeyUp(e) {
    this.pressed.delete(e.code);
    if (e.code === 'Space') this.jumpHeld = false;
  }

  onPointerDown(e) {
    if (!this.active) return;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0 && e.button !== 2) return;
      if (this.firstPerson && e.button === 0 && document.pointerLockElement !== this.canvas) {
        try { this.canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* Drag remains available. */ }
      }
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else {
      const rect = this.canvas.getBoundingClientRect();
      if (!this.joy && this.enabled && e.clientX - rect.left < rect.width * 0.45) {
        this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
        this.joyEl.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
        this.knobEl.style.transform = '';
        this.joyEl.classList.add('w-on');
      } else {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.pinch = this.pinchDistance();
      }
    }
    this.canvas.setPointerCapture?.(e.pointerId);
    // Touches must not turn into emulated mouse events; mouse clicks may still blur a focused chat input.
    if (e.pointerType !== 'mouse') e.preventDefault();
  }

  onPointerMove(e) {
    if (this.active && this.firstPerson && document.pointerLockElement === this.canvas) {
      this.orbitX += e.movementX;
      this.orbitY += e.movementY;
      return;
    }
    if (this.drag && e.pointerId === this.drag.id) {
      this.orbitX += e.clientX - this.drag.x;
      this.orbitY += e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    } else if (this.joy && e.pointerId === this.joy.id) {
      let dx = e.clientX - this.joy.x0;
      let dy = e.clientY - this.joy.y0;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx *= JOY_RADIUS / len;
        dy *= JOY_RADIUS / len;
      }
      this.joy.x = this.joy.x0 + dx;
      this.joy.y = this.joy.y0 + dy;
      this.knobEl.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (this.touches.has(e.pointerId)) {
      const t = this.touches.get(e.pointerId);
      if (this.touches.size === 1) {
        this.orbitX += (e.clientX - t.x) * 1.3;
        this.orbitY += (e.clientY - t.y) * 1.3;
      }
      t.x = e.clientX;
      t.y = e.clientY;
      if (this.touches.size === 2) {
        const d = this.pinchDistance();
        this.zoomDelta += (this.pinch - d) * 4;
        this.pinch = d;
      }
    }
  }

  onPointerUp(e) {
    if (this.drag && e.pointerId === this.drag.id) this.drag = null;
    if (this.joy && e.pointerId === this.joy.id) this.endJoystick();
    if (this.touches.delete(e.pointerId)) this.pinch = this.pinchDistance();
  }

  pinchDistance() {
    if (this.touches.size < 2) return 0;
    const [a, b] = this.touches.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  endJoystick() {
    this.joy = null;
    this.joyEl.classList.remove('w-on');
  }

  onWheel(e) {
    e.preventDefault();
    if (!this.active) return;
    this.zoomDelta += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
  }

  /** Writes the movement intent into `out` (x = right, y = forward), length ≤ 1. */
  readMove(out) {
    out.set(0, 0);
    if (!this.active || !this.enabled) return out;
    for (const code of this.pressed) {
      const d = MOVE_KEYS[code];
      out.x += d[0];
      out.y += d[1];
    }
    if (this.joy) {
      out.x += (this.joy.x - this.joy.x0) / JOY_RADIUS;
      out.y -= (this.joy.y - this.joy.y0) / JOY_RADIUS;
    }
    const len = out.length();
    if (len > 1) out.divideScalar(len);
    return out;
  }

  consumeJumpPress() {
    const v = this.jumpPressed;
    this.jumpPressed = false;
    return v;
  }

  consumeInteract() {
    const v = this.interactPressed;
    this.interactPressed = false;
    return v;
  }
}

/** Local avatar physics: Roblox-like walk speed, snappy jump, circle collisions. */
export class CharacterMotor {
  constructor(colliders) {
    this.colliders = colliders;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.speed = 0;
    this.anim = 'idle';
    this.platforms = null;
    this.standingOn = null;
    this.contact = null;
  }

  teleport(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.speed = 0;
    this.anim = 'idle';
    this.standingOn = null;
    this.contact = null;
  }

  /** move: Vector2 (x = right, y = forward) relative to the camera yaw. */
  step(dt, move, camYaw, jump) {
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    const dx = cos * move.x - sin * move.y;
    const dz = -sin * move.x - cos * move.y;
    const accel = this.grounded ? 22 : 8;
    this.vel.x = damp(this.vel.x, dx * WALK_SPEED, accel, dt);
    this.vel.z = damp(this.vel.z, dz * WALK_SPEED, accel, dt);
    if (Math.abs(dx) + Math.abs(dz) > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 14, dt);

    if (jump && this.grounded) {
      this.vel.y = JUMP_SPEED;
      this.grounded = false;
    }
    this.vel.y -= GRAVITY * dt;

    const p = this.pos;
    const oldY = p.y;
    if (this.platforms && this.grounded && this.standingOn) {
      p.x += this.standingOn.dx; p.z += this.standingOn.dz;
    }
    p.x += this.vel.x * dt;
    p.z += this.vel.z * dt;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        const ox = p.x - c.x;
        const oz = p.z - c.z;
        const min = c.r + RADIUS;
        const d2 = ox * ox + oz * oz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 1e-4;
          p.x += (ox / d) * (min - d);
          p.z += (oz / d) * (min - d);
        }
      }
    }
    if (!this.platforms) clampWalkable(p);

    p.y += this.vel.y * dt;
    let ground = this.platforms ? -Infinity : groundHeight(p.x, p.z);
    this.contact = null;
    this.standingOn = null;
    if (this.platforms) {
      for (const box of this.platforms) {
        const ox = p.x - box.x, oz = p.z - box.z;
        const cos = Math.cos(box.angle || 0), sin = Math.sin(box.angle || 0);
        const lx = ox * cos - oz * sin, lz = ox * sin + oz * cos;
        const top = box.y + box.h / 2, bottom = box.y - box.h / 2;
        const inside = Math.abs(lx) < box.w / 2 + RADIUS * .65 && Math.abs(lz) < box.d / 2 + RADIUS * .65;
        if (!inside) continue;
        if (box.kind === 'kill') {
          if (p.y < top && p.y + 4.8 > bottom) this.contact = box;
          continue;
        }
        if (top <= oldY + .6 && top > ground && this.vel.y <= 0) { ground = top; this.standingOn = box; }
        else if (p.y < top - .1 && p.y + 4.5 > bottom && oldY < top - .6) {
          const pushX = box.w / 2 + RADIUS - Math.abs(lx);
          const pushZ = box.d / 2 + RADIUS - Math.abs(lz);
          if (pushX < pushZ) { p.x += Math.sign(lx || 1) * pushX * cos; p.z -= Math.sign(lx || 1) * pushX * sin; }
          else { p.x += Math.sign(lz || 1) * pushZ * sin; p.z += Math.sign(lz || 1) * pushZ * cos; }
        }
      }
    }
    if (p.y <= ground || (this.grounded && this.vel.y <= 0 && p.y - ground < 0.6)) {
      // Land, or stick to the ground when walking down slopes / off small steps.
      p.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.anim = this.grounded ? (this.speed > 1 ? 'walk' : 'idle') : this.vel.y > 0 ? 'jump' : 'fall';
  }
}
