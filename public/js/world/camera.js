// Camera rig with three modes, blended smoothly when switching:
//   follow – Roblox-style third person orbit around the local avatar (drag / wheel)
//   table  – behind/above the local seat looking across the table (limited orbit)
//   menu   – slow cinematic orbit of the whole island (title screen background)

import * as THREE from 'three';
import { CENTER_X, CENTER_Z, DECK, groundHeight, seatAngle } from './layout.js';
import { clamp, damp, easeInOutCubic } from './math.js';

const BLEND_TIME = 0.9;

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'follow';
    this.yaw = 0;
    this.pitch = 0.36;
    this.distance = 18;
    this.tableYaw = 0;
    this.tablePitch = 0.7;
    this.tableZoom = 0;
    this.menuAngle = 0.6;
    this.target = new THREE.Vector3(0, 4.4, 26);
    this.look = new THREE.Vector3(0, 4, 0);
    this.blend = 1;
    this.fromPos = new THREE.Vector3();
    this.fromLook = new THREE.Vector3();
    this.wantPos = new THREE.Vector3();
    this.wantLook = new THREE.Vector3();
    this.snapTarget = true;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.fromPos.copy(this.camera.position);
    this.fromLook.copy(this.look);
    this.blend = 0;
    this.mode = mode;
    if (mode === 'table') {
      this.tableYaw = 0;
      this.tablePitch = 0.7;
      this.tableZoom = 0;
    }
  }

  /** Puts the follow camera behind an avatar facing `yaw` and snaps the target to it. */
  resetBehind(yaw) {
    this.yaw = yaw + Math.PI;
    this.snapTarget = true;
  }

  orbit(dx, dy) {
    if (this.mode === 'follow') {
      this.yaw -= dx * 0.0055;
      this.pitch = clamp(this.pitch + dy * 0.0045, -0.3, 1.25);
    } else if (this.mode === 'table') {
      this.tableYaw = clamp(this.tableYaw - dx * 0.004, -0.75, 0.75);
      this.tablePitch = clamp(this.tablePitch + dy * 0.004, 0.3, 1.1);
    }
  }

  zoom(delta) {
    if (!delta) return;
    if (this.mode === 'follow') this.distance = clamp(this.distance * (1 + delta * 0.0012), 6, 45);
    else if (this.mode === 'table') this.tableZoom = clamp(this.tableZoom + delta * 0.012, -6, 12);
  }

  /** Yaw used for camera-relative movement. */
  get moveYaw() {
    return this.yaw;
  }

  /** focus: avatar feet position (follow mode) · seat: seat index to view from (table mode). */
  update(dt, t, focus, seat) {
    const cam = this.camera;
    const P = this.wantPos;
    const L = this.wantLook;
    if (this.mode === 'menu') {
      this.menuAngle += dt * 0.045;
      const a = this.menuAngle;
      const r = 67 + Math.sin(t * 0.07) * 5;
      P.set(CENTER_X + Math.sin(a) * r, 30 + Math.sin(t * 0.11) * 4, CENTER_Z + Math.cos(a) * r);
      L.set(CENTER_X - Math.sin(a) * 6, 5, CENTER_Z - Math.cos(a) * 6);
    } else if (this.mode === 'table') {
      // Far enough that the whole table (±11 units wide incl. chairs) fits horizontally.
      const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect);
      const dist = Math.max(21, 11.5 / Math.tan(halfH)) + this.tableZoom;
      const a = seatAngle(seat) + this.tableYaw;
      const p = this.tablePitch;
      const cy = DECK.top + 3.7;
      P.set(CENTER_X + Math.sin(a) * Math.cos(p) * dist, cy + Math.sin(p) * dist, CENTER_Z + Math.cos(a) * Math.cos(p) * dist);
      L.set(CENTER_X - Math.sin(a) * 1.5, cy, CENTER_Z - Math.cos(a) * 1.5);
    } else {
      const tx = focus.x;
      const ty = focus.y + 4.4;
      const tz = focus.z;
      if (this.snapTarget) {
        this.target.set(tx, ty, tz);
        this.snapTarget = false;
      } else {
        this.target.x = damp(this.target.x, tx, 20, dt);
        this.target.y = damp(this.target.y, ty, 10, dt);
        this.target.z = damp(this.target.z, tz, 20, dt);
      }
      const cp = Math.cos(this.pitch);
      P.set(
        this.target.x + Math.sin(this.yaw) * cp * this.distance,
        this.target.y + Math.sin(this.pitch) * this.distance,
        this.target.z + Math.cos(this.yaw) * cp * this.distance,
      );
      P.y = Math.max(P.y, groundHeight(P.x, P.z) + 0.8);
      L.copy(this.target);
    }

    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / BLEND_TIME);
      const e = easeInOutCubic(this.blend);
      cam.position.lerpVectors(this.fromPos, P, e);
      this.look.lerpVectors(this.fromLook, L, e);
    } else {
      cam.position.copy(P);
      this.look.copy(L);
    }
    cam.lookAt(this.look);
  }
}
