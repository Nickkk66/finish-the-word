import * as THREE from 'three';

// Blur light emitted by marked accessory meshes, with normal scene geometry
// still occluding it. This is a screen-space light bloom, not a scaled mesh shell.
export function createAccessoryBloom(renderer) {
  const target = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
  const base = target(), glow = target(), horizontal = target(), vertical = target();
  const quadScene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quadScene.add(quad);
  const vertexShader = 'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const blur = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { image: { value: null }, step: { value: new THREE.Vector2() } }, vertexShader,
    fragmentShader: 'uniform sampler2D image;uniform vec2 step;varying vec2 uv0;void main(){vec4 c=texture2D(image,uv0)*.227027;c+=(texture2D(image,uv0+step*1.384615)+texture2D(image,uv0-step*1.384615))*.316216;c+=(texture2D(image,uv0+step*3.230769)+texture2D(image,uv0-step*3.230769))*.070270;gl_FragColor=c;}' });
  const composite = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { image: { value: base.texture }, glow: { value: vertical.texture } }, vertexShader,
    fragmentShader: 'uniform sampler2D image;uniform sampler2D glow;varying vec2 uv0;void main(){vec4 b=texture2D(image,uv0);vec3 light=texture2D(glow,uv0).rgb;gl_FragColor=vec4(b.rgb+light*.32,b.a);\n#include <colorspace_fragment>\n}' });
  const black = new THREE.MeshBasicMaterial({ color: 0, side: THREE.DoubleSide });
  const blackColor = new THREE.Color(0), saved = new Map(), hidden = [];
  let width = 1, height = 1;
  function size(w, h) { width = w; height = h; base.setSize(w, h); for (const t of [glow, horizontal, vertical]) t.setSize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2))); }
  function render(scene, view) {
    let emits = false;
    scene.traverseVisible(node => { if (node.isMesh && node.userData.bloom) emits = true; });
    if (!emits) { renderer.render(scene, view); return; }
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(base); renderer.render(scene, view);
    const background = scene.background; scene.background = blackColor;
    scene.traverseVisible(node => {
      if (node.isMesh && !node.userData.bloom) { saved.set(node, node.material); node.material = black; }
      else if (node.isSprite || node.isPoints || node.isLine) { hidden.push(node); node.visible = false; }
    });
    renderer.setRenderTarget(glow); renderer.render(scene, view);
    for (const [node, material] of saved) node.material = material;
    saved.clear(); for (const node of hidden) node.visible = true; hidden.length = 0; scene.background = background;
    quad.material = blur; blur.uniforms.image.value = glow.texture; blur.uniforms.step.value.set(1.8 / glow.width, 0);
    renderer.setRenderTarget(horizontal); renderer.render(quadScene, camera);
    blur.uniforms.image.value = horizontal.texture; blur.uniforms.step.value.set(0, 1.8 / glow.height);
    renderer.setRenderTarget(vertical); renderer.render(quadScene, camera);
    quad.material = composite; renderer.setRenderTarget(previous); renderer.render(quadScene, camera);
  }
  return { size, render, dispose() { for (const t of [base, glow, horizontal, vertical]) t.dispose(); quad.geometry.dispose(); blur.dispose(); composite.dispose(); black.dispose(); } };
}
