// Additional v2 cosmetics. Model-local materials keep animated previews independent.
import * as THREE from 'three';
import { surfaceTexture } from './ember.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from '../shared/constants.js';
import { TABLE_IDS, BACK_IDS, CARD_BOXES } from '../shared/catalog.js';

const TAU = Math.PI * 2;
function kit(name) {
  const group = new THREE.Group();
  group.name = name;
  const materials = new Map();
  function material(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .5, ...opts }));
    return materials.get(key);
  }
  function mesh(geometry, color, pos = [0, 0, 0], opts = {}, parent = group) {
    const m = new THREE.Mesh(geometry, material(color, opts));
    m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  const box = (w, h, d, color, pos, opts, parent) => mesh(new THREE.BoxGeometry(w, h, d), color, pos, opts, parent);
  const cylinder = (r, h, color, pos, opts, parent, sides = 48) => mesh(new THREE.CylinderGeometry(r, r, h, sides), color, pos, opts, parent);
  function ring(r, tube, color, pos, opts, parent) {
    const m = mesh(new THREE.TorusGeometry(r, tube, 8, 64), color, pos, opts, parent);
    m.rotation.x = Math.PI / 2; return m;
  }
  return { group, mesh, material, box, cylinder, ring };
}

// Merge siblings with equal materials. Leave nested groups separate for animation.
function bake(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || child.userData.animated) continue;
    const key = child.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: child.material, geometries: [], meshes: [] });
    const b = buckets.get(key);
    child.updateMatrix();
    b.geometries.push(child.geometry.clone().applyMatrix4(child.matrix)); b.meshes.push(child);
  }
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) { b.geometries.forEach((g) => g.dispose()); continue; }
    const geo = mergeGeometries(b.geometries);
    b.geometries.forEach((g) => g.dispose());
    if (!geo) continue;
    for (const m of b.meshes) { group.remove(m); m.geometry.dispose(); }
    const m = new THREE.Mesh(geo, b.mat); m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
}

