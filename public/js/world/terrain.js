// Sky dome, sun + ambient light, the island ground (grass, beach and sand paths in ONE
// mesh: a mask texture blends stud grass and sand), animated water and drifting clouds.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, grassTexture, makeCanvas, sandTexture } from './textures.js';
import { GRASS_R, PATHS, PLAZAS, SHORE_R, WATER_Y, terrainHeight } from './layout.js';
import { TAU, clamp, mulberry32 } from './math.js';

const SKY_TOP = '#6ec3f4';
const SKY_HORIZON = '#d5f1ff';
/** Direction *towards* the sun (front-left of the spawn view, so faces we look at are lit). */
const SUN_DIR = new THREE.Vector3(-0.42, 0.8, 0.43).normalize();

const SHADOW_MAP = 2048;
const MASK_EXTENT = 100; // the ground mask texture covers [-100, 100]² world units

export function createTerrain(scene) {
  scene.background = new THREE.Color(SKY_HORIZON);
  scene.fog = new THREE.Fog(SKY_HORIZON, 150, 720);

  scene.add(buildSky());
  const hemi = new THREE.HemisphereLight('#e2f2ff', '#a9bf8e', 1.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff3dc', 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 280;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.045;
  sun.shadow.radius = 2.5;
  sun.shadow.intensity = 0.78;
  scene.add(sun, sun.target);

  scene.add(buildGround());
  const water = buildWater();
  scene.add(water, buildSeabed());
  const clouds = buildClouds();
  scene.add(clouds);

  // Orthonormal basis of the sun's view, used to snap the shadow camera to whole texels
  // so shadows don't shimmer while the focus moves.
  const lightRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
  const lightUp = new THREE.Vector3().crossVectors(SUN_DIR, lightRight).normalize();
  const snapped = new THREE.Vector3();
  let extent = 0;

  return {
    sun,
    /** Centers the (tight) shadow frustum on `focus`, covering ±`halfSize` units. */
    setShadowFocus(focus, halfSize) {
      const cam = sun.shadow.camera;
      if (halfSize !== extent) {
        extent = halfSize;
        cam.left = cam.bottom = -halfSize;
        cam.right = cam.top = halfSize;
        cam.updateProjectionMatrix();
      }
      const texel = (2 * halfSize) / SHADOW_MAP;
      const u = Math.round(focus.dot(lightRight) / texel) * texel;
      const v = Math.round(focus.dot(lightUp) / texel) * texel;
      snapped.copy(lightRight).multiplyScalar(u).addScaledVector(lightUp, v).addScaledVector(SUN_DIR, focus.dot(SUN_DIR));
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(SUN_DIR, 140);
    },
    update(t) {
      water.material.uniforms.uTime.value = t;
      clouds.rotation.y = t * 0.004;
    },
  };
}

// ---- Sky ----------------------------------------------------------------------------------

function buildSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(SKY_TOP) },
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uSunDir: { value: SUN_DIR },
      uSunColor: { value: new THREE.Color('#fff6dc') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // always on the far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uTop, pow(max(d.y, 0.0), 0.5));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (smoothstep(0.9993, 0.9996, s) * 0.9 + pow(s, 10.0) * 0.16);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), material);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

// ---- Ground ---------------------------------------------------------------------------------

/** White = sand. Beach ring beyond a gently wavy grass line, plus paths and plazas. */
function buildGroundMask() {
  const N = 1024;
  const k = N / (2 * MASK_EXTENT);
  const px = (v) => (v + MASK_EXTENT) * k;
  const c = makeCanvas(N);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';

  g.beginPath();
  g.rect(0, 0, N, N);
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * TAU;
    const r = GRASS_R - 0.4 + Math.sin(a * 5) * 0.7 + Math.sin(a * 13 + 1) * 0.35;
    const x = px(Math.cos(a) * r);
    const y = px(Math.sin(a) * r);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.fill('evenodd');

  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const p of PATHS) {
    g.lineWidth = p.width * k;
    g.beginPath();
    p.points.forEach(([x, z], i) => (i ? g.lineTo(px(x), px(z)) : g.moveTo(px(x), px(z))));
    g.stroke();
  }
  for (const p of PLAZAS) {
    g.beginPath();
    g.arc(px(p.x), px(p.z), p.r * k, 0, TAU);
    g.fill();
  }
  const tex = canvasTexture(c, { data: true });
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function buildGround() {
  // Polar grid: dense rings where the beach slopes, sparse in the flat middle.
  const radii = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 55, 57, 58, 59, 60, 61.5, 63, 64.5, 66, 67.5,
    69, 71, 74, 78, 83, 90, 100];
  const SEG = 160;
  const rows = radii.length;
  const cols = SEG + 1;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const col = new Float32Array(rows * cols * 3);
  for (let i = 0; i < rows; i++) {
    const r = radii[i];
    const y = terrainHeight(r);
    const under = clamp((r - SHORE_R) / 22, 0, 1); // darken + blue-tint the seabed with depth
    for (let j = 0; j < cols; j++) {
      const a = (j / SEG) * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const n = (i * cols + j) * 3;
      pos[n] = x;
      pos[n + 1] = y;
      pos[n + 2] = z;
      const m = (i * cols + j) * 2;
      uv[m] = (x + MASK_EXTENT) / (2 * MASK_EXTENT);
      uv[m + 1] = 1 - (z + MASK_EXTENT) / (2 * MASK_EXTENT);
      // Broad, soft light/dark patches keep the big lawn from looking flat.
      const patch = 1 + 0.06 * Math.sin(x * 0.075 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.068 - x * 0.021);
      col[n] = patch * (1 - under * 0.5);
      col[n + 1] = patch * (1 - under * 0.32);
      col[n + 2] = patch * (1 - under * 0.12);
    }
  }
  const index = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();

  const grass = grassTexture();
  const sand = sandTexture();
  const mask = buildGroundMask();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tGrass = { value: grass };
    shader.uniforms.tSand = { value: sand };
    shader.uniforms.tMask = { value: mask };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;\nvarying vec2 vMaskUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = position.xz;\nvMaskUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D tGrass;\nuniform sampler2D tSand;\nuniform sampler2D tMask;\nvarying vec2 vGroundXZ;\nvarying vec2 vMaskUv;',
      )
      .replace(
        '#include <map_fragment>',
        `vec3 grassCol = texture2D(tGrass, vGroundXZ / 8.0).rgb;
         vec3 sandCol = texture2D(tSand, vGroundXZ / 7.0).rgb;
         float sandMix = smoothstep(0.3, 0.7, texture2D(tMask, vMaskUv).r);
         diffuseColor.rgb *= mix(grassCol, sandCol, sandMix);`,
      );
  };
  material.customProgramCacheKey = () => 'ftw-island-ground';

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

