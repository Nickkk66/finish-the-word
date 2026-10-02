import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let asset;
const SCALE=12/9.1142463684,ANCHOR_Y=3.5,ROPE_RADIUS=.09;
function loadCanopy() {
 return asset??=new GLTFLoader().loadAsync('/assets/word-tide/parachute.glb').then(({scene})=>{
  // Keep the existing modeled cloth. Replace its fine lines and handle with a
  // shoulder harness and thick suspension ropes that remain visible on phones.
  scene.updateWorldMatrix(true,true);const canopy=new THREE.Group(),points=[];
  scene.traverse(node=>{
   if(!node.isMesh)return;
   const g=node.geometry.clone().applyMatrix4(node.matrixWorld),p=g.attributes.position,index=g.index,triangles=[];
   for(let i=0;i<(index?.count??p.count);i+=3){
    const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
    if(Math.min(p.getY(a),p.getY(b),p.getY(c))>1)triangles.push(a,b,c);
   }
   g.setIndex(triangles);g.computeBoundingSphere();
   for(const i of new Set(triangles))points.push(new THREE.Vector3().fromBufferAttribute(p,i));
   const material=node.material.clone();material.side=THREE.DoubleSide;
   const mesh=new THREE.Mesh(g,material);mesh.castShadow=mesh.receiveShadow=true;canopy.add(mesh);
  });
  const anchors=[];
  for(const z of [-2.5,2.5])for(const x of [-4.15,-2,0,2,4.15]){
   let closest,score=Infinity;
   for(const p of points){const d=(p.x-x)**2+(p.z-z)**2+p.y*.001;if(d<score){score=d;closest=p;}}
   anchors.push(closest.clone().multiplyScalar(SCALE));
  }
  return {canopy,anchors};
 });
}
export function createTideParachute(parent) {
 const root=new THREE.Group();root.visible=false;root.name='Premade parachute';parent.add(root);
 const rig=new THREE.Group();root.add(rig);
 const geometry=new THREE.CylinderGeometry(ROPE_RADIUS,ROPE_RADIUS,1,6),material=new THREE.MeshLambertMaterial({color:'#eee9dc'}),ropes=[];
 const start=new THREE.Vector3(),end=new THREE.Vector3(),direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
 let canopy,anchors,disposed=false;
 loadCanopy().then(model=>{
  if(disposed)return;canopy=model.canopy.clone();canopy.scale.setScalar(SCALE);rig.add(canopy);anchors=model.anchors;
  for(const _ of anchors){const rope=new THREE.Mesh(geometry,material);rope.castShadow=true;rig.add(rope);ropes.push(rope);}
  root.userData.parachuteModelLoaded=true;root.userData.ropeRadius=ROPE_RADIUS;
 }).catch(error=>{if(!disposed)console.error('Could not load bundled Tide parachute',error);});
 return {root,update(pose,sway,inflate) {
  root.visible=!!canopy&&inflate>0;root.position.set(pose.x,pose.y,pose.z);root.rotation.set(0,pose.yaw,0);
  if(!canopy)return;
  // Cloth drifts over the harness; the cords keep their actual shoulder attachments.
  canopy.position.set(0,ANCHOR_Y,0);canopy.rotation.set(sway.z*.008,0,-sway.x*.008);root.userData.canopyBank=Math.max(Math.abs(canopy.rotation.x),Math.abs(canopy.rotation.z));canopy.scale.set(SCALE*inflate,SCALE*inflate,SCALE*inflate);
  for(let i=0;i<ropes.length;i++){
   start.set(anchors[i].x<0?-1.25:1.25,3.5,.1);
   end.copy(anchors[i]).multiplyScalar(inflate).applyEuler(canopy.rotation).add(canopy.position);
   const rope=ropes[i];direction.subVectors(end,start);rope.position.copy(start).add(end).multiplyScalar(.5);rope.quaternion.setFromUnitVectors(up,direction.clone().normalize());rope.scale.set(1,direction.length(),1);
  }
 },dispose(){disposed=true;root.removeFromParent();geometry.dispose();material.dispose();}};
}