export function buildTable(tableId) {
  const id = TABLE_IDS.has(tableId) ? tableId : 'classic';
  const k = kit(`table:${id}`), { group, cylinder, ring, box, mesh } = k;
  const R = LAYOUT.tableRadius, top = LAYOUT.tableHeight;
  const colors = { classic: '#b47a45', picnic: '#bb7643', glass: '#90dce9', donut: '#ef91be', poker: '#23634b', pizza: '#f6c347', ice: '#b5edff', lava: '#342e3b', galaxy: '#242048', royal: '#7044ad' };
  const color = colors[id];
  const stem = id === 'classic' || id === 'picnic' ? '#79502e' : id === 'royal' ? '#dcb454' : '#404957';
  cylinder(1.12, .18, stem, [0, .10, 0], { metalness: .3 });
  cylinder(.55, top - .56, stem, [0, .19 + (top - .56) / 2, 0], { metalness: .35 });
  if (id === 'donut') {
    const dough = ring(3.45, 1.98, '#d69956', [0, top - 1.93, 0]); dough.scale.y = .27;
    const frosting = ring(3.45, 1.95, color, [0, top - 1.82, 0]); frosting.scale.y = .22;
    // Flattened torus models have their height scaled in local Z after ring rotation.
    dough.scale.set(1, 1, .28); dough.position.y = top - .60;
    frosting.scale.set(1, 1, .12); frosting.position.y = top - .22;
    const sprinkleColors = ['#ffffff', '#8ddbea', '#f7d54b', '#bb58c6'];
    for (let i = 0; i < 52; i++) {
      const a = i * 2.39996, r = 2.05 + (i % 7) * .42;
      const s = box(.09, .055, .28, sprinkleColors[i % 4], [Math.cos(a) * r, top + .025, Math.sin(a) * r]); s.rotation.y = a;
    }
  } else if (id === 'picnic') {
    for (let i = -5; i <= 5; i++) {
      const z = i * .95, len = 2 * Math.sqrt(R * R - z * z);
      box(len, .36, .91, i % 2 ? '#c68b53' : color, [0, top - .18, z]);
      for (const x of [-len / 2 + .22, len / 2 - .22]) cylinder(.045, .02, '#534433', [x, top + .012, z]);
    }
  } else {
    cylinder(R, .36, color, [0, top - .18, 0], id === 'glass' ? { transparent: true, opacity: .50, roughness: .1, metalness: .18, depthWrite: false } : id === 'ice' ? { roughness: .12, metalness: .22 } : {}, group, id === 'ice' ? 10 : 64);
  }
  if (id === 'classic') {
    ring(R - .10, .11, '#704525', [0, top - .12, 0]);
    for (let z = -4; z <= 4; z += 1) box(2 * Math.sqrt(R * R - z * z) - .18, .015, .025, '#966036', [0, top + .012, z]);
  } else if (id === 'glass') {
    ring(R - .05, .09, '#d5e1e5', [0, top - .1, 0], { metalness: .85, roughness: .15 });
    ring(2, .065, '#a5dce6', [0, top - .42, 0], { metalness: .8 });
  } else if (id === 'poker') {
    const cloth=new THREE.Mesh(new THREE.CircleGeometry(R-.38,96),new THREE.MeshStandardMaterial({map:surfaceTexture('felt'),roughness:1}));cloth.rotation.x=-Math.PI/2;cloth.position.y=top+.021;group.add(cloth);
    ring(2.7,.025,'#c8b57c',[0,top+.045,0]);ring(2.82,.014,'#c8b57c',[0,top+.045,0]);
    for(let i=0;i<8;i++){
      const a=i*TAU/8;
      const area=new THREE.Mesh(new THREE.TorusGeometry(.68,.023,6,32,Math.PI),new THREE.MeshStandardMaterial({color:'#c8b57c',roughness:1}));
      area.rotation.set(Math.PI/2,0,-a);area.position.set(Math.sin(a)*3.9,top+.047,Math.cos(a)*3.9);group.add(area);
      for(let j=0;j<7;j++){const stitchAngle=a+(j-3)*.045;const stitch=box(.055,.015,.018,'#bfa992',[Math.sin(stitchAngle)*(R-.16),top+.13,Math.cos(stitchAngle)*(R-.16)]);stitch.rotation.y=stitchAngle;}
    }
    ring(R - .15, .23, '#372e36', [0, top - .1, 0]);
    ring(R - .68, .028, '#d2b982', [0, top + .018, 0]);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      const card = box(.5, .03, .72, '#fff8e8', [Math.sin(a) * 3.9, top + .035, Math.cos(a) * 3.9]); card.rotation.y = a;
      cylinder(.16, .08, i % 2 ? '#d94e59' : '#68a6e2', [Math.sin(a + .12) * 4.55, top + .05, Math.cos(a + .12) * 4.55]);
    }
  } else if (id === 'pizza') {
    ring(R - .18, .24, '#bc772d', [0, top - .05, 0]);
    for (let i = 0; i < 8; i++) {
      const cut = box(.025, .02, R * 1.85, '#d99432', [0, top + .018, 0]); cut.rotation.y = i * Math.PI / 4;
    }
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4, r = .8 + (i % 5) * .81;
      cylinder(.29, .045, '#b94b35', [Math.cos(a) * r, top + .032, Math.sin(a) * r], {}, group, 16);
    }
  } else if (id === 'ice') {
    ring(R - .3, .05, '#e1fbff', [0, top + .02, 0], { emissive: '#74bde2', emissiveIntensity: .3 });
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const line = box(.065, .022, 4.1, '#ecfcff', [Math.sin(a) * 1.8, top + .02, Math.cos(a) * 1.8]); line.rotation.y = a;
    }
  } else if (id === 'lava') {
    ring(R - .12, .13, '#ff7c31', [0, top - .07, 0], { emissive: '#ff4815', emissiveIntensity: 1.5 });
    const magma = new THREE.Group(); group.add(magma);
    for (let i = 0; i < 19; i++) {
      const a = i * 2.39996, r = .4 + i % 6 * .8;
      const line = box(.09, .025, 1.3 + i % 3 * .3, '#ff9d3c', [Math.cos(a) * r, top + .026, Math.sin(a) * r], { emissive: '#ff530d', emissiveIntensity: 1.3 }, magma); line.rotation.y = a + .7;
    }
    bake(magma); group.userData.update = (t) => magma.children.forEach((m) => { m.material.emissiveIntensity = 1.2 + .5 * Math.sin(t * 2); });
  } else if (id === 'galaxy') {
    ring(R - .08, .08, '#b6a0f7', [0, top - .04, 0], { emissive: '#7651dc', emissiveIntensity: .8 });
    const stars = new THREE.Group(); group.add(stars);
    for (let i = 0; i < 45; i++) {
      const a = i * 2.39996, r = .4 + (i % 13) * .36;
      mesh(new THREE.OctahedronGeometry(.035 + i % 3 * .017), i % 3 ? '#d9dcff' : '#ffd889', [Math.cos(a) * r, top + .075, Math.sin(a) * r], { emissive: '#8275d9', emissiveIntensity: .8 }, stars);
    }
    bake(stars); group.userData.update = (t) => { stars.rotation.y = t * .06; };
  } else if (id === 'royal') {
    ring(R - .1, .17, '#e9c565', [0, top - .06, 0], { metalness: .65, roughness: .22 });
    ring(3.8, .04, '#ddba5a', [0, top + .023, 0]);
    for (let i = 0; i < 24; i++) {
      const a = i * TAU / 24;
      mesh(new THREE.OctahedronGeometry(.10), '#ffe6a1', [Math.sin(a) * 5.1, top + .025, Math.cos(a) * 5.1], { metalness: .6 });
    }
    for (let i = 0; i < 5; i++) {
      const tooth = box(.22, .03, .8, '#e9c565', [(i - 2) * .30, top + .03, .2]); tooth.rotation.y = (i - 2) * .2;
    }
    box(1.65, .04, .25, '#e9c565', [0, top + .04, -.3]);
  }
  bake(group); return group;
}

