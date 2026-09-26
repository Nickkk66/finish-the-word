// Lobby furniture: the shop row (every chair on a pedestal), the two lucky blocks and the
// two boards behind the table ("Most Wins" leaderboard + "How to Play").

import * as THREE from 'three';
import { BLOCKS, CHAIRS, CARD_BOXES, RARITIES } from '../shared/catalog.js';
import { buildChair, buildLuckyBlock, buildCardBox } from './cosmetics.js';
import { BLOCK_BASE, BLOCK_SPOTS, BOARDS, PEDESTAL, SHOP_ROW } from './layout.js';
import { colorMaterial, enableShadows, shadeHex } from './materials.js';
import { canvasTexture, makeCanvas, woodTexture } from './textures.js';

const FONT = "'Fredoka', 'Nunito', 'Trebuchet MS', sans-serif";
const _box = new THREE.Box3();

function safeBuild(build, id) {
  try {
    return build(id);
  } catch (err) {
    console.warn('[world] cosmetics build failed for', id, err);
    return new THREE.Group();
  }
}

/** Height of a freshly built model's bounding box top (model space). */
function modelTop(model, fallback) {
  model.updateMatrixWorld(true);
  _box.setFromObject(model);
  return _box.isEmpty() ? fallback : _box.max.y;
}

/**
 * @returns {{ colliders, shopItems: {chairId, x, z, ry, labelY, promptY}[],
 *   blocks: {blockId, x, z, labelY, promptY}[], setLeaderboard(rows), update(t, dt) }}
 */
export function createLobby(scene) {
  const colliders = [];
  const animated = [];

  // ---- Shop row ----
  const shopItems = [];
  const pedestalGeo = new THREE.CylinderGeometry(PEDESTAL.radius, PEDESTAL.radius + 0.18, PEDESTAL.height, 32);
  pedestalGeo.translate(0, PEDESTAL.height / 2, 0);
  const trimGeo = new THREE.CylinderGeometry(PEDESTAL.radius + 0.05, PEDESTAL.radius + 0.05, 0.18, 32);
  trimGeo.translate(0, PEDESTAL.height - 0.2, 0);
  const pedestals = new THREE.InstancedMesh(pedestalGeo, colorMaterial('#efe8d8'), SHOP_ROW.length);
  const trims = new THREE.InstancedMesh(trimGeo, new THREE.MeshLambertMaterial(), SHOP_ROW.length);
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  SHOP_ROW.forEach((spot, k) => {
    const chair = CHAIRS.find((c) => c.id === spot.chairId);
    m.makeTranslation(spot.x, 0, spot.z);
    pedestals.setMatrixAt(k, m);
    trims.setMatrixAt(k, m);
    trims.setColorAt(k, color.set(RARITIES[chair.rarity]?.color ?? '#ffffff'));
    const model = safeBuild(buildChair, spot.chairId);
    enableShadows(model);
    model.position.set(spot.x, PEDESTAL.height, spot.z);
    model.rotation.y = spot.ry;
    const top = modelTop(model, 6);
    scene.add(model);
    if (model.userData.update) animated.push(model);
    colliders.push({ x: spot.x, z: spot.z, r: PEDESTAL.radius + 0.1 });
    shopItems.push({ chairId: spot.chairId, x: spot.x, z: spot.z, ry: spot.ry, labelY: top + PEDESTAL.height + 0.8, promptY: 2.6 });
  });
  for (const mesh of [pedestals, trims]) {
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }

  // ---- Lucky blocks ----
  const blocks = BLOCK_SPOTS.map((spot) => {
    const def = BLOCKS.find((b) => b.id === spot.blockId);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(BLOCK_BASE.radius, BLOCK_BASE.radius + 0.25, BLOCK_BASE.height, 6),
      [colorMaterial(shadeHex(def.color, -0.35)), colorMaterial(shadeHex(def.color, 0.55)), colorMaterial('#555555')],
    );
    base.position.set(spot.x, BLOCK_BASE.height / 2, spot.z);
    base.rotation.y = spot.ry;
    enableShadows(base);
    scene.add(base);
    const model = safeBuild(buildLuckyBlock, spot.blockId);
    enableShadows(model);
    model.position.set(spot.x, BLOCK_BASE.height, spot.z);
    model.rotation.y = spot.ry;
    const top = modelTop(model, 3);
    scene.add(model);
    if (model.userData.update) animated.push(model);
    colliders.push({ x: spot.x, z: spot.z, r: BLOCK_BASE.radius });
    return { blockId: spot.blockId, x: spot.x, z: spot.z, labelY: top + BLOCK_BASE.height + 2.2, promptY: 2.4 };
  });

  const cardBoxes = CARD_BOXES.map(def => {
    const model = buildCardBox(def.id);
    model.position.set(def.x, 0, def.z); scene.add(model); enableShadows(model);
    if (model.userData.update) animated.push(model);
    colliders.push({ x: def.x, z: def.z, r: 2.2 });
    return { boxId: def.id, x: def.x, z: def.z, labelY: modelTop(model, 4) + 1.2, promptY: 2.4 };
  });
  let boardTitle = 'MOST WINS · ALL TIME';
  let boardRows = [];
  // ---- Boards ----
  let winsCanvas = null;
  let winsTexture = null, howCanvas, howTexture, roulette = false;
  for (const b of BOARDS) {
    const canvas = makeCanvas(1024, 720);
    if (b.kind === 'wins') drawLeaderboard(canvas, []);
    else drawHowTo(canvas);
    const texture = canvasTexture(canvas);
    if (b.kind === 'wins') {
      winsCanvas = canvas;
      winsTexture = texture;
    }
    if (b.kind !== 'wins') { howCanvas=canvas; howTexture=texture; }
    scene.add(buildBoard(b, texture, colliders));
  }

  return {
    colliders,
    shopItems,
    blocks,
    cardBoxes,
    setRoulette(on) { if (roulette === on) return; roulette=on; drawHowTo(howCanvas,on); howTexture.needsUpdate=true; },
    setLeaderboardTitle(title) {
      boardTitle = String(title).slice(0, 40);
      drawLeaderboard(winsCanvas, boardRows, boardTitle); winsTexture.needsUpdate = true;
    },
    setLeaderboard(rows) {
      boardRows = Array.isArray(rows) ? rows : [];
      drawLeaderboard(winsCanvas, boardRows, boardTitle);
      winsTexture.needsUpdate = true;
    },
    update(t, dt) {
      for (const model of animated) model.userData.update(t, dt);
    },
  };
}

