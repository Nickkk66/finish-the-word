// Shared material cache + small color helpers. Materials returned from here are shared
// across many meshes: never dispose them from a single owner.

import * as THREE from 'three';

const _c = new THREE.Color();
const _grey = new THREE.Color();

/** Lighten (f > 0) or darken (f < 0) a hex color. Returns a '#rrggbb' string. */
export function shadeHex(hex, f) {
  _c.set(hex);
  if (f >= 0) _c.lerp(_grey.setRGB(1, 1, 1), f);
  else _c.multiplyScalar(1 + f);
  return '#' + _c.getHexString();
}

/** Desaturated, slightly darkened version of a color (knocked-out players). */
export function greyHex(hex) {
  _c.set(hex);
  const l = _c.r * 0.3 + _c.g * 0.59 + _c.b * 0.11;
  _grey.setRGB(l, l, l);
  _c.lerp(_grey, 0.85).multiplyScalar(0.72);
  return '#' + _c.getHexString();
}

const lambertCache = new Map();

/** Shared matte material for a flat color. */
export function colorMaterial(hex) {
  const key = hex.toLowerCase();
  let m = lambertCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: key });
    lambertCache.set(key, m);
  }
  return m;
}

/** Marks every mesh under `root` as a shadow caster/receiver. */
export function enableShadows(root, cast = true, receive = true) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}
