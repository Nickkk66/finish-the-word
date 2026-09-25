// Procedural canvas textures (the world ships no image files): stud grass, sand, wood,
// pixel leaves/bark/stone, avatar faces, particle sprites and a few decals.
// Every generator is cached: calling it twice returns the same shared texture.

import * as THREE from 'three';
import { FACES } from '../shared/catalog.js';
import { mulberry32 } from './math.js';
import { shadeHex } from './materials.js';

let anisotropy = 1;
/** Called once by the world with the renderer's capability (textures made later use it). */
export function setTextureAnisotropy(n) {
  anisotropy = Math.max(1, Math.min(8, n | 0));
}

const cache = new Map();
function cached(key, make) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasTexture(canvas, { repeat = false, pixelated = false, data = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (pixelated) t.magFilter = THREE.NearestFilter;
  t.anisotropy = anisotropy;
  return t;
}

function speckle(g, w, h, count, colors, size, rnd) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[(rnd() * colors.length) | 0];
    const s = size * (0.6 + rnd() * 0.8);
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

function disc(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/** Pixel-art noise: `size`² cells picked from a palette (optionally weighted). */
function pixelNoise(size, palette, seed, rows = size) {
  const c = makeCanvas(size, rows);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < size; x++) {
      g.fillStyle = palette[(rnd() * palette.length) | 0];
      g.fillRect(x, y, 1, 1);
    }
  }
  return { c, g, rnd };
}

// ---- Ground ------------------------------------------------------------------------

/** Roblox stud grass: 8×8 studs per tile on a 4-stud checker of the two spec greens. */
export function grassTexture() {
  return cached('grass', () => {
    const S = 512;
    const U = S / 8;
    const c = makeCanvas(S);
    const g = c.getContext('2d');
    const rnd = mulberry32(7);
    g.fillStyle = '#5fbf3a';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#56b233';
    g.fillRect(0, 0, S / 2, S / 2);
    g.fillRect(S / 2, S / 2, S / 2, S / 2);
    speckle(g, S, S, 9000, ['rgba(255,255,255,0.06)', 'rgba(20,70,0,0.08)', 'rgba(120,200,40,0.10)'], 3, rnd);
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        const cx = i * U + U / 2;
        const cy = j * U + U / 2;
        const r = U * 0.29;
        g.fillStyle = 'rgba(10,60,0,0.12)';
        disc(g, cx + 2.5, cy + 3.5, r);
        g.fillStyle = 'rgba(255,255,255,0.07)';
        disc(g, cx, cy, r);
        g.strokeStyle = 'rgba(255,255,255,0.14)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx, cy, r - 3, Math.PI * 0.95, Math.PI * 1.65);
        g.stroke();
      }
    }
    return canvasTexture(c, { repeat: true });
  });
}

export function sandTexture() {
  return cached('sand', () => {
    const S = 256;
    const c = makeCanvas(S);
    const g = c.getContext('2d');
    const rnd = mulberry32(3);
    g.fillStyle = '#e8d9a8';
    g.fillRect(0, 0, S, S);
    speckle(g, S, S, 900, ['rgba(255,250,225,0.35)', 'rgba(190,160,100,0.18)'], 10, rnd);
    speckle(g, S, S, 5000, ['rgba(160,130,80,0.22)', 'rgba(255,255,240,0.3)', 'rgba(210,190,140,0.3)'], 2.2, rnd);
    return canvasTexture(c, { repeat: true });
  });
}

// ---- Wood / leaves / stone -----------------------------------------------------------

