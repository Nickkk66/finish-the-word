// Dev showroom for /js/world/cosmetics.js: every chair (some with a seated R6 dummy), every
// pet, both lucky blocks, and a table ring of 8 chairs + pets as the world will use them.
// Orbit camera (drag / wheel, optional turntable) and automatic contract checks (seat height,
// footprint, height, draw calls) in the corner panel. window.harness exposes view controls.

import * as THREE from 'three';
import { buildChair, buildLuckyBlock, buildPet, disposeObject } from '/js/world/cosmetics.js';
import { BLOCKS, CHAIRS, PETS, RARITIES } from '/js/shared/catalog.js';
import { LAYOUT } from '/js/shared/constants.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fd8f7');
scene.fog = new THREE.Fog('#bfe6fb', 90, 200);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 400);

scene.add(new THREE.HemisphereLight('#e3f4ff', '#4d8f2e', 1.4));
const sun = new THREE.DirectionalLight('#ffffff', 2.4);
sun.position.set(25, 45, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);

// Stud-grass floor, one checker cell per stud.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshLambertMaterial({ map: studTexture() }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function studTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * 32;
    const y = Math.floor(i / 2) * 32;
    g.fillStyle = (i === 0 || i === 3) ? '#5fbf3a' : '#53ad31';
    g.fillRect(x, y, 32, 32);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath();
    g.arc(x + 17, y + 17, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.beginPath();
    g.arc(x + 15, y + 15, 9, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(70, 70);
  t.magFilter = THREE.NearestFilter;
  return t;
}

// ---- Showroom contents ------------------------------------------------------------------

const animated = [];
const labels = [];
const labelLayer = document.getElementById('labels');

function add(obj, x, z, ry = 0) {
  obj.position.set(x, 0, z);
  obj.rotation.y = ry;
  scene.add(obj);
  animated.push(obj);
  return obj;
}

function label(obj, y, title, sub, color) {
  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = `${title}<small style="color:${color}">${sub}</small>`;
  labelLayer.append(el);
  labels.push({ el, obj, y });
}

/** R6 dummy with its hips at the origin: torso 2×2×1, legs bent forward resting on the seat. */
function makeDummy(shirt = '#0d69ac') {
  const g = new THREE.Group();
  const part = (w, h, d, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  part(2, 2, 1, shirt, 0, 1, 0);
  part(1.2, 1.2, 1.2, '#f5cd30', 0, 2.6, 0);
  for (const s of [-1, 1]) {
    part(1, 2, 1, '#f5cd30', s * 1.5, 1, 0);
    part(1, 1, 2, '#a4bd47', s * 0.5, 0.5, 1);
  }
  return g;
}

const dummies = [];
function seat(chair, shirt) {
  const d = makeDummy(shirt);
  chair.userData.seatAnchor.add(d);
  dummies.push(d);
}

// Row 1: all chairs, facing the camera's default side (+Z).
const chairs = CHAIRS.map((c, i) => {
  const chair = add(buildChair(c.id), (i - 4.5) * 4, 0);
  label(chair, c.id === 'swing' ? 8 : 6.6, c.name, c.rarity, RARITIES[c.rarity].color);
  return chair;
});
// Row 2: all pets.
const pets = PETS.map((p, i) => {
  const pet = add(buildPet(p.id), (i - 5.5) * 2.4, 8);
  label(pet, 2.1, p.name, `${p.model.kind} · ${p.rarity}`, RARITIES[p.rarity].color);
  return pet;
});
// Row 3: lucky blocks.
BLOCKS.forEach((b, i) => {
  const block = add(buildLuckyBlock(b.id), 22 + i * 7, 8);
  label(block, 4.9, b.name, `${b.price} coins`, b.color);
});
// Table ring (as the world uses it): 8 chairs at LAYOUT.seatRadius facing the table, pets beside.
const TABLE = new THREE.Vector3(0, 0, -30);
const table = new THREE.Mesh(
  new THREE.CylinderGeometry(LAYOUT.tableRadius, LAYOUT.tableRadius, 0.4, 40),
  new THREE.MeshLambertMaterial({ color: '#9a6a3f' }),
);
table.position.set(TABLE.x, LAYOUT.tableHeight - 0.2, TABLE.z);
const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, LAYOUT.tableHeight - 0.4, 16), table.material);
tableLeg.position.set(TABLE.x, (LAYOUT.tableHeight - 0.4) / 2, TABLE.z);
for (const m of [table, tableLeg]) {
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}
const ringIds = ['wooden', 'throne', 'wooden', 'gamer', 'toilet', 'wooden', 'swing', 'slime'];
const ring = ringIds.map((id, i) => {
  const a = (i / 8) * Math.PI * 2;
  const x = TABLE.x + Math.sin(a) * LAYOUT.seatRadius;
  const z = TABLE.z + Math.cos(a) * LAYOUT.seatRadius;
  const chair = add(buildChair(id), x, z, a + Math.PI);
  const pet = add(buildPet(PETS[(i * 5) % PETS.length].id), x + Math.cos(a) * 2.6, z - Math.sin(a) * 2.6, a + Math.PI);
  pet.position.y = 1.2;
  return chair;
});

