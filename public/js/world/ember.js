import * as THREE from 'three';

const cache = new Map();
export function surfaceTexture(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  let seed=971;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  x.fillStyle=kind==='gold'?'#b08a43':kind==='felt'?'#1c573f':'#302b32';x.fillRect(0,0,256,256);
  for(let i=0;i<6500;i++){const v=Math.floor(random()*80);x.fillStyle=`rgba(${v+100},${v+90},${v+70},${kind==='felt'?.09:.16})`;x.fillRect(random()*256,random()*256,1+random()*3,kind==='gold'?1:2+random()*4);}
  if(kind==='rock')for(let i=0;i<55;i++){const px=random()*256,py=random()*256,r=3+random()*16;x.fillStyle='#15151b';x.beginPath();x.ellipse(px,py,r,r*.6,random()*6,0,Math.PI*2);x.fill();x.strokeStyle='#715345';x.lineWidth=1;x.stroke();}
  if(kind==='gold'){x.strokeStyle='#ebcc77';x.lineWidth=2;for(let y=24;y<256;y+=64){x.beginPath();for(let px=0;px<=256;px+=4){const py=y+Math.sin(px*Math.PI/16)*8;px?x.lineTo(px,py):x.moveTo(px,py);}x.stroke();x.fillStyle='#654b2a';x.fillRect(0,y+18,256,2);}}
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;cache.set(kind,texture);return texture;
}
let flameTexture;
function flameMap(poisoned=false){
  if(poisoned) return poisonFlameMap();
  if(flameTexture)return flameTexture;
  const c=document.createElement('canvas');c.width=128;c.height=256;const x=c.getContext('2d');
  const g=x.createRadialGradient(64,192,3,64,157,100);g.addColorStop(0,'#ffffd5');g.addColorStop(.2,'#ffe985');g.addColorStop(.45,'#ffb329');g.addColorStop(.7,'#f04b13bb');g.addColorStop(1,'#e31e0000');
  x.fillStyle=g;x.beginPath();x.moveTo(64,6);x.bezierCurveTo(90,66,38,66,103,149);x.bezierCurveTo(148,246,37,284,22,210);x.bezierCurveTo(2,139,60,94,64,6);x.fill();
  flameTexture=new THREE.CanvasTexture(c);flameTexture.colorSpace=THREE.SRGBColorSpace;return flameTexture;
}
let purpleFlameTexture;
function poisonFlameMap(){
  if(purpleFlameTexture)return purpleFlameTexture;
  const c=document.createElement('canvas');c.width=128;c.height=256;const x=c.getContext('2d');
  const g=x.createRadialGradient(64,192,3,64,157,100);
  g.addColorStop(0,'#fff0ff');g.addColorStop(.2,'#d994ff');g.addColorStop(.45,'#9143ec');g.addColorStop(.7,'#5713a4bb');g.addColorStop(1,'#2d075800');
  x.fillStyle=g;x.beginPath();x.moveTo(64,6);x.bezierCurveTo(90,66,38,66,103,149);x.bezierCurveTo(148,246,37,284,22,210);x.bezierCurveTo(2,139,60,94,64,6);x.fill();
  purpleFlameTexture=new THREE.CanvasTexture(c);purpleFlameTexture.colorSpace=THREE.SRGBColorSpace;return purpleFlameTexture;
}
export function createFire(radius=1,height=3,count=10,poisoned=false){
  const group=new THREE.Group();
  // Billboard flames in one instanced draw instead of a draw for every sprite.
  const material=new THREE.ShaderMaterial({uniforms:{map:{value:flameMap(poisoned)},time:{value:0},height:{value:height}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform float time;uniform float height;varying vec2 vUv;varying float fade;void main(){vUv=uv;float phase=instanceMatrix[3].x*3.+instanceMatrix[3].z*7.;float wave=.85+.15*sin(time*6.+phase);vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);vec2 scale=vec2(length(modelViewMatrix[0].xyz),length(modelViewMatrix[1].xyz));center.xy+=position.xy*vec2(height*.65*wave,height*(.85+.15*sin(time*5.+phase)))*scale;fade=.7+.15*sin(time*8.+phase);gl_Position=projectionMatrix*center;}`,
    fragmentShader:`uniform sampler2D map;varying vec2 vUv;varying float fade;void main(){vec4 c=texture2D(map,vUv);gl_FragColor=vec4(c.rgb,c.a*fade);}`});
  const flames=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,count),matrix=new THREE.Matrix4();
  for(let i=0;i<count;i++){const a=i*2.4,r=radius*Math.sqrt((i+.5)/count);matrix.makeTranslation(Math.cos(a)*r,height*.35,Math.sin(a)*r);flames.setMatrixAt(i,matrix);}flames.frustumCulled=false;group.add(flames);
  const sparks=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:poisoned?'#c274ff':'#ffc978',size:.09,transparent:true,depthWrite:false}));
  const positions=new Float32Array(24*3);sparks.geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));group.add(sparks);
  group.userData.update=(t)=>{material.uniforms.time.value=t;for(let i=0;i<24;i++){const age=(t*.45+i/24)%1,a=i*2.4;positions[i*3]=Math.cos(a+age)*radius*(1-age*.4);positions[i*3+1]=age*height*1.7;positions[i*3+2]=Math.sin(a+age)*radius;}sparks.geometry.attributes.position.needsUpdate=true;};
  return group;
}

// Overlapping world-sized billboards form a continuous wake, independent of rock rotation.
// Unlike GL points, their width does not collapse to a few pixels at island camera distances.
export function createMeteorTrail(scene, length = 22, poisoned = false) {
  const count=48, geometry=new THREE.PlaneGeometry(1,1);
  geometry.setAttribute('age',new THREE.InstancedBufferAttribute(Float32Array.from({length:count},(_,i)=>i/(count-1)),1));
  const material=new THREE.ShaderMaterial({uniforms:{poisoned:{value:poisoned?1:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute float age;varying vec2 vUv;varying float fade;
      void main(){vUv=uv;fade=1.-age;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
      center.xy+=position.xy*(.7+3.7*pow(fade,.65));gl_Position=projectionMatrix*center;}`,
    fragmentShader:`uniform float poisoned;varying vec2 vUv;varying float fade;void main(){float r=length(vUv-.5)*2.;
      float alpha=pow(max(0.,1.-r),2.)*smoothstep(0.,.22,fade)*.65;
      vec3 fire=vec3(1.,.18+.68*fade,.025+.35*pow(fade,3.));
      vec3 poison=vec3(.62+.35*fade,.11+.25*fade,1.);
      gl_FragColor=vec4(mix(fire,poison,poisoned),alpha);}`});
  const mesh=new THREE.InstancedMesh(geometry,material,count),matrix=new THREE.Matrix4();
  // Water is transparent and does not write depth. Draw the airborne wake after it,
  // while retaining normal depth testing against solid scenery and the meteor itself.
  mesh.renderOrder=3;mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
  return {mesh,update(head,direction,progress,t){
    mesh.visible=progress>0&&progress<1;
    const extent=Math.min(length,progress*85);
    for(let i=0;i<count;i++){
      const age=i/(count-1),distance=age*extent;
      matrix.makeTranslation(head.x+direction.x*distance+Math.sin(i*.7+t*8)*age*.22,
        head.y+direction.y*distance,head.z+direction.z*distance+Math.cos(i*.6+t*6)*age*.22);
      mesh.setMatrixAt(i,matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }};
}
