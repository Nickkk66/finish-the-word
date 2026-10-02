// Bundled CC0 models replace the simple block back accessories once loaded.
// The old geometry remains visible if an asset fails to load.
import * as THREE from 'three';
import { guitarPose } from '../shared/guitar-motion.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const gltf = new GLTFLoader();
const fbx = new FBXLoader();
const cache = new Map();
const base = '/assets/back-models/';

function model(name) {
  if (!cache.has(name)) cache.set(name, (name === 'angel_wing_low_poly'
    ? fbx.loadAsync(`${base}${name}.fbx`)
    : gltf.loadAsync(`${base}${name}.glb`).then(v => v.scene)));
  return cache.get(name);
}

function copyModel(source, tint = null, glow = null) {
  const obj = source.clone(true);
  obj.traverse(node => {
    if (!node.isMesh) return;
    node.geometry = node.geometry.clone();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    node.material = materials.map(material => {
      const copy = material.clone();
      for (const key of Object.keys(copy)) if (copy[key]?.isTexture && !(tint && key === 'map')) copy[key] = copy[key].clone();
      if (tint) { copy.color.set(tint); copy.map = null; copy.vertexColors = false; copy.metalness = 0; }
      if (glow && 'emissive' in copy) { copy.emissive.set(glow); copy.emissiveIntensity = 3.5; node.userData.bloom = true; }
      copy.side = THREE.DoubleSide;
      return copy;
    });
    if (node.material.length === 1) node.material = node.material[0];
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return obj;
}

function fitted(source, { width, height, center = [0, 0, -.9], rotation = [0, 0, 0], tint, glow } = {}) {
  const outer = new THREE.Group();
  const asset = copyModel(source, tint, glow);
  asset.rotation.set(...rotation);
  outer.add(asset);
  outer.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(outer);
  const size = box.getSize(new THREE.Vector3());
  const scale = Math.min(width / Math.max(size.x, .001), height / Math.max(size.y, .001));
  asset.scale.multiplyScalar(scale);
  outer.updateMatrixWorld(true);
  const fitBox = new THREE.Box3().setFromObject(outer);
  const midpoint = fitBox.getCenter(new THREE.Vector3());
  asset.position.set(center[0] - midpoint.x, center[1] - midpoint.y, center[2] - midpoint.z);
  return outer;
}

function disposeChildren(children) {
  for (const child of children) {
    child.removeFromParent();
    child.traverse(node => {
      node.geometry?.dispose();
      const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      for (const material of materials) material.dispose();
    });
  }
}

function wing(pair, source, sign, color, glow) {
  const pivot = new THREE.Group();
  pivot.position.set(sign * .45, .55, -.65);
  const part = fitted(source, { width: 2.0, height: 1.85, center: [1.0, 0, -.08], tint: color, glow });
  part.scale.x = sign;
  pivot.add(part);
  pair.add(pivot);
  return pivot;
}

function jetFlame(x) {
  const group = new THREE.Group();
  group.position.set(x, -.77, -1.02);
  const outer = new THREE.Mesh(new THREE.ConeGeometry(.25, .9, 12), new THREE.MeshBasicMaterial({ color: '#32afff', transparent: true, opacity: .85, depthWrite: false }));
  const inner = new THREE.Mesh(new THREE.ConeGeometry(.13, .68, 12), new THREE.MeshBasicMaterial({ color: '#d4faff', transparent: true, opacity: .95, depthWrite: false }));
  outer.rotation.z = inner.rotation.z = Math.PI;
  outer.position.y = -.3; inner.position.y = -.22;
  group.add(outer, inner);
  const glow = new THREE.PointLight('#60c9ff', 1.1, 3); glow.position.y = -.3; group.add(glow);
  return { group, outer, inner, glow };
}

export function attachBackModel(group, id, capeColor = null) {
  if (id === 'none' || id === 'rainbow' || id === 'cape' && capeColor === 'rainbow') return;
  const old = [...group.children];
  group.userData.modelLoaded = false;
  const names = id === 'jetpack' ? ['backpack', 'rocketbase', 'rocketfuel', 'rockettop']
    : ['angel', 'devil', 'dragon', 'halo'].includes(id) ? ['angel_wing_low_poly']
      : [id];
  group.userData.ready = Promise.all(names.map(model)).then(sources => {
    if (group.userData.disposed) return;
    const next = new THREE.Group();
    if (id.startsWith('secret_goggles_')) next.add(fitted(sources[0], {width:1.40,height:.44,center:[0,0,.09]}));
    else if (id === 'secret_crown') next.add(fitted(sources[0], {width:2.0,height:1.0,center:[0,2.4,0]}));
    else if (id === 'secret_scythe') next.add(fitted(sources[0], {width:2.6,height:4.2,center:[0,.25,-.82],rotation:[0,0,-.35]}));
    else if (id === 'secret_helmet') next.add(fitted(sources[0], {width:3.0,height:1.65,center:[0,2.75,0]}));
    else if (id === 'backpack') next.add(fitted(sources[0], { width: 2.5, height: 2.5, center: [0, 0, -.76], rotation: [0, Math.PI, 0] }));
    else if (id === 'cape') {
      const cape = fitted(sources[0], { width: 1.85, height: 2.65, center: [0, -.65, -.69], tint: /^#[0-9a-f]{6}$/i.test(capeColor || '') ? capeColor : null });
      next.add(cape);
      group.userData.update = (t, dt, seated = false, speed = 0) => {
        cape.rotation.x += ((seated ? -.12 : Math.min(.35, speed * .016) + Math.sin(t * 4) * .025) - cape.rotation.x) * Math.min(1, dt * 8);
        cape.scale.y = seated ? .8 : 1;
      };
    }
    else if (id === 'sword') next.add(fitted(sources[0], { width: 2.3, height: 3.35, center: [0, .08, -.58], rotation: [0, 0, -.52] }));
    else if (id === 'guitar') {
      // Fit the complete instrument before adding details in the GLB's own coordinates.
      const instrument = fitted(sources[0], { width: 2, height: 3.3, center: [0, 0, 0], tint: '#bc7c43' });
      instrument.traverse(node => {
        if (!node.isMesh) return;
        if (node.name.endsWith('_string')) {
          // The imported string surfaces sink through the fretboard. Hide only those meshes.
          node.visible = false;
        } else if (node.name.startsWith('tuning_peg')) {
          node.material.color.set('#cdb281'); node.material.metalness = .6; node.material.roughness = .4;
        } else node.material.roughness = .7;
      });
      const asset = instrument.children[0];
      const stringMaterial = new THREE.MeshStandardMaterial({ color: '#e5dfcc', metalness: .35, roughness: .5 });
      // Native model landmarks: bridge y=.19, nut y=.855; the fretboard face is z=.053..055.
      // All endpoints inherit the model fit, carry rotation and playing pose together.
      for (let i = 0; i < 6; i++) {
        const bridge = new THREE.Vector3((i - 2.5) * .0088, .19, .058);
        const nut = new THREE.Vector3((i - 2.5) * .0068, .855, .057);
        const string = new THREE.Mesh(new THREE.CylinderGeometry(.00115, .00115, bridge.distanceTo(nut), 6), stringMaterial);
        string.name = `guitar-string-${i + 1}`; string.userData.guitarString = true;
        string.position.copy(bridge).add(nut).multiplyScalar(.5);
        string.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nut.clone().sub(bridge).normalize());
        asset.add(string);
      }
      // Darken the existing sound-hole cavity, behind the wooden soundboard.
      const cavity = new THREE.Mesh(new THREE.CircleGeometry(.058, 32), new THREE.MeshBasicMaterial({ color: '#35251d' }));
      cavity.position.set(0, .34, -.04); asset.add(cavity);
      next.add(instrument);
      let blend = 0;
      group.userData.update = (t, dt, seated = false, speed = 0, active = true, playingBlend = null) => {
        blend = playingBlend ?? THREE.MathUtils.damp(blend, !seated && speed > 1 && active ? 1 : 0, 8, dt);
        const pose = guitarPose(t, blend);
        next.position.set(pose.x, pose.y, pose.z);
        next.rotation.set(0, pose.yaw, pose.roll);
        group.userData.playingBlend = blend;
      };
      group.userData.update(0, 0);
    }
    else if (['angel', 'devil', 'dragon', 'halo'].includes(id)) {
      const color = id === 'angel' ? '#f8f8ff' : id === 'devil' ? '#b83454' : id === 'dragon' ? '#8a52c8' : '#ffe4a6';
      const glow = id === 'dragon' ? '#932aff' : id === 'halo' ? '#ffe3a0' : id === 'angel' ? '#ddefff' : '#ff284f';
      const pivots = [-1, 1].map(sign => wing(next, sources[0], sign, color, glow));
      const wingLight = new THREE.PointLight(glow, 3, 6, 2); wingLight.position.set(0, .7, -.6); next.add(wingLight);
      if (id === 'halo') {
        const halo = new THREE.Group(); halo.position.y = 3.16; next.add(halo);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.72, .045, 12, 64), new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: .96 }));
        ring.rotation.x = Math.PI / 2; ring.material.toneMapped = false; ring.userData.bloom = true; halo.add(ring);
        const lamp = new THREE.PointLight('#ffe3a0', 4, 7, 2); halo.add(lamp);
        group.userData.halo = halo;
      }
      group.userData.update = (t, dt, seated = false) => pivots.forEach((pivot, i) => {
        const sign = i ? 1 : -1;
        pivot.rotation.y = sign * (.08 + Math.sin(t * 1.7) * .13 + (seated ? .28 : 0));
        pivot.rotation.z = sign * Math.sin(t * 1.2) * .045;

      });
    } else if (id === 'jetpack') {
      next.add(fitted(sources[0], { width: 1.1, height: 1.25, center: [0, .12, -.84] }));
      for (const x of [-.55, .55]) {
        next.add(fitted(sources[1], { width: .62, height: 1.32, center: [x, -.06, -1.05] }));
        next.add(fitted(sources[2], { width: .48, height: .32, center: [x, -.67, -1.05] }));
        next.add(fitted(sources[3], { width: .48, height: .39, center: [x, .62, -1.05] }));
      }
      const jets = [-.55, .55].map(jetFlame);
      for (const jet of jets) next.add(jet.group);
      group.userData.update = (t, dt, seated = false, speed = 0, active = true) => jets.forEach((jet, i) => {
        const pulse = 1 + Math.sin(t * 22 + i * 1.4) * .17;
        const power = seated ? .75 : speed > 1 ? Math.min(2.1, 1.35 + speed * .05) : .95;
        jet.group.scale.y = active ? power * pulse : .05;
        jet.group.visible = active;
        jet.outer.material.opacity = .68 + .12 * Math.sin(t * 16 + i);
        jet.glow.intensity = speed > 1 ? 2.7 : 1.1;
      });
    }
    disposeChildren(old);
    group.add(next);
    group.userData.modelLoaded = true;
  }).catch(error => {
    console.warn(`Back model ${id} could not load`, error);
    group.userData.modelLoaded = true;
  });
}
