// Island layout: where everything lives. Pure data + tiny helpers shared by the scene
// builders (terrain / props / table / lobby) and the gameplay code (colliders, camera,
// prompts) so they always agree. 1 unit = 1 Roblox stud, +Y up, ground at y = 0.
//
// Top view: the table is the island center, the spawn is "south" (+Z) of it and a new
// player looks north (-Z) at: the table (center), the shop chair row (east, x = 19),
// the lucky blocks (west), the two boards behind the table and the lighthouse (north-west).
// A pier leaves the south beach at the end of the main path.

import { LAYOUT, SEAT_COUNT } from '../shared/constants.js';
import { CHAIRS } from '../shared/catalog.js';

export const CENTER_X = LAYOUT.tableCenter.x;
export const CENTER_Z = LAYOUT.tableCenter.z;

/**
 * Raised wooden platform under the table. LAYOUT.seatHeight / tableHeight are measured
 * from its top (the chairs and the table stand on it); a beveled rim makes it walkable.
 */
export const DECK = { radius: 12, bevel: 1.2, top: 0.3 };

export const GRASS_R = LAYOUT.islandRadius - 12; // grass ends, sand beach begins
export const SHORE_R = LAYOUT.islandRadius - 4; // waterline
const WALK_R = LAYOUT.islandRadius - 5.5; // invisible wall on the beach
export const WATER_Y = -0.8;

export const SPAWN_PAD = { x: LAYOUT.spawn.x, z: LAYOUT.spawn.z, half: 3.5, top: 0.12 };

// ---- Table seats ---------------------------------------------------------------

export function seatAngle(i) {
  return (i * Math.PI * 2) / SEAT_COUNT;
}
export function seatX(i, radius = LAYOUT.seatRadius) {
  return CENTER_X + Math.sin(seatAngle(i)) * radius;
}
export function seatZ(i, radius = LAYOUT.seatRadius) {
  return CENTER_Z + Math.cos(seatAngle(i)) * radius;
}
/** rotation.y that turns a +Z-facing model (chair / sitter) toward the table center. */
export function seatYaw(i) {
  return seatAngle(i) + Math.PI;
}

// ---- Lobby furniture -------------------------------------------------------------

/** Shop chairs on pedestals in a row east of the spawn path, facing the walkway (-X). */
export const SHOP_ROW = CHAIRS.map((c, k) => ({ chairId: c.id, x: 19, z: 22.5 - k * 5, ry: -Math.PI / 2 }));
export const PEDESTAL = { radius: 1.9, height: 0.8 };

export const BLOCK_SPOTS = [
  { blockId: 'starter', x: -12.5, z: 18.5, ry: 0.5 },
  { blockId: 'secret', x: -19.5, z: 13.5, ry: 0.9 },
];
export const BLOCK_BASE = { radius: 2.5, height: 0.5 };

export const BOARDS = [
  { kind: 'wins', x: -8.2, z: -25, ry: 0.14 },
  { kind: 'howto', x: 8.2, z: -25, ry: -0.14 },
];

export const LIGHTHOUSE = { x: -37, z: -35 };

/** Walkable wooden pier sticking out of the south beach into the water. */
export const PIER = { x: 0, z0: 58, z1: 80, half: 2.4, top: 0.25 };

// ---- Sand paths (painted into the ground mask; props keep clear of them) ----------

