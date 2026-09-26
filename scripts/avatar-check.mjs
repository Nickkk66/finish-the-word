import assert from 'node:assert/strict';
import { browser } from './browser.mjs';
const b=await browser();
try {
 const p=await b.page('avatar',1200,900);
 await p.nav(`${process.env.BASE||'http://127.0.0.1:8787'}/?debug`);await p.wait('window.__ftw?.world');
 await p.eval(`(async()=>{
 const THREE=await import('three'), {Avatar}=await import('./js/world/avatar.js'), {buildBackBling}=await import('./js/world/cosmetics.js');
 const root=document.createElement('div');root.style.cssText='position:fixed;inset:0;z-index:99999;background:#eaf0f7;display:grid;grid-template-columns:repeat(4,1fr);align-content:start;gap:12px;padding:20px;font:18px sans-serif;color:#253449';document.body.append(root);
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(270,340);
 const entries=[[1,'Swept hair',false,0],[2,'Spiky hair',false,0],[3,'Long hair',false,0],[2,'Standing cape',true,0],[2,'Walking cape',true,16],[3,'Blue cape',true,0],[2,'Rainbow cape',true,16]];
 for(const [style,name,cape,speed] of entries){const avatar=new Avatar({...window.__ftw.profile.look,hairStyle:style});
 let back;if(cape){back=buildBackBling('cape',name==='Blue cape'?'#368bec':name==='Rainbow cape'?'rainbow':'#d84752');back.position.y=3;avatar.rig.add(back);avatar.setLocomotion(speed?'walk':'idle',speed);}
 for(let i=0;i<120;i++){avatar.update(1/60,i/60);back?.userData.update(i/60,1/60,false,speed);}
 const scene=new THREE.Scene();scene.background=new THREE.Color('#eaf0f7');scene.add(avatar.root,new THREE.HemisphereLight('#ffffff','#8fa0b0',2));const light=new THREE.DirectionalLight('#fff4e0',3);light.position.set(5,9,5);scene.add(light);
 const camera=new THREE.PerspectiveCamera(34,270/340,.1,100);camera.position.set(cape?9:5,6,cape?-12:12);camera.lookAt(0,2.7,0);renderer.render(scene,camera);
 const cell=document.createElement('div'),img=new Image();img.src=renderer.domElement.toDataURL();cell.style.cssText='text-align:center;background:white;border-radius:12px;padding-bottom:12px';img.style.width='100%';cell.append(img,document.createTextNode(name));root.append(cell);
 }renderer.dispose();})()`);
 console.log(await p.shot('gallery'));assert.deepEqual(p.errors,[]);
}finally{await b.close();}
