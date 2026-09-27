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
function flameMap(){
  if(flameTexture)return flameTexture;
  const c=document.createElement('canvas');c.width=128;c.height=256;const x=c.getContext('2d');
  const g=x.createRadialGradient(64,192,3,64,157,100);g.addColorStop(0,'#ffffd5');g.addColorStop(.2,'#ffe985');g.addColorStop(.45,'#ffb329');g.addColorStop(.7,'#f04b13bb');g.addColorStop(1,'#e31e0000');
  x.fillStyle=g;x.beginPath();x.moveTo(64,6);x.bezierCurveTo(90,66,38,66,103,149);x.bezierCurveTo(148,246,37,284,22,210);x.bezierCurveTo(2,139,60,94,64,6);x.fill();
  flameTexture=new THREE.CanvasTexture(c);flameTexture.colorSpace=THREE.SRGBColorSpace;return flameTexture;
}
export function createFire(radius=1,height=3,count=10){
  const group=new THREE.Group();
  // Billboard flames in one instanced draw instead of a draw for every sprite.
  const material=new THREE.ShaderMaterial({uniforms:{map:{value:flameMap()},time:{value:0},height:{value:height}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform float time;uniform float height;varying vec2 vUv;varying float fade;void main(){vUv=uv;float phase=instanceMatrix[3].x*3.+instanceMatrix[3].z*7.;float wave=.85+.15*sin(time*6.+phase);vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);vec2 scale=vec2(length(modelViewMatrix[0].xyz),length(modelViewMatrix[1].xyz));center.xy+=position.xy*vec2(height*.65*wave,height*(.85+.15*sin(time*5.+phase)))*scale;fade=.7+.15*sin(time*8.+phase);gl_Position=projectionMatrix*center;}`,
    fragmentShader:`uniform sampler2D map;varying vec2 vUv;varying float fade;void main(){vec4 c=texture2D(map,vUv);gl_FragColor=vec4(c.rgb,c.a*fade);}`});
  const flames=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,count),matrix=new THREE.Matrix4();
  for(let i=0;i<count;i++){const a=i*2.4,r=radius*Math.sqrt((i+.5)/count);matrix.makeTranslation(Math.cos(a)*r,height*.35,Math.sin(a)*r);flames.setMatrixAt(i,matrix);}flames.frustumCulled=false;group.add(flames);
  const sparks=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:'#ffc978',size:.09,transparent:true,depthWrite:false}));
  const positions=new Float32Array(24*3);sparks.geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));group.add(sparks);
  group.userData.update=(t)=>{material.uniforms.time.value=t;for(let i=0;i<24;i++){const age=(t*.45+i/24)%1,a=i*2.4;positions[i*3]=Math.cos(a+age)*radius*(1-age*.4);positions[i*3+1]=age*height*1.7;positions[i*3+2]=Math.sin(a+age)*radius;}sparks.geometry.attributes.position.needsUpdate=true;};
  return group;
}

// A persistent wake in world space: one additive draw, independent of the rock's rotation.
export function createMeteorTrail(scene, length = 19) {
  const count = 30, positions = new Float32Array(count * 3), sizes = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('age', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float age; varying float fade; void main(){fade=1.-age;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=min(100.,(160.+160.*fade)/max(1.,-p.z));gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying float fade; void main(){float r=length(gl_PointCoord-.5)*2.;float a=pow(max(0.,1.-r),1.5)*fade*.85;gl_FragColor=vec4(1.,.25+.65*fade,.06+.3*fade,a);}` });
  const mesh = new THREE.Points(geometry, material); mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
  return { mesh, update(head, direction, progress, t) {
    mesh.visible = progress > 0 && progress < 1;
    const extent = Math.min(length, progress * 85);
    for (let i=0;i<count;i++) {
      const age=i/(count-1), distance=age*extent;
      positions[i*3]=head.x+direction.x*distance+Math.sin(i*3+t*4)*age*.45;
      positions[i*3+1]=head.y+direction.y*distance;
      positions[i*3+2]=head.z+direction.z*distance+Math.cos(i*2+t*3)*age*.45;
      sizes[i]=age;
    }
    geometry.attributes.position.needsUpdate=true; geometry.attributes.age.needsUpdate=true;
  }};
}
