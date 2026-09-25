import { browser } from './browser.mjs';
const session = await browser();
try {
  const page = await session.page('cosmetics-v2', 1200, 1700);
  await page.nav(`${process.env.BASE || 'http://127.0.0.1:8787'}/?debug=1`);
  await page.wait(`!!document.querySelector('script[type="importmap"]')`);
  const report = await page.eval(`(async()=>{
    const THREE=await import('three');
    const models=await import('./js/world/cosmetics-v2.js');
    const {TABLES,BACK_BLING,CARD_BOXES}=await import('./js/shared/catalog.js');
    const root=document.createElement('div');root.style.cssText='position:fixed;inset:0;background:#eaf0f7;z-index:99999;overflow:auto;color:#253449;font:15px sans-serif;padding:24px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;align-content:start';document.body.append(root);
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(260,220);renderer.outputColorSpace=THREE.SRGBColorSpace;
    const entries=[...TABLES.map(v=>['Table',v.name,models.buildTable(v.id)]),...BACK_BLING.filter(v=>v.id!=='none').map(v=>['Back',v.name,models.buildBackBling(v.id)]),...CARD_BOXES.map(v=>['Box',v.name,models.buildCardBox(v.id)]),['Portal','Obby portal',models.buildPortal()]];
    const results=[];
    for(const[kind,name,model]of entries){
      if(kind==='Back')model.rotation.y=Math.PI;
      model.userData.update?.(1,.016,false);
      const scene=new THREE.Scene();scene.background=new THREE.Color('#eaf0f7');scene.add(model,new THREE.HemisphereLight('#ffffff','#8999ac',2.3));
      const sun=new THREE.DirectionalLight('#ffffff',3);sun.position.set(4,8,6);scene.add(sun);
      const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
      const radius=size.length()*.5, cam=new THREE.PerspectiveCamera(34,260/220,.1,150);
      const direction=kind==='Table'?new THREE.Vector3(1,1.1,1.3):new THREE.Vector3(.65,.35,1.6);direction.normalize();cam.position.copy(center).addScaledVector(direction,radius/Math.sin(17*Math.PI/180)*1.05);cam.lookAt(center);
      renderer.render(scene,cam);
      const card=document.createElement('div');card.style.cssText='text-align:center;background:white;border:1px solid #d5dfeb;border-radius:12px;overflow:hidden;padding-bottom:12px';
      const img=new Image();img.src=renderer.domElement.toDataURL();img.style.width='100%';card.append(img,document.createTextNode(kind+' · '+name));root.append(card);
      let count=0;model.traverse(o=>{if(o.isMesh)count++;});results.push({kind,name,meshes:count});
    }
    renderer.dispose();return results;
  })()`);
  console.log(JSON.stringify(report));
  console.log(await page.shot('gallery'));
  if (page.errors.length) console.log('Browser errors during in-progress build:', page.errors);
} finally { await session.close(); }
