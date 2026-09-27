// Bake the real island and ocean into window media. No runtime exterior cameras are needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { browser } from './browser.mjs';
const b=await browser();
try {
  const p=await b.page('capture-lighthouse');
  await p.nav(`${process.env.BASE||'http://127.0.0.1:8787'}/?debug=1`);
  await p.wait('window.__ftw?.world');
  const media=await p.eval(`(async()=>{
    const THREE=await import('three');
    const {createTerrain}=await import('./js/world/terrain.js');
    const {createProps}=await import('./js/world/props.js');
    const {createTable}=await import('./js/world/table.js');
    const {createLobby}=await import('./js/world/lobby.js');
    const scene=new THREE.Scene(),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(768,832);renderer.shadowMap.enabled=true;
    const terrain=createTerrain(scene);createProps(scene);createTable(scene);createLobby(scene);
    const camera=new THREE.PerspectiveCamera(68,768/832,.2,900);
    camera.position.set(-30,24,-28);camera.lookAt(2,0,6);
    terrain.setSkyFocus(camera.position);terrain.setShadowFocus(new THREE.Vector3(),78);terrain.update(12);
    renderer.render(scene,camera);
    const island=renderer.domElement.toDataURL('image/png').split(',')[1];
    renderer.setSize(512,560);camera.aspect=512/560;camera.fov=58;camera.updateProjectionMatrix();
    camera.position.set(-43,17,-42);camera.lookAt(-57,-1,-56);terrain.setSkyFocus(camera.position);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=560;
    const ctx=canvas.getContext('2d');
    terrain.update(0);renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,0);
    const water=canvas.toDataURL('image/png').split(',')[1];
    // Ease time forward and back over a full cosine cycle: endpoint position AND velocity match.
    const stream=canvas.captureStream(24),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1800000});
    const done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
    const start=performance.now(),duration=8000;
    await new Promise(resolve=>{function frame(now){const u=Math.min(1,(now-start)/duration);terrain.update(2*(1-Math.cos(u*Math.PI*2)));renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,0);if(u<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
    recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
    const video=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
    renderer.dispose();return {island,water,video};
  })()`);
  mkdirSync('public/assets/lighthouse',{recursive:true});
  for(const [key,file] of [['island','island.png'],['water','water-poster.png'],['video','water-loop.webm']]) {
    const data=Buffer.from(media[key],'base64');writeFileSync(`public/assets/lighthouse/${file}`,data);console.log(`${file}: ${data.length} bytes`);
  }
  if(p.errors.length)throw Error(p.errors.join('\n'));
}finally{await b.close();}