// ---- Water ------------------------------------------------------------------------------------

function buildWater() {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color('#2f9be0') },
        uShallow: { value: new THREE.Color('#6fdcf0') },
        uShoreR: { value: SHORE_R },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uShoreR;
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_fragment>
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
                   mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        float r = length(vWorld.xz);
        float shallow = 1.0 - smoothstep(uShoreR - 1.0, uShoreR + 20.0, r);
        vec3 col = mix(uDeep, uShallow, shallow * 0.7);
        // Drifting ripple highlights.
        vec2 p = vWorld.xz * 0.14;
        float n = vnoise(p + vec2(uTime * 0.32, uTime * 0.21)) + vnoise(p * 1.9 + vec2(-uTime * 0.26, uTime * 0.3));
        col = mix(col, vec3(1.0), smoothstep(1.22, 1.6, n) * 0.4);
        // Foam lapping at the shoreline (two wobbling bands).
        float ang = atan(vWorld.z, vWorld.x);
        float wob = sin(ang * 9.0 + uTime * 1.4) * 0.3 + sin(uTime * 1.1 + ang * 3.0) * 0.4;
        float foam = 1.0 - smoothstep(0.0, 1.0, abs(r - (uShoreR - 0.4) - wob));
        float foam2 = 1.0 - smoothstep(0.0, 0.55, abs(r - (uShoreR + 2.2) - wob * 1.5 - sin(uTime * 0.8) * 0.7));
        float f = clamp(foam + foam2 * 0.55, 0.0, 1.0);
        col = mix(col, vec3(1.0), f * 0.85);
        gl_FragColor = vec4(col, max(mix(0.94, 0.66, shallow), f * 0.9));
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const geo = new THREE.PlaneGeometry(2400, 2400);
  geo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geo, material);
  water.position.y = WATER_Y;
  return water;
}

/** Deep-blue floor far below the water so the horizon never shows through it. */
function buildSeabed() {
  const geo = new THREE.CircleGeometry(1200, 48);
  geo.rotateX(-Math.PI / 2);
  const bed = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#1d6fae' }));
  bed.position.y = -9.05;
  return bed;
}

// ---- Clouds ----------------------------------------------------------------------------------

function buildClouds() {
  const rnd = mulberry32(99);
  const puffs = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU + rnd() * 0.25;
    const r = 170 + rnd() * 230;
    const y = 70 + rnd() * 60;
    const size = 12 + rnd() * 14;
    const n = 4 + ((rnd() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const off = (k / (n - 1) - 0.5) * size * 1.7;
      puffs.push({
        a,
        r: r + (rnd() - 0.5) * size * 0.8,
        off,
        y: y + rnd() * size * 0.25 - Math.abs(off) * 0.12,
        sx: size * (0.55 + rnd() * 0.45),
        sy: size * (0.34 + rnd() * 0.28),
        sz: size * (0.55 + rnd() * 0.4),
      });
    }
  }
  const geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.24);
  const material = new THREE.MeshLambertMaterial({
    color: '#ffffff',
    emissive: '#d7e8f5',
    emissiveIntensity: 0.62,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, material, puffs.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  puffs.forEach((pf, i) => {
    // Puffs line up tangentially around the island so clouds read as long, fluffy banks.
    const tx = -Math.sin(pf.a);
    const tz = Math.cos(pf.a);
    p.set(Math.cos(pf.a) * pf.r + tx * pf.off, pf.y, Math.sin(pf.a) * pf.r + tz * pf.off);
    q.setFromAxisAngle(up, -pf.a);
    s.set(pf.sz, pf.sy, pf.sx);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}