function buildBoard(b, texture, colliders) {
  const group = new THREE.Group();
  group.position.set(b.x, 0, b.z);
  group.rotation.y = b.ry;
  const wood = new THREE.MeshLambertMaterial({ map: woodTexture('#8a5a33') });
  const W = 12.4;
  const H = 8.8;
  const cy = 9.2;
  const parts = [
    [new THREE.BoxGeometry(0.8, cy + H / 2 + 0.6, 0.8), -W / 2 - 0.1, (cy + H / 2 + 0.6) / 2, -0.1],
    [new THREE.BoxGeometry(0.8, cy + H / 2 + 0.6, 0.8), W / 2 + 0.1, (cy + H / 2 + 0.6) / 2, -0.1],
    [new THREE.BoxGeometry(W + 0.8, H + 0.8, 0.5), 0, cy, -0.2],
    [new THREE.BoxGeometry(W + 2.2, 0.55, 1.1), 0, cy + H / 2 + 0.6, -0.1],
  ];
  for (const [geo, x, y, z] of parts) {
    const mesh = new THREE.Mesh(geo, wood);
    mesh.position.set(x, y, z);
    enableShadows(mesh);
    group.add(mesh);
  }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: texture }));
  panel.position.set(0, cy, 0.06);
  group.add(panel);
  for (const sx of [-1, 1]) {
    const lx = sx * (W / 2 + 0.1);
    colliders.push({ x: b.x + Math.cos(b.ry) * lx, z: b.z - Math.sin(b.ry) * lx, r: 0.7 });
  }
  return group;
}

// ---- Board canvases ----

function boardBackground(g, w, h, top, bottom) {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, top);
  grd.addColorStop(1, bottom);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let x = -h; x < w; x += 48) {
    g.beginPath();
    g.moveTo(x, h);
    g.lineTo(x + h, 0);
    g.lineTo(x + h + 20, 0);
    g.lineTo(x + 20, h);
    g.fill();
  }
}

