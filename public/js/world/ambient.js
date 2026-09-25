// Six instanced draws total; no per-animal objects or allocations in the frame loop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createAmbient(scene) {
  const clock = { value: 0 };
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, .45, -1, 0, -.2, 0, 0, -.15, 0, 0, .45, 0, 0, -.15, 1, 0, -.2,
  ], 3));
  wingGeometry.computeVertexNormals();
  const wingMaterial = new THREE.MeshLambertMaterial({ color: '#f4f7ff', side: THREE.DoubleSide });
  wingMaterial.onBeforeCompile = shader => {
    shader.uniforms.ambientTime = clock;
    shader.vertexShader = `uniform float ambientTime;\n${shader.vertexShader}`.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.y += abs(position.x) * sin(ambientTime * 8.0 + instanceMatrix[3].x) * .48;');
  };
  const birds = new THREE.InstancedMesh(wingGeometry, wingMaterial, 17);
  const butterflies = new THREE.InstancedMesh(wingGeometry, wingMaterial.clone(), 8);
  butterflies.material.onBeforeCompile = wingMaterial.onBeforeCompile;
  const fish = new THREE.InstancedMesh(new THREE.ConeGeometry(.34, 1.25, 5).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ffb955' }), 4);
  const splash = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .065, 4, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#c8f8ff', transparent: true, opacity: .65 }), 4);
  const bunnyGeometry = mergeGeometries([
    new THREE.BoxGeometry(.9, .65, 1.2).translate(0, .45, 0),
    new THREE.BoxGeometry(.7, .7, .65).translate(0, .9, .5),
    new THREE.BoxGeometry(.2, .85, .25).translate(-.22, 1.6, .45),
    new THREE.BoxGeometry(.2, .85, .25).translate(.22, 1.6, .45),
  ]);
  const bunnies = new THREE.InstancedMesh(bunnyGeometry, new THREE.MeshLambertMaterial({ color: '#fff1de' }), 4);
  const eyes = new THREE.InstancedMesh(mergeGeometries([
    new THREE.BoxGeometry(.11, .11, .05).translate(-.2, 1, .84),
    new THREE.BoxGeometry(.11, .11, .05).translate(.2, 1, .84),
  ]), new THREE.MeshBasicMaterial({ color: '#273047' }), 4);
  const meshes = [birds, butterflies, fish, splash, bunnies, eyes];
  for (const mesh of meshes) { mesh.frustumCulled = false; scene.add(mesh); }
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  for (let i = 0; i < 8; i++) butterflies.setColorAt(i, color.setHSL(i / 8, .8, .65));
  const critters = Array.from({ length: 4 }, (_, i) => ({ x: -30 + i * 19, z: 34 + (i % 2) * 8, yaw: i, escape: 0 }));
  let low = false;
  function setQuality(level) {
    low = level === 'low';
    for (const mesh of meshes) mesh.count = low ? Math.ceil(mesh.instanceMatrix.count / 2) : mesh.instanceMatrix.count;
  }
  function put(mesh, i, x, y, z, size, yaw = 0) {
    dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(size); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  function update(t, dt, player) {
    clock.value = t;
    for (let i = 0; i < birds.count; i++) {
      const flock = i < 7 ? 0 : i < 14 ? 1 : 2;
      const a = t * (.10 + flock * .025) + i * .34;
      const r = flock === 2 ? 8 : 20 + (i % 7) * .9;
      put(birds, i, (flock === 2 ? -37 : flock ? 18 : -15) + Math.cos(a) * r, (flock === 2 ? 33 : 40 + flock * 7) + Math.sin(a * 2 + i), (flock === 2 ? -35 : -12) + Math.sin(a) * r, flock === 2 ? 1 : .8, -a);
    }
    for (let i = 0; i < butterflies.count; i++) {
      const a = t * .65 + i * 2;
      put(butterflies, i, -30 + i * 8 + Math.cos(a) * 2, 2 + Math.sin(a * 2) * .7, 32 + Math.sin(a) * 3, .26, -a);
    }
    for (let i = 0; i < fish.count; i++) {
      const phase = (t * .2 + i * .27) % 1;
      const jump = phase < .3 ? Math.sin(phase / .3 * Math.PI) * 4 : -2;
      const a = i * 1.4 + .6;
      put(fish, i, Math.cos(a) * 76 + phase * 4, -.9 + jump, Math.sin(a) * 76, 1, a);
      put(splash, i, Math.cos(a) * 76, -.7, Math.sin(a) * 76, phase < .3 ? .01 : ((phase - .3) * 3 + .1), a);
    }
    for (let i = 0; i < bunnies.count; i++) {
      const b = critters[i];
      if (player && Math.hypot(player.x - b.x, player.z - b.z) < 7) {
        b.yaw = Math.atan2(b.x - player.x, b.z - player.z); b.escape = 2;
      }
      b.escape = Math.max(0, b.escape - dt);
      if (!b.escape) b.yaw += Math.sin(t * .4 + i) * dt * .5;
      b.x += Math.sin(b.yaw) * dt * (b.escape ? 5 : .7); b.z += Math.cos(b.yaw) * dt * (b.escape ? 5 : .7);
      if (Math.hypot(b.x, b.z) > 52 || Math.hypot(b.x, b.z) < 20) b.yaw += Math.PI * dt * 3;
      const hop = Math.max(0, Math.sin(t * (b.escape ? 12 : 4) + i)) * (b.escape ? .7 : .12);
      put(bunnies, i, b.x, hop, b.z, 1, b.yaw); put(eyes, i, b.x, hop, b.z, 1, b.yaw);
    }
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  }
  return { update, setQuality };
}
