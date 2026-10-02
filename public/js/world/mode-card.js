import * as THREE from 'three';
import {DECK} from './layout.js';
import {LAYOUT} from '../shared/constants.js';
export function createModeCard(scene){
 const group=new THREE.Group();group.name='Special mode rules card';group.visible=false;group.position.set(0,DECK.top+LAYOUT.tableHeight+.065,0);group.rotation.y=-.18;scene.add(group);
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=1024;const ink=canvas.getContext('2d');
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const paper=new THREE.Mesh(new THREE.BoxGeometry(2.1,.06,2.85),new THREE.MeshStandardMaterial({color:'#e4d8c2',roughness:.85}));paper.castShadow=true;paper.receiveShadow=true;group.add(paper);
 const face=new THREE.Mesh(new THREE.PlaneGeometry(2.08,2.83),new THREE.MeshStandardMaterial({map:texture,roughness:.85}));face.rotation.x=-Math.PI/2;face.position.y=.032;group.add(face);let mode=null;
 function set(next){group.visible=next==='roulette_deadly';if(!group.visible||mode===next)return;mode=next;
 ink.fillStyle='#f4e9d6';ink.fillRect(0,0,768,1024);ink.strokeStyle='#302135';ink.lineWidth=14;ink.strokeRect(35,35,698,954);ink.lineWidth=3;ink.strokeRect(55,55,658,914);
 ink.fillStyle='#67294d';ink.fillRect(65,65,638,275);ink.fillStyle='#fff5db';ink.textAlign='center';ink.font='900 66px sans-serif';ink.fillText('DEATH',384,165);ink.fillText('WISH',384,245);
 ink.fillStyle='#302135';ink.font='bold 45px sans-serif';ink.fillText('THE CURSED CUP',384,435);
 const lines=['Poison starts at 50%.','Drink, pass, or Double Sip.','Last player awake wins.','','10% minimum house edge','All bonuses share the cap.'];ink.font='38px sans-serif';lines.forEach((line,i)=>ink.fillText(line,384,525+i*61));ink.font='bold 26px sans-serif';ink.fillText('FINISH THE WORD!',384,937);texture.needsUpdate=true;
 }
 return{set,debug:()=>({visible:group.visible,mode,y:group.position.y})};
}
