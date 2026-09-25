// The only renderer is the world's renderer. Requests are cached and serviced one per frame.
import * as THREE from 'three';
import { buildChair, buildPet, buildLuckyBlock, buildTable, buildBackBling, buildCardBox, disposeObject } from './cosmetics.js';

export function createThumbnails(renderer) {
  const cache = new Map();
  const queue = [];
  const builders = { chair: buildChair, table: buildTable, pet: buildPet, back: buildBackBling, block: buildLuckyBlock, cardBox: buildCardBox };
  function render(kind, id, size = 160) {
    size = Math.max(48, Math.min(512, Math.round(size) || 160));
    const key = `${kind}:${id}:${size}`;
    if (!cache.has(key)) {
      const request = new Promise((resolve, reject) => queue.push({ kind, id, size, resolve, reject, key }));
      cache.set(key, request);
    }
    return cache.get(key);
  }
  function tick() {
    const req = queue.shift();
    if (!req) return;
    let model, target;
    const oldTarget = renderer.getRenderTarget();
    const oldColor = renderer.getClearColor(new THREE.Color());
    const oldAlpha = renderer.getClearAlpha();
    const oldViewport = renderer.getViewport(new THREE.Vector4());
    const oldScissor = renderer.getScissor(new THREE.Vector4());
    const oldTest = renderer.getScissorTest();
    try {
      const build = builders[req.kind];
      if (!build) throw new Error('Unknown thumbnail kind');
      model = build(req.id);
      if (req.kind === 'back') model.rotation.y = Math.PI;
      const studio = new THREE.Scene();
      studio.add(new THREE.HemisphereLight(0xffffff, 0x8093b8, 2.7));
      const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(4, 8, 6); studio.add(light);
      studio.add(model);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      if (box.isEmpty()) box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
      const center = box.getCenter(new THREE.Vector3());
      const extent = box.getSize(new THREE.Vector3()).length() * 0.58;
      const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 500);
      camera.position.copy(center).add(new THREE.Vector3(1, 0.65, 1.4).normalize().multiplyScalar(extent / Math.sin(THREE.MathUtils.degToRad(17.5))));
      camera.lookAt(center);
      target = new THREE.WebGLRenderTarget(req.size, req.size, { depthBuffer: true });
      target.texture.colorSpace = THREE.SRGBColorSpace;
      renderer.setRenderTarget(target);
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(studio, camera);
      const pixels = new Uint8Array(req.size * req.size * 4);
      renderer.readRenderTargetPixels(target, 0, 0, req.size, req.size, pixels);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = req.size;
      const context = canvas.getContext('2d');
      const img = context.createImageData(req.size, req.size);
      for (let row = 0; row < req.size; row++) img.data.set(pixels.subarray((req.size - row - 1) * req.size * 4, (req.size - row) * req.size * 4), row * req.size * 4);
      context.putImageData(img, 0, 0);
      req.resolve(canvas.toDataURL('image/png'));
    } catch (error) {
      cache.delete(req.key); req.reject(error);
    } finally {
      renderer.setRenderTarget(oldTarget);
      renderer.setClearColor(oldColor, oldAlpha);
      renderer.setViewport(oldViewport);
      renderer.setScissor(oldScissor);
      renderer.setScissorTest(oldTest);
      target?.dispose();
      if (model) disposeObject(model);
    }
  }
  return { render, tick };
}