export function buildBackBling(backId, capeColor = null) {
  const id = BACK_IDS.has(backId) ? backId : 'none';
  const k = kit(`back:${id}`), { group, mesh, box, cylinder, ring } = k;
  if (id === 'none') return group;
  if (id === 'backpack') {
    box(1.35, 1.6, .6, '#258ccc', [0, -.05, -.88]);
    box(1.08, .60, .2, '#1d659c', [0, -.42, -1.25]);
    box(.48, .12, .17, '#ffc74f', [0, -.24, -1.37]);
    for (const x of [-.48, .48]) box(.13, 1.55, .12, '#274456', [x, 0, -.53]);
  } else if (id === 'cape' || id === 'rainbow') {
    const pivot = new THREE.Group(); pivot.position.set(0, .72, -.56); group.add(pivot);
    const rainbow = capeColor === 'rainbow' || (capeColor == null && id === 'rainbow');
    const color = /^#[0-9a-f]{6}$/i.test(capeColor) ? capeColor : '#d84752';
    const cape = mesh(new THREE.PlaneGeometry(1.9, 2.8, 8, 12), rainbow ? '#ff5e90' : color, [0, -1.4, 0], { side: THREE.DoubleSide }, pivot);
    cape.userData.animated = true;
    const attr = cape.geometry.attributes.position, original = new Float32Array(attr.array);
    box(1.6, .18, .16, '#f0cb67', [0, .8, -.55]);
    group.userData.update = (t, dt, seated = false, speed = 0) => {
      const target = seated ? .2 : Math.min(70 * Math.PI / 180, Math.max(0, speed / 16) * 70 * Math.PI / 180);
      pivot.rotation.x += (target - pivot.rotation.x) * (1 - Math.exp(-9 * dt));
      for (let i = 0; i < attr.count; i++) { const y = original[i * 3 + 1]; attr.setZ(i, -.045 * (1.4 - y) * (1 + Math.sin(t * 4 + y * 2 + original[i * 3]))); }
      attr.needsUpdate = true; cape.scale.y = seated ? .62 : 1;
      if (rainbow) cape.material.color.setHSL((t * .12) % 1, .8, .6);
    };
  } else if (['angel', 'devil', 'dragon', 'halo'].includes(id)) {
    const white = id === 'angel', gold = id === 'halo', dragon = id === 'dragon';
    const color = white ? '#f7f4eb' : gold ? '#f2ce66' : dragon ? '#893aab' : '#ba3948';
    const wings = [];
    for (const sign of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sign * .55, .5, -.65); group.add(pivot); wings.push(pivot);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(sign * .65, .7); shape.lineTo(sign * 2.4, 1.35);
      shape.lineTo(sign * 1.95, -.25); shape.lineTo(sign * 1.5, .0); shape.lineTo(sign * 1.1, -.65);
      shape.lineTo(sign * .7, -.4); shape.lineTo(0, -.8); shape.closePath();
      mesh(new THREE.ExtrudeGeometry(shape, { depth: .10, bevelEnabled: false }), color, [0, 0, -.1], { side: THREE.DoubleSide, metalness: gold ? .5 : .05 }, pivot);
      if (white || gold) {
        for (let i = 0; i < 7; i++) {
          const feather = box(.25, 1.2 - i * .075, .13, i % 2 ? color : '#ffffff', [sign * (.35 + i * .24), -.12 + i * .16, -.17], {}, pivot);
          feather.rotation.z = sign * -.4;
        }
      } else {
        for (let i = 0; i < 3; i++) {
          const spar = box(.09, 1.85, .15, dragon ? '#e3ad62' : '#542331', [sign * (.45 + i * .45), .32, -.2], {}, pivot);
          spar.rotation.z = sign * (-.3 - i * .3);
        }
      }
      bake(pivot);
    }
    if (gold) ring(.64, .085, '#ffdb6d', [0, 2.28, 0], { emissive: '#c69730', emissiveIntensity: .6, metalness: .6 });
    group.userData.update = (t, dt, seated = false) => wings.forEach((w, i) => {
      const sign = i === 0 ? -1 : 1;
      w.rotation.y = sign * (.12 + Math.sin(t * (dragon ? 2 : 1.6)) * .20 + (seated ? .7 : 0)); w.scale.setScalar(seated ? .7 : 1);
    });
  } else if (id === 'sword') {
    const weapon = new THREE.Group(); weapon.rotation.z = -.45; weapon.position.set(0, .25, -.85); group.add(weapon);
    box(.28, 2.25, .12, '#d7e5ed', [0, .2, 0], { metalness: .8, roughness: .2 }, weapon);
    const tip = mesh(new THREE.ConeGeometry(.2, .45, 4), '#e9f6ff', [0, 1.55, 0], { metalness: .6 }, weapon); tip.rotation.y = Math.PI / 4;
    box(.95, .16, .23, '#e1b24d', [0, -.88, 0], { metalness: .6 }, weapon);
    box(.20, .60, .20, '#674858', [0, -1.2, 0], {}, weapon); bake(weapon);
  } else if (id === 'guitar') {
    const guitar = new THREE.Group(); guitar.rotation.z = -.45; guitar.position.set(0, -.1, -.96); group.add(guitar);
    const body = mesh(new THREE.SphereGeometry(.65, 16, 10), '#e6983e', [0, -.45, 0], {}, guitar); body.scale.set(1, 1.2, .28);
    const shoulder = mesh(new THREE.SphereGeometry(.48, 16, 10), '#e6983e', [0, .15, 0], {}, guitar); shoulder.scale.z = .3;
    box(.18, 1.65, .15, '#6e4937', [0, 1, 0], {}, guitar);
    box(.35, .4, .18, '#d69a58', [0, 1.93, 0], {}, guitar);
    const soundhole = cylinder(.23, .02, '#493425', [0, -.27, -.2], {}, guitar); soundhole.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) box(.012, 2.1, .014, '#e8d8b4', [(i - 1.5) * .035, .60, -.22], {}, guitar);
    bake(guitar);
  } else if (id === 'jetpack') {
    box(1.1, 1.25, .55, '#57667f', [0, .05, -.85], { metalness: .6 });
    const flames = [];
    for (const x of [-.6, .6]) {
      cylinder(.3, 1.65, '#c4d0e3', [x, .1, -.92], { metalness: .7 });
      ring(.3, .055, '#43d7fb', [x, .65, -.92], { emissive: '#13a7d9', emissiveIntensity: .7 });
      const flame = mesh(new THREE.ConeGeometry(.22, .8, 12), '#ffad3a', [x, -1.04, -.92], { emissive: '#ff7920', emissiveIntensity: 1.5 });
      flame.rotation.z = Math.PI; flame.userData.animated = true; flames.push(flame);
    }
    group.userData.update = (t, dt, seated = false) => flames.forEach((f, i) => { f.scale.y = seated ? .2 : .7 + .3 * Math.sin(t * 18 + i); });
  }
  bake(group); return group;
}

