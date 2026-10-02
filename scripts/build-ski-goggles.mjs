import {browser} from './browser.mjs';
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
mkdirSync('public/vendor/three/addons/exporters',{recursive:true});
writeFileSync('public/vendor/three/addons/exporters/GLTFExporter.js',readFileSync('node_modules/three/examples/jsm/exporters/GLTFExporter.js'));
const b=await browser();try{
 const p=await b.page('goggle-builder');await p.nav('http://127.0.0.1:8788/?debug=1');await p.wait('window.__ftw?.world');
 const assets=await p.eval(`(async()=>{
 const THREE=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
 const source=(await new GLTFLoader().loadAsync('/assets/back-models/ski_goggles_source.glb')).scene;
 const frame=new THREE.MeshStandardMaterial({color:'#101113',roughness:.44,metalness:.14});
 const glass=new THREE.MeshPhysicalMaterial({color:'#182027',metalness:.64,roughness:.09,clearcoat:1,clearcoatRoughness:.04});
 const foam=new THREE.MeshStandardMaterial({color:'#222325',roughness:1}),rubber=new THREE.MeshStandardMaterial({color:'#111214',roughness:.94});
 function curve(shape,radius=.13,height=.18,nose=.085){
  shape.moveTo(-.60,.06);shape.quadraticCurveTo(-.61,height,-.43,height);
  shape.quadraticCurveTo(0,height+.06,.43,height);shape.quadraticCurveTo(.61,height,.60,.06);
  shape.quadraticCurveTo(.60,-radius,.41,-radius);shape.lineTo(.16,-radius);
  shape.quadraticCurveTo(.095,-radius,.07,-nose);shape.quadraticCurveTo(0,-nose+.035,-.07,-nose);
  shape.quadraticCurveTo(-.095,-radius,-.16,-radius);shape.lineTo(-.41,-radius);shape.quadraticCurveTo(-.60,-radius,-.60,.06);shape.closePath();
 }
 function contour(style){const s=new THREE.Shape();curve(s,style===1?.14:.12,style===2?.14:.17,style===1?.055:.065);return s}
 function curved(mesh,z){const pos=mesh.geometry.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i);pos.setZ(i,pos.getZ(i)+z-.235*(x/.62)**2)}mesh.geometry.computeVertexNormals();return mesh}
 function surface(g,shape,material,z,scale=1){let geo=new THREE.ShapeGeometry(shape,28);geo.scale(scale,scale,1);const flat=geo.toNonIndexed(),verts=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=16;for(let t=0;t<flat.attributes.position.count;t+=3){a.fromBufferAttribute(flat.attributes.position,t);b.fromBufferAttribute(flat.attributes.position,t+1);c.fromBufferAttribute(flat.attributes.position,t+2);const point=(i,j)=>a.clone().addScaledVector(b.clone().sub(a),i/n).addScaledVector(c.clone().sub(a),j/n);const tri=(p,q,r)=>verts.push(...p.toArray(),...q.toArray(),...r.toArray());for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){tri(point(i,j),point(i+1,j),point(i,j+1));if(i+j<n-1)tri(point(i+1,j),point(i+1,j+1),point(i,j+1))}}geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));const mesh=curved(new THREE.Mesh(geo,material),z);g.add(mesh);return mesh}
 function rim(g,shape,material,z,inset,depth){const ring=shape.clone(),hole=new THREE.Path();hole.setFromPoints(shape.getPoints(80).map(p=>p.multiplyScalar(inset)).reverse());ring.holes=[hole];const geo=new THREE.ExtrudeGeometry(ring,{depth,bevelEnabled:true,bevelSize:.006,bevelThickness:.004,bevelSegments:2,curveSegments:28});const mesh=curved(new THREE.Mesh(geo,material),z);g.add(mesh)}
 function strap(g){const band=source.getObjectByName('ski-goggles_2').clone(true);band.geometry=band.geometry.clone();band.material=rubber.clone();band.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(band),size=box.getSize(new THREE.Vector3());band.scale.multiplyScalar(1.34/size.x);band.updateMatrixWorld(true);const mid=new THREE.Box3().setFromObject(band).getCenter(new THREE.Vector3());band.position.sub(mid);band.scale.y*=.72;band.position.y=-.01;band.position.z=-.02;g.add(band);for(const sign of [-1,1]){const anchor=new THREE.Mesh(new THREE.BoxGeometry(.035,.105,.32),frame);anchor.position.set(sign*.64,0,.36);anchor.rotation.y=sign*-.42;g.add(anchor)}}
 // A curved sheet lens and hollow thin rim hug the face, rather than a solid visor box.
 const output=[];for(const [style,id]of ['secret_goggles_shield','secret_goggles_split','secret_goggles_racer'].entries()){
  const g=new THREE.Group();g.name=id;strap(g);const shape=contour(style);
  rim(g,shape,foam,.610,.80,.011);
  if(style!==2)rim(g,shape,frame,.634,style===0?.935:.91,.012);
  surface(g,shape,glass,.655,style===2?.995:.933);
  if(style===2){const lip=new THREE.Mesh(new THREE.BoxGeometry(.50,.014,.012),frame);lip.position.set(0,.179,.639);g.add(lip)}
  g.userData={license:'CC0 1.0',source:'https://3dassets.dev/assets/ski-resort-and-snow-park-ski-goggles-54d4a696',modifications:'Thin curved ski lens, nose cutout, hollow frame, reduced depth and fitted black strap'};
  const glb=await new GLTFExporter().parseAsync(g,{binary:true});output.push({id,bytes:Array.from(new Uint8Array(glb))});
 }return output})()`);
 for(const {id,bytes}of assets)writeFileSync(`public/assets/back-models/${id}.glb`,Buffer.from(bytes));console.log('Built three curved, shallow ski-goggle GLBs.');
}finally{await b.close()}