function outlinedText(g, text, x, y, size, color, align = 'left', stroke = 10) {
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  if (stroke > 0) {
    g.lineJoin = 'round';
    g.lineWidth = stroke;
    g.strokeStyle = '#1b1b1b';
    g.strokeText(text, x, y);
  }
  g.fillStyle = color;
  g.fillText(text, x, y);
}

function trophy(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineWidth = 6;
  g.strokeStyle = '#1b1b1b';
  g.fillStyle = '#ffc83d';
  g.beginPath();
  g.moveTo(-26, -30);
  g.lineTo(26, -30);
  g.quadraticCurveTo(26, 12, 0, 16);
  g.quadraticCurveTo(-26, 12, -26, -30);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(-28, -14, 12, Math.PI * 0.5, Math.PI * 1.5);
  g.arc(28, -14, 12, Math.PI * 1.5, Math.PI * 0.5);
  g.stroke();
  g.fillRect(-6, 14, 12, 14);
  g.strokeRect(-6, 14, 12, 14);
  g.fillRect(-20, 28, 40, 10);
  g.strokeRect(-20, 28, 40, 10);
  g.restore();
}

const MEDALS = ['#ffc83d', '#d4dde8', '#e08f5a'];

function drawLeaderboard(canvas, rows, title = 'MOST WINS · ALL TIME') {
  const g = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  boardBackground(g, w, h, '#2554a8', '#16326b');
  trophy(g, 70, 78, .8);
  trophy(g, w - 70, 78, .8);
  outlinedText(g, title, w / 2, 82, 50, '#ffffff', 'center', 9);
  const list = rows
    .filter((r) => r && typeof r.name === 'string')
    .slice()
    .sort((a, b) => (b.wins | 0) - (a.wins | 0))
    .slice(0, 8);
  if (!list.length) {
    outlinedText(g, 'No wins yet - be the first!', w / 2, h / 2 + 50, 50, '#dfe9ff', 'center', 9);
    return;
  }
  const top = 165;
  const rowH = 67;
  list.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.11)';
    g.beginPath();
    g.roundRect(40, y - rowH / 2 + 4, w - 80, rowH - 8, 18);
    g.fill();
    g.fillStyle = MEDALS[i] ?? '#5b7fc4';
    g.lineWidth = 5;
    g.strokeStyle = '#1b1b1b';
    g.beginPath();
    g.arc(96, y, 25, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    outlinedText(g, String(i + 1), 96, y + 2, 32, i < 3 ? '#1b1b1b' : '#ffffff', 'center', i < 3 ? 0 : 6);
    outlinedText(g, r.name.slice(0, 16), 145, y + 2, 44, '#ffffff', 'left', 9);
    outlinedText(g, String(r.wins | 0), w - 80, y + 2, 46, '#ffd43b', 'right', 9);
  });
}

function drawHowTo(canvas, roulette = false) {
  const g = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  boardBackground(g,w,h,roulette?'#39264f':'#2a9a4a',roulette?'#140c20':'#18692f');
  outlinedText(g, roulette ? 'THE LAST SIP' : 'HOW TO PLAY', w / 2, 82, 84, '#ffffff', 'center', 14);
  const lines = roulette ? [
    'Sit down. Place at least 25 coins.',
    'Drink or pass. You have 10 seconds.',
    'Each turn: prize x1.2, risk x1.25',
    'One pass each until a knockout.',
    'Last awake takes the whole prize.',
    'Fire takes 25 coins every 5 seconds!',
  ] : [
    'Sit at the table to join a match',
    'Type a word that starts with the letter',
    'The next word starts with its LAST letter',
    'No repeats - beat the timer!',
    'Lose all your hearts and you are OUT',
    'Last one standing wins!',
  ];
  lines.forEach((text, i) => {
    const y = 185 + i * 84;
    g.fillStyle = '#ffd43b';
    g.strokeStyle = '#1b1b1b';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(86, y, 27, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    outlinedText(g, String(i + 1), 86, y + 2, 34, '#1b1b1b', 'center', 0);
    outlinedText(g, text, 136, y + 2, 42, '#ffffff', 'left', 9);
  });
}
