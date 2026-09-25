// The central round wooden table on its raised deck, with 8 seat slots. The chair model at
// a slot is the seated player's equipped chair (empty seats show the wooden chair).

import * as THREE from 'three';
import { LAYOUT, SEAT_COUNT } from '../shared/constants.js';
import { CHAIR_IDS, TABLE_IDS } from '../shared/catalog.js';
import { buildChair, buildTable, disposeObject } from './cosmetics.js';
import { CENTER_X, CENTER_Z, DECK, seatX, seatYaw, seatZ } from './layout.js';
import { colorMaterial, enableShadows } from './materials.js';
import { woodTexture } from './textures.js';
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

  let tableId = null;
  let tableModel = null;
  let tablePop = 1;
  function setTable(id) {
    id = TABLE_IDS.has(id) ? id : 'classic';
    if (id === tableId) return;
    if (tableModel) { tableModel.removeFromParent(); disposeObject(tableModel); }
    tableModel = buildTable(id);
    tableModel.position.y = DECK.top;
    enableShadows(tableModel); group.add(tableModel);
    tablePop = tableId === null ? 1 : 0;
    tableId = id;
  }
  setTable('classic');

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
    setTable,
    update(t, dt) {
      tablePop = Math.min(1, tablePop + dt / POP_TIME);
      tableModel.scale.setScalar(Math.max(.01, easeOutBack(tablePop)));
      tableModel.userData.update?.(t, dt);
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