// ---- Contract checks (before dummies sit down) ------------------------------------------

const checks = [];
const ray = new THREE.Raycaster();
ray.camera = camera;
const down = new THREE.Vector3(0, -1, 0);
const tmpBox = new THREE.Box3();

function meshBounds(obj) {
  const box = new THREE.Box3();
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (o.isInstancedMesh) o.computeBoundingBox();
    else if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.union(tmpBox.copy(o.isInstancedMesh ? o.boundingBox : o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box;
}

function seatTop(chair) {
  let top = -Infinity;
  for (const [x, z] of [[-0.75, 0.2], [0.75, 0.2], [-0.5, 0.9], [0.5, 0.9]]) {
    ray.set(new THREE.Vector3(chair.position.x + x, 3.3, chair.position.z + z), down);
    const hit = ray.intersectObject(chair, true).find((h) => h.object.isMesh);
    if (hit) top = Math.max(top, hit.point.y);
  }
  return top;
}

CHAIRS.forEach((c, i) => {
  const chair = chairs[i];
  const b = meshBounds(chair);
  const w = b.max.x - b.min.x;
  const d = b.max.z - b.min.z;
  const maxH = c.id === 'swing' ? 8 : 6;
  const s = seatTop(chair);
  const ok = w <= 3.001 && d <= 3.001 && b.max.y <= maxH + 0.001 && Math.abs(s - LAYOUT.seatHeight) < 0.011 && b.min.y > -0.001;
  checks.push({ ok, text: `${c.id.padEnd(9)} ${w.toFixed(2)}×${d.toFixed(2)} y${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)} seat ${s.toFixed(3)}` });
});
PETS.forEach((p, i) => {
  const b = meshBounds(pets[i]);
  const h = b.max.y - b.min.y;
  checks.push({ ok: h >= 1.1 && h <= 1.8, text: `${p.id.padEnd(9)} h${h.toFixed(2)} w${(b.max.x - b.min.x).toFixed(2)}` });
});

// Dummies: some chairs in the row (swing rides its seatAnchor) and most of the table ring.
[0, 3, 6, 7, 9].forEach((i) => seat(chairs[i], '#e53935'));
ring.forEach((chair, i) => i !== 2 && seat(chair, ['#0d69ac', '#8e24aa', '#43a047', '#fb8c00'][i % 4]));

// dispose round-trip (must not throw or break shared resources)
disposeObject(buildChair('throne'));
disposeObject(buildPet('dragon'));
disposeObject(buildLuckyBlock('secret'));

// ---- Camera: orbit + turntable -----------------------------------------------------------

const VIEWS = {
  all: [5, 1.5, 2, 62, 0.5],
  chairs: [0, 3, 0, 30, 0.22],
  chairsA: [-10, 3, 0, 16, 0.2],
  chairsB: [10, 3.2, 0, 16, 0.2],
  pets: [0, 0.9, 8, 19, 0.25],
  pets1: [-9.6, 0.75, 8, 7, 0.18],
  pets2: [0, 0.75, 8, 7, 0.18],
  pets3: [9.6, 0.75, 8, 7, 0.18],
  blocks: [25.5, 2.4, 8, 15, 0.2],
  table: [TABLE.x, 2, TABLE.z, 30, 0.55],
};
const cam = { target: new THREE.Vector3(), dist: 30, az: 0, el: 0.3, spin: true };
const state = { paused: false, dummies: true, solo: false };
let focused = null;

/** Solo mode: only the focused chair/pet is visible (for unobstructed close-ups). */
function applySolo() {
  for (const o of animated) o.visible = !state.solo || !focused || o === focused;
  table.visible = tableLeg.visible = !state.solo;
}

function focus(name) {
  const [kind, id] = name.split(':');
  focused = null;
  if (VIEWS[name]) {
    const [x, y, z, dist, el] = VIEWS[name];
    cam.target.set(x, y, z);
    Object.assign(cam, { dist, el, az: 0 });
  } else if (kind === 'chair' || kind === 'pet') {
    const list = kind === 'chair' ? CHAIRS : PETS;
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return;
    const obj = (kind === 'chair' ? chairs : pets)[i];
    focused = obj;
    cam.target.set(obj.position.x, kind === 'chair' ? 3 : 0.8, obj.position.z);
    Object.assign(cam, { dist: kind === 'chair' ? 9 : 3.6, el: 0.2, az: 0.35 });
  }
  applySolo();
}

let dragging = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = { x: e.clientX, y: e.clientY };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.az -= (e.clientX - dragging.x) * 0.006;
  cam.el = THREE.MathUtils.clamp(cam.el + (e.clientY - dragging.y) * 0.005, -0.05, 1.45);
  dragging = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', () => { dragging = null; });
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.001), 2, 120);
}, { passive: false });

