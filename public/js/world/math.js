// Small allocation-free math helpers shared by the world modules.

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing toward `b` at rate `lambda` (1/s). */
export function damp(a, b, lambda, dt) {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}

/** Wraps an angle to [-PI, PI). */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Like damp() but along the shortest arc between two angles. */
export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

export function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Deterministic PRNG (mulberry32). The island is decorated with seeded randomness so
 * every client builds the identical world (trees are colliders, so this matters).
 */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function random() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
