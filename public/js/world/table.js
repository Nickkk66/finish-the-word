// The central round wooden table on its raised deck, with 8 seat slots. The chair model at
// a slot is the seated player's equipped chair (empty seats show the wooden chair).

import * as THREE from 'three';
import { LAYOUT, SEAT_COUNT } from '../shared/constants.js';
import { CHAIR_IDS } from '../shared/catalog.js';
import { buildChair, disposeObject } from './cosmetics.js';
import { CENTER_X, CENTER_Z, DECK, seatX, seatYaw, seatZ } from './layout.js';
import { colorMaterial, enableShadows } from './materials.js';
import { tableTopTexture, woodTexture } from './textures.js';
import { easeOutBack } from './math.js';

const POP_TIME = 0.4;

export function createTable(scene) {
  const group = new THREE.Group();
  group.position.set(CENTER_X, 0, CENTER_Z);
  scene.add(group);

  // Deck: planked top, darker beveled side (the bevel is what makes it walkable).
  const planks = woodTexture('#b07a45').clone();
  planks.repeat.set(3, 3);
  planks.needsUpdate = true;
  const deckSide = colorMaterial('#7d5430');
  const deckH = DECK.top + 0.4;
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(DECK.radius, DECK.radius + DECK.bevel, deckH, 64),
    [deckSide, new THREE.MeshLambertMaterial({ map: planks }), deckSide],
  );
  deck.position.y = DECK.top - deckH / 2;
  deck.receiveShadow = true;
  group.add(deck);

  // Table: top at DECK.top + tableHeight, central pedestal (seated legs fit underneath).
  const topY = DECK.top + LAYOUT.tableHeight;
  const edge = colorMaterial('#6f4526');
  const tableTop = new THREE.Mesh(
    new THREE.CylinderGeometry(LAYOUT.tableRadius, LAYOUT.tableRadius - 0.1, 0.36, 64),
    [edge, new THREE.MeshLambertMaterial({ map: tableTopTexture() }), edge],
  );
  tableTop.position.y = topY - 0.18;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(LAYOUT.tableRadius, 0.1, 8, 64).rotateX(Math.PI / 2), edge);
  rim.position.y = topY - 0.04;
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.1, LAYOUT.tableHeight, 24), edge);
  pedestal.position.y = DECK.top + LAYOUT.tableHeight / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.4, 0.3, 32), edge);
  foot.position.y = DECK.top + 0.15;
  group.add(tableTop, rim, pedestal, foot);
  [tableTop, rim, pedestal, foot].forEach((m) => enableShadows(m));

  const slots = [];
  for (let i = 0; i < SEAT_COUNT; i++) {
    const slot = new THREE.Group();
    slot.position.set(seatX(i) - CENTER_X, DECK.top, seatZ(i) - CENTER_Z);
    slot.rotation.y = seatYaw(i);
    group.add(slot);
    slots.push({ group: slot, chairId: null, model: null, pop: 1 });
  }

  function setChair(i, chairId) {
    const slot = slots[i];
    const id = CHAIR_IDS.has(chairId) ? chairId : 'wooden';
    if (!slot || slot.chairId === id) return;
    if (slot.model) {
      slot.group.remove(slot.model);
      disposeObject(slot.model);
    }
    let model;
    try {
      model = buildChair(id);
    } catch (err) {
      console.warn('[world] buildChair failed for', id, err);
      model = new THREE.Group();
    }
    enableShadows(model);
    slot.group.add(model);
    slot.model = model;
    // Swaps pop in; the initial wooden chairs just appear.
    slot.pop = slot.chairId === null ? 1 : 0;
    slot.chairId = id;
  }
  for (let i = 0; i < SEAT_COUNT; i++) setChair(i, 'wooden');

  const colliders = [{ x: CENTER_X, z: CENTER_Z, r: LAYOUT.tableRadius + 0.3 }];
  for (let i = 0; i < SEAT_COUNT; i++) colliders.push({ x: seatX(i), z: seatZ(i), r: 1.3 });

  return {
    colliders,
    setChair,
    update(t, dt) {
      for (const slot of slots) {
        if (slot.pop < 1) {
          slot.pop = Math.min(1, slot.pop + dt / POP_TIME);
          slot.model.scale.setScalar(Math.max(0.01, easeOutBack(slot.pop)));
        }
        slot.model.userData.update?.(t, dt);
      }
    },
  };
}