// ---- Panel ------------------------------------------------------------------------------

const viewsEl = document.getElementById('views');
for (const name of Object.keys(VIEWS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => focus(name);
  viewsEl.append(b);
}
const togglesEl = document.getElementById('toggles');
function toggle(text, get, set) {
  const b = document.createElement('button');
  const sync = () => { b.textContent = text; b.classList.toggle('on', get()); };
  b.onclick = () => { set(!get()); sync(); };
  sync();
  togglesEl.append(b);
}
toggle('turntable', () => cam.spin, (v) => { cam.spin = v; });
toggle('animate', () => !state.paused, (v) => { state.paused = !v; });
toggle('solo', () => state.solo, (v) => { state.solo = v; applySolo(); });
toggle('dummies', () => state.dummies, (v) => {
  state.dummies = v;
  for (const d of dummies) d.visible = v;
});
const checksEl = document.getElementById('checks');
function renderChecks() {
  const bad = checks.filter((c) => !c.ok).length;
  checksEl.innerHTML = `${bad ? `<span class="bad">${bad} check(s) failed</span>` : 'all checks passed'} · draw calls ${renderer.info.render.calls}\n`
    + checks.map((c) => `<span class="${c.ok ? '' : 'bad'}">${c.ok ? '✓' : '✗'} ${c.text}</span>`).join('\n');
}

window.harness = {
  focus,
  cam,
  turntable: (on) => { cam.spin = on; },
  pause: (on) => { state.paused = on; },
  solo: (on) => { state.solo = on; applySolo(); },
  showDummies: (on) => { state.dummies = on; for (const d of dummies) d.visible = on; },
  panel: (on) => { document.getElementById('panel').style.display = on ? '' : 'none'; },
  checks,
};

// ---- Loop -------------------------------------------------------------------------------

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const timer = new THREE.Timer();
const proj = new THREE.Vector3();
let t = 0;
let frame = 0;
focus('all');
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  if (!state.paused) t += dt;
  if (cam.spin && !dragging) cam.az += dt * 0.15;
  for (const obj of animated) obj.userData.update?.(t, dt);
  const ce = Math.cos(cam.el);
  camera.position.set(
    cam.target.x + cam.dist * ce * Math.sin(cam.az),
    cam.target.y + cam.dist * Math.sin(cam.el),
    cam.target.z + cam.dist * ce * Math.cos(cam.az),
  );
  camera.lookAt(cam.target);
  renderer.render(scene, camera);
  for (const l of labels) {
    proj.set(l.obj.position.x, l.y, l.obj.position.z).project(camera);
    const visible = l.obj.visible && proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1 && camera.position.distanceTo(l.obj.position) < 45;
    l.el.style.display = visible ? '' : 'none';
    if (visible) l.el.style.transform = `translate(${(proj.x * 0.5 + 0.5) * innerWidth}px, ${(-proj.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
  }
  if (frame++ % 30 === 0) renderChecks();
});
