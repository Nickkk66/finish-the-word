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
  const group=new THREE.Group(),sprites=[];
  for(let i=0;i<count;i++){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:flameMap(),color:i%3===0?'#ffe6a6':'#ffffff',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));const a=i*2.4,r=radius*Math.sqrt((i+.5)/count);sprite.position.set(Math.cos(a)*r,height*.35,Math.sin(a)*r);group.add(sprite);sprites.push(sprite);}
  const sparks=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:'#ffc978',size:.09,transparent:true,depthWrite:false}));
  const positions=new Float32Array(24*3);sparks.geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));group.add(sparks);
  group.userData.update=(t)=>{sprites.forEach((s,i)=>{const wave=.8+.2*Math.sin(t*7+i*2);s.scale.set(height*.65*wave,height*(.8+.2*Math.sin(t*5+i)),1);s.material.opacity=.68+.18*Math.sin(t*9+i);});for(let i=0;i<24;i++){const age=(t*.45+i/24)%1,a=i*2.4;positions[i*3]=Math.cos(a+age)*radius*(1-age*.4);positions[i*3+1]=age*height*1.7;positions[i*3+2]=Math.sin(a+age)*radius;}sparks.geometry.attributes.position.needsUpdate=true;};
  return group;
}
