import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createSharkPath,wreckBodyPose} from '../public/js/shared/tide-shark-path.js';
import {tidePosition} from '../public/js/shared/word-tide.js';

test('the whole bundled shark clears platform supports throughout its attack and dive',async()=>{
 // Load actual vertices, skipping texture decoding in this geometry-only check.
 const loader=new GLTFLoader().register(()=>({name:'GeometryOnly',loadMaterial:()=>Promise.resolve(new THREE.MeshBasicMaterial())}));
 const file=await readFile(new URL('../public/assets/word-tide/shark.glb',import.meta.url));
 const {scene}=await loader.parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
 const bounds=new THREE.Box3().setFromObject(scene),scale=11/bounds.getSize(new THREE.Vector3()).z;
 const points=[];scene.updateMatrixWorld(true);
 scene.traverse(mesh=>{if(mesh.isMesh){
  const positions=mesh.geometry.attributes.position;
  for(let i=0;i<positions.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).sub(new THREE.Vector3(0,-.2,2.1)).multiplyScalar(scale));
 }});
 const quaternion=new THREE.Quaternion(),point=new THREE.Vector3(),mouth=new THREE.Vector3();
 for(const count of [2,8,40]){
  const stands=Array.from({length:count},(_,i)=>tidePosition(i,count));
  for(const seat of [0,Math.floor(count/2)]){
   const pos=stands[seat],body=wreckBodyPose(14,pos,7.4,3),path=createSharkPath(body.head,3,pos.yaw);
   for(let seconds=2.3;seconds<18;seconds+=.025){
    const sample=path.sample(seconds),v=sample.velocity;
    mouth.fromArray(sample.position);quaternion.setFromEuler(new THREE.Euler(-Math.atan2(v[1],Math.hypot(v[0],v[2])),Math.atan2(v[0],v[2]),0,'YXZ'));
    for(const p of points){
     point.copy(p).applyQuaternion(quaternion).add(mouth);
     if(point.y<2.8||point.y>7.65)continue;
     for(const stand of stands)assert.ok(Math.hypot(point.x-stand.x,point.z-stand.z)>3.6,`shark intersects a stand: ${count} players, seat ${seat}, time ${seconds}`);
    }
   }
  }
 }
});
