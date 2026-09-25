// A pet model (from cosmetics.buildPet) that floats, bobs and smoothly follows its owner.

import * as THREE from 'three';
import { buildPet, disposeObject } from './cosmetics.js';
import { enableShadows } from './materials.js';
import { damp, dampAngle, easeOutBack } from './math.js';

export class PetFollower {
  constructor(petId) {
    this.petId = petId;
    this.object = new THREE.Group();
    try {
      this.model = buildPet(petId);
    } catch (err) {
      console.warn('[world] buildPet failed for', petId, err);
      this.model = new THREE.Group();
    }
    enableShadows(this.model, true, false);
    this.object.add(this.model);
    this.object.scale.setScalar(0.01);
    this.pop = 0;
    this.placed = false;
    this.phase = Math.random() * Math.PI * 2;
  }

  /** Eases toward the target transform (world space) and runs the model's idle animation. */
  update(dt, t, x, y, z, yaw) {
    const o = this.object.position;
    if (!this.placed) {
      o.set(x, y, z);
      this.object.rotation.y = yaw;
      this.placed = true;
    } else {
      o.x = damp(o.x, x, 5, dt);
      o.y = damp(o.y, y, 5, dt);
      o.z = damp(o.z, z, 5, dt);
      this.object.rotation.y = dampAngle(this.object.rotation.y, yaw, 6, dt);
    }
    this.model.position.y = Math.sin(t * 2.4 + this.phase) * 0.22;
    if (this.pop < 1) {
      this.pop = Math.min(1, this.pop + dt / 0.45);
      this.object.scale.setScalar(Math.max(0.01, easeOutBack(this.pop)));
    }
    this.model.userData.update?.(t, dt);
  }

  dispose() {
    this.object.removeFromParent();
    disposeObject(this.model);
  }
}