export function buildPortal() {
  const { group, mesh, box } = kit('portal');
  const rim = mesh(new THREE.TorusGeometry(3.1, .30, 10, 64), '#7741b7', [0, 3.5, 0], { metalness: .4, emissive: '#6126a5', emissiveIntensity: .5 });
  const inner = mesh(new THREE.TorusGeometry(2.82, .075, 8, 64), '#73e3fa', [0, 3.5, .08], { emissive: '#38bcf1', emissiveIntensity: 1.8 });
  box(3.6, .40, 1.6, '#524975', [0, .20, 0]);
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } }, side: THREE.DoubleSide, transparent: true,
    vertexShader: 'varying vec2 uvp; void main(){uvp=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 uvp; uniform float time;
      void main(){vec2 p=(uvp-.5)*2.; float r=length(p); float a=atan(p.y,p.x);
      float swirl=sin(a*5.-r*17.+time*3.)*.5+.5;
      float dust=pow(max(0.,sin(a*31.+r*45.-time*2.)),18.);
      vec3 c=mix(vec3(.19,.035,.45),vec3(.1,.85,1.),swirl*(.4+.6*r));
      c+=dust*.25; c+=vec3(.2,.3,.5)*pow(1.-r,3.);
      gl_FragColor=vec4(c,smoothstep(1.,.92,r)*.94); }`,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.82, 64), material); disc.position.set(0, 3.5, .02); group.add(disc);
  group.userData.update = (t) => { material.uniforms.time.value = t; rim.rotation.z = .03 * Math.sin(t); inner.material.emissiveIntensity = 1.6 + .4 * Math.sin(t * 2); };
  return group;
}

export function buildCardBox(boxId) {
  const def = CARD_BOXES.find((b) => b.id === boxId) || CARD_BOXES[0];
  const { group, box } = kit(`cardBox:${def.id}`);
  box(3.2, 2.2, 2.5, def.color, [0, 1.1, 0]);
  box(3.35, .35, 2.65, '#273845', [0, 2.37, 0], { metalness: .35 });
  for (const x of [-1.35, 1.35]) box(.15, 2.22, 2.54, '#ece3be', [x, 1.12, 0], { metalness: .3 });
  box(.6, .75, .13, '#ecd087', [0, 1.98, 1.36], { metalness: .5 });
  const card = new THREE.Group(); card.position.set(0, 3.0, 0); group.add(card);
  box(1.32, 1.85, .12, '#f7f5e8', [0, 0, 0], {}, card);
  box(1.12, 1.63, .14, def.color, [0, 0, 0], {}, card);
  const mark = box(.55, .55, .16, '#fff1c4', [0, 0, 0], {}, card); mark.rotation.z = Math.PI / 4;
  bake(card); bake(group);
  group.userData.update = (t) => { card.position.y = 3.05 + .15 * Math.sin(t * 2); card.rotation.y = Math.sin(t * .7) * .35; };
  return group;
}