function chaikin(points, iterations = 3) {
  let pts = points;
  for (let k = 0; k < iterations; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

export const PATHS = [
  { width: 5, points: [[0, 62], [0, 44], [0, 30], [0, 12]] }, // south beach -> spawn -> table
  { width: 4.2, points: [[0, 21], [9, 19.5], [15, 15], [15, 0], [15, -24]] }, // shop walkway
  { width: 4.2, points: [[0, 22], [-8, 18.5], [-15.5, 16]] }, // lucky blocks
  { width: 4.2, points: [[0, -12], [0, -21]] }, // leaderboards
  { width: 7, points: [[-15, -21], [15, -21]] }, // plaza in front of the boards
  { width: 3.8, points: [[-9, -9], [-16, -18], [-24, -24], [-31, -30]] }, // lighthouse trail
  { width: 3.8, points: [[15, -24], [22, -34], [34, -40], [47, -38]] }, // east beach trail
  { width: 3.8, points: [[-15.5, 16], [-28, 22], [-40, 30], [-50, 31]] }, // west beach trail
].map((p) => ({ width: p.width, points: chaikin(p.points) }));

/** Sand circles: ring around the deck, lucky block plaza, lighthouse yard. */
export const PLAZAS = [
  { x: CENTER_X, z: CENTER_Z, r: DECK.radius + DECK.bevel + 2.4 },
  { x: -16, z: 16, r: 6.8 },
  { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 8.5 },
  { x: SPAWN_PAD.x, z: SPAWN_PAD.z, r: 6.2 },
];

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Distance from (x, z) to the nearest sand path/plaza edge (negative = on the sand). */
export function distToSand(x, z) {
  let d = Infinity;
  for (const p of PATHS) {
    const pts = p.points;
    for (let i = 0; i < pts.length - 1; i++) {
      d = Math.min(d, distToSegment(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) - p.width / 2);
    }
  }
  for (const c of PLAZAS) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - c.r);
  return d;
}

/** Areas kept free of decoration (trees, bushes, flowers, rocks). */
const RESERVED = [
  { x: CENTER_X, z: CENTER_Z, r: 19 }, // table + deck
  { x: SPAWN_PAD.x, z: SPAWN_PAD.z, r: 9 },
  { x: -16, z: 16, r: 10 }, // lucky blocks
  { x: -29, z: 23, r: 12 }, // card crate plaza
  { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 11 },
];
const RESERVED_RECTS = [
  { x0: 11, x1: 26, z0: -28, z1: 28 }, // shop row + walkway
  { x0: -17, x1: 17, z0: -30, z1: -16 }, // leaderboards
  { x0: -12, x1: 12, z0: 20, z1: 54 }, // view from the spawn toward the table
];

/** True when a decoration of radius `r` can go at (x, z) without blocking a feature. */
export function isFreeForDecor(x, z, r) {
  for (const c of RESERVED) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false;
  for (const b of RESERVED_RECTS) {
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return false;
  }
  return distToSand(x, z) > r + 0.6;
}

// ---- Ground height ------------------------------------------------------------------

/** Natural terrain height at a distance `r` from the island center (flat grass, sloped beach). */
export function terrainHeight(r) {
  if (r <= GRASS_R) return 0;
  if (r <= SHORE_R) {
    const t = (r - GRASS_R) / (SHORE_R - GRASS_R);
    return WATER_Y * t * (0.6 + 0.4 * t); // gently eases in from the grass line
  }
  return Math.max(-9, WATER_Y - (r - SHORE_R) * 0.38);
}

function onPier(x, z) {
  return Math.abs(x - PIER.x) < PIER.half && z > PIER.z0 && z < PIER.z1;
}

/** Walkable surface height at (x, z), including the table deck, spawn pad and pier. */
export function groundHeight(x, z) {
  const rd = Math.hypot(x - CENTER_X, z - CENTER_Z);
  if (rd < DECK.radius + DECK.bevel) {
    return rd <= DECK.radius ? DECK.top : DECK.top * (1 - (rd - DECK.radius) / DECK.bevel);
  }
  if (Math.abs(x - SPAWN_PAD.x) < SPAWN_PAD.half && Math.abs(z - SPAWN_PAD.z) < SPAWN_PAD.half) {
    return SPAWN_PAD.top;
  }
  const h = terrainHeight(Math.hypot(x, z));
  return onPier(x, z) ? Math.max(h, PIER.top) : h;
}

/** Keeps a position (mutated in place) on the island or the pier. */
export function clampWalkable(p) {
  const r = Math.hypot(p.x, p.z);
  if (r <= WALK_R || onPier(p.x, p.z)) return;
  const margin = 0.8;
  if (p.z > PIER.z0 && Math.abs(p.x - PIER.x) < PIER.half + 1.5) {
    // Stepped off the side / end of the pier: push back onto its planks.
    p.x = Math.max(PIER.x - PIER.half + margin, Math.min(PIER.x + PIER.half - margin, p.x));
    p.z = Math.min(p.z, PIER.z1 - margin);
    return;
  }
  p.x *= WALK_R / r;
  p.z *= WALK_R / r;
}