/** Wooden planks running along U (8 per tile) with grain, joints and gaps. */
export function woodTexture(base = '#9a6a3f') {
  return cached('wood' + base, () => {
    const S = 256;
    const rows = 8;
    const h = S / rows;
    const c = makeCanvas(S);
    const g = c.getContext('2d');
    const rnd = mulberry32(11);
    for (let r = 0; r < rows; r++) {
      const y0 = r * h;
      g.fillStyle = shadeHex(base, (rnd() - 0.5) * 0.16);
      g.fillRect(0, y0, S, h);
      g.lineWidth = 1.2;
      for (let k = 0; k < 6; k++) {
        const y = y0 + 4 + rnd() * (h - 8);
        g.strokeStyle = rnd() < 0.5 ? 'rgba(60,32,12,0.16)' : 'rgba(255,220,170,0.10)';
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(S * 0.3, y + (rnd() - 0.5) * 5, S * 0.7, y + (rnd() - 0.5) * 5, S, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(45,25,8,0.5)';
      g.fillRect((rnd() * S) | 0, y0, 2, h);
      g.fillRect(0, y0, S, 2);
      g.fillStyle = 'rgba(255,230,190,0.12)';
      g.fillRect(0, y0 + 2, S, 1.5);
    }
    return canvasTexture(c, { repeat: true });
  });
}

/** Round table top: radial planks with a dark inlay ring near the rim. */
export function tableTopTexture() {
  return cached('tabletop', () => {
    const S = 512;
    const c = makeCanvas(S);
    const g = c.getContext('2d');
    const wood = woodTexture('#a5713f').image;
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(Math.PI / 4);
    g.drawImage(wood, -S, -S, S * 2, S * 2);
    g.restore();
    g.strokeStyle = 'rgba(70,38,14,0.7)';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 22, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,220,160,0.25)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 30, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(70,38,14,0.55)';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(S / 2, S / 2, 64, 0, Math.PI * 2);
    g.stroke();
    return canvasTexture(c);
  });
}

/** Pixel-art leaves (tinted per instance, so they are only lightly green). */
export function leavesTexture() {
  return cached('leaves', () => {
    const { c, g, rnd } = pixelNoise(16, ['#6cc94a', '#5dbb3e', '#79d655', '#4fa834', '#66c445', '#88e060'], 21);
    g.fillStyle = 'rgba(30,90,20,0.55)';
    for (let i = 0; i < 22; i++) g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    g.fillStyle = 'rgba(210,255,170,0.5)';
    for (let i = 0; i < 12; i++) g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    return canvasTexture(c, { repeat: true, pixelated: true });
  });
}

export function barkTexture() {
  return cached('bark', () => {
    const { c, g, rnd } = pixelNoise(8, ['#7a5230', '#6e4828', '#855a35', '#70492a'], 5, 16);
    g.fillStyle = 'rgba(40,22,8,0.45)';
    for (let i = 0; i < 6; i++) g.fillRect((rnd() * 8) | 0, (rnd() * 12) | 0, 1, 2 + ((rnd() * 3) | 0));
    return canvasTexture(c, { repeat: true, pixelated: true });
  });
}

export function stoneTexture() {
  return cached('stone', () => {
    const { c } = pixelNoise(16, ['#a9adb2', '#9b9fa5', '#b5b9bd', '#8f949a', '#a3a7ac'], 9);
    return canvasTexture(c, { repeat: true, pixelated: true });
  });
}

// ---- Avatar faces ---------------------------------------------------------------------

function faceEyes(g, rx = 11, ry = 21, y = 104) {
  g.beginPath();
  g.ellipse(92, y, rx, ry, 0, 0, Math.PI * 2);
  g.ellipse(164, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

/** Transparent face decal for FACES[index] (drawn on the head's front face). */
export function faceTexture(index) {
  const name = FACES[index] ?? FACES[0];
  return cached('face-' + name, () => {
    const S = 256;
    const c = makeCanvas(S);
    const g = c.getContext('2d');
    g.fillStyle = '#141414';
    g.strokeStyle = '#141414';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    switch (name) {
      case 'Grin': {
        faceEyes(g, 11, 20, 100);
        g.beginPath();
        g.moveTo(78, 142);
        g.quadraticCurveTo(128, 150, 178, 142);
        g.quadraticCurveTo(170, 206, 128, 206);
        g.quadraticCurveTo(86, 206, 78, 142);
        g.closePath();
        g.fill();
        g.save();
        g.clip();
        g.fillStyle = '#ffffff';
        g.fillRect(70, 138, 120, 20);
        g.fillStyle = '#ff6f8a';
        g.beginPath();
        g.ellipse(128, 206, 30, 17, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
        break;
      }
      case 'Cool': {
        g.beginPath();
        g.roundRect(60, 84, 60, 38, [6, 6, 18, 18]);
        g.roundRect(136, 84, 60, 38, [6, 6, 18, 18]);
        g.fill();
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(112, 92);
        g.lineTo(144, 92);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(72, 110);
        g.lineTo(86, 94);
        g.moveTo(148, 110);
        g.lineTo(162, 94);
        g.stroke();
        g.strokeStyle = '#141414';
        g.lineWidth = 10;
        g.beginPath();
        g.moveTo(98, 164);
        g.quadraticCurveTo(140, 180, 170, 150);
        g.stroke();
        break;
      }
      case 'Wow': {
        faceEyes(g, 14, 23, 102);
        g.fillStyle = '#ffffff';
        disc(g, 97, 92, 5);
        disc(g, 169, 92, 5);
        g.lineWidth = 7;
        g.beginPath();
        g.arc(92, 76, 18, Math.PI * 1.2, Math.PI * 1.8);
        g.stroke();
        g.beginPath();
        g.arc(164, 76, 18, Math.PI * 1.2, Math.PI * 1.8);
        g.stroke();
        g.fillStyle = '#141414';
        g.beginPath();
        g.ellipse(128, 170, 17, 21, 0, 0, Math.PI * 2);
        g.fill();
        break;
      }
      default: {
        // Classic Roblox smile.
        faceEyes(g);
        g.lineWidth = 10;
        g.beginPath();
        g.arc(128, 124, 52, Math.PI * 0.2, Math.PI * 0.8);
        g.stroke();
      }
    }
    return canvasTexture(c);
  });
}

// ---- Particles / decals ------------------------------------------------------------------

/** White 4-point star with a glow (additive; tinted per particle). */
export function sparkleTexture() {
  return cached('sparkle', () => {
    const S = 64;
    const c = makeCanvas(S);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(32, 1);
    g.quadraticCurveTo(35, 29, 63, 32);
    g.quadraticCurveTo(35, 35, 32, 63);
    g.quadraticCurveTo(29, 35, 1, 32);
    g.quadraticCurveTo(29, 29, 32, 1);
    g.fill();
    return canvasTexture(c);
  });
}

/** Chunky red ✕ with white and dark outlines ("wrong" pop). */
export function xMarkTexture() {
  return cached('xmark', () => {
    const S = 128;
    const c = makeCanvas(S);
    const g = c.getContext('2d');
    g.lineCap = 'round';
    const stroke = (color, w) => {
      g.strokeStyle = color;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(32, 32);
      g.lineTo(96, 96);
      g.moveTo(96, 32);
      g.lineTo(32, 96);
      g.stroke();
    };
    stroke('#1b1b1b', 36);
    stroke('#ffffff', 27);
    stroke('#ff3b4a', 16);
    return canvasTexture(c);
  });
}

function heartPath(g) {
  g.beginPath();
  g.moveTo(64, 110);
  g.bezierCurveTo(22, 84, 6, 56, 18, 36);
  g.bezierCurveTo(30, 16, 56, 16, 64, 38);
  g.bezierCurveTo(72, 16, 98, 16, 110, 36);
  g.bezierCurveTo(122, 56, 106, 84, 64, 110);
  g.closePath();
}

const CRACK = [[64, 30], [55, 50], [70, 64], [57, 80], [68, 95], [64, 112]];

/** Heart sprite; `part` = 'full' | 'left' | 'right' (halves split along a zigzag crack). */
export function heartTexture(part = 'full') {
  return cached('heart-' + part, () => {
    const S = 128;
    const c = makeCanvas(S);
    const g = c.getContext('2d');
    if (part !== 'full') {
      g.beginPath();
      g.moveTo(part === 'left' ? 0 : S, 0);
      for (const [x, y] of CRACK) g.lineTo(x, y);
      g.lineTo(part === 'left' ? 0 : S, S);
      g.closePath();
      g.clip();
    }
    heartPath(g);
    g.fillStyle = '#ff3b4a';
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = '#1b1b1b';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(38, 42, 9, 13, -0.6, 0, Math.PI * 2);
    g.fill();
    if (part !== 'full') {
      g.strokeStyle = '#1b1b1b';
      g.lineWidth = 6;
      g.beginPath();
      CRACK.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
    return canvasTexture(c);
  });
}

/** Soft glowing ring used under the current player's seat. */
export function ringGlowTexture() {
  return cached('ringglow', () => {
    const S = 256;
    const c = makeCanvas(S);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0.18)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    grd.addColorStop(0.72, 'rgba(255,255,255,1)');
    grd.addColorStop(0.8, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.9, 'rgba(255,255,255,0.25)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return canvasTexture(c);
  });
}

/** Vertical fade (opaque at the bottom) for light columns. */
export function beamTexture() {
  return cached('beam', () => {
    const c = makeCanvas(4, 128);
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0.9)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 128);
    return canvasTexture(c);
  });
}

/** Top of the spawn pad: grey stone with a white ring and a yellow star. */
export function spawnDecalTexture() {
  return cached('spawn', () => {
    const S = 256;
    const c = makeCanvas(S);
    const g = c.getContext('2d');
    const rnd = mulberry32(4);
    g.fillStyle = '#a3a7ac';
    g.fillRect(0, 0, S, S);
    speckle(g, S, S, 2500, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.08)'], 3, rnd);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 12;
    g.beginPath();
    g.arc(128, 128, 88, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ffd43b';
    g.strokeStyle = '#1b1b1b';
    g.lineWidth = 6;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 26 : 58;
      g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 8;
    g.strokeRect(4, 4, S - 8, S - 8);
    return canvasTexture(c);
  });
}
