import assert from 'node:assert/strict';
import { browser } from './browser.mjs';

const b = await browser();
try {
  const p = await b.page('back-models', 1200, 850);
  await p.nav(`${process.env.BASE || 'http://127.0.0.1:8787'}/?debug=1`);
  await p.wait('window.__ftw?.world');
  const result = await p.eval(`(async()=>{
    const THREE = await import('three');
    const {buildBackBling} = await import('./js/world/cosmetics.js');
    const {Avatar} = await import('./js/world/avatar.js');
    const ids=['backpack','cape','angel','devil','sword','guitar','jetpack','dragon','halo','rainbow'];
    const root=document.createElement('div');root.style.cssText='position:fixed;inset:0;z-index:99999;background:#edf3ff;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:12px;overflow:auto;font:18px sans-serif';document.body.append(root);
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(210,315);
    const output=[];
    for(const id of ids){
      const avatar=new Avatar(window.__ftw.profile.look);avatar.root.rotation.y=Math.PI;
      avatar.jetpack=id==='jetpack';avatar.setSeated(id==='jetpack');
      const back=buildBackBling(id);back.position.y=3;avatar.rig.add(back);await back.userData.ready;
      for(let i=0;i<45;i++){avatar.update(1/60,i/60);back.userData.update?.(i/60,1/60,id==='jetpack',0);}
      const scene=new THREE.Scene();scene.background=new THREE.Color('#e7ecf7');scene.add(avatar.root,new THREE.HemisphereLight('#ffffff','#8197bc',3));
      const light=new THREE.DirectionalLight('#fff4e0',3);light.position.set(5,9,5);scene.add(light);
      const camera=new THREE.PerspectiveCamera(39,210/315,.1,100);camera.position.set(6,6,11);camera.lookAt(0,2.7,0);renderer.render(scene,camera);
      const box=new THREE.Box3().setFromObject(back),sample=back.getObjectByProperty('isMesh',true);output.push({id,loaded:back.userData.modelLoaded??true,size:box.getSize(new THREE.Vector3()).toArray(),hover:avatar.body.position.y,meshCount:sample?1:0,materialColor:sample?.material?.color?.getHexString()});
      const cell=document.createElement('div');cell.style.cssText='background:white;text-align:center;border-radius:12px';const img=new Image();img.src=renderer.domElement.toDataURL('image/png');img.style.width='100%';cell.append(img,document.createTextNode(id));root.append(cell);
    }
    const flyer=new Avatar(window.__ftw.profile.look);flyer.jetpack=true;flyer.setLocomotion('walk',12);
    flyer.update(1/60,1);const firstLeg=flyer.lLeg.rotation.x;flyer.update(1/60,2);const secondLeg=flyer.lLeg.rotation.x;
    const musician=new Avatar(window.__ftw.profile.look);musician.guitar=true;musician.setLocomotion('walk',12);
    const guitar=buildBackBling('guitar');guitar.position.y=3;musician.rig.add(guitar);await guitar.userData.ready;
    for(let i=0;i<80;i++){musician.update(1/60,i/60);guitar.userData.update?.(i/60,1/60,false,12);}
    const show=new THREE.Scene();show.background=new THREE.Color('#e7ecf7');show.add(musician.root,new THREE.HemisphereLight('#ffffff','#8197bc',3));
    const front=new THREE.PerspectiveCamera(38,210/315,.1,100);front.position.set(4,6,12);front.lookAt(0,3,0);renderer.render(show,front);
    const playing={elbow:musician.guitarElbow.visible,mouth:musician.singing,notes:musician.musicNotes.visible,guitarZ:guitar.children[0].position.z,guitarTurn:guitar.children[0].rotation.y,legDelta:Math.abs(firstLeg-secondLeg)};
    const playingCell=document.createElement('div');playingCell.style.cssText='background:white;text-align:center';const playingImage=new Image();playingImage.src=renderer.domElement.toDataURL('image/png');playingImage.style.width='100%';playingCell.append(playingImage,document.createTextNode('playing guitar'));root.append(playingCell);
    const thumbnails=await Promise.all(ids.map(id=>window.__ftw.world.renderThumbnail('back',id,96)));
    renderer.dispose();return {output,playing,thumbnails:thumbnails.map(url=>url.startsWith('data:image/png;base64,'))};
  })()`);
  assert.ok(result.output.every(v=>v.loaded&&v.meshCount&&v.size.every(Number.isFinite)),JSON.stringify(result.output));
  assert.ok(result.output.find(v=>v.id==='jetpack').hover>1,JSON.stringify(result.output));
  assert.ok(result.playing.elbow && result.playing.mouth && result.playing.notes && result.playing.guitarZ > .3 && result.playing.guitarTurn < .01 && result.playing.legDelta < .001,JSON.stringify(result.playing));
  assert.ok(result.thumbnails.every(Boolean),'all back accessory thumbnails render');
  assert.deepEqual(p.errors,[]);
  console.log(await p.shot('gallery'));
  await p.eval('document.querySelector("body > div:last-child")?.scrollTo(0,1000)');
  console.log(await p.shot('playing'));
  console.log('PASS bundled back models, thumbnails and seated jetpack hover',result.output);
} finally { await b.close(); }
