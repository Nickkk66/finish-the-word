import {createWorld} from '/js/world/world.js';
import {NOOB_LOOK} from '/js/shared/catalog.js';
import {TIDE} from '/js/shared/word-tide.js';
const world=await createWorld({container:document.querySelector('#game'),labelLayer:document.querySelector('#labels')});
window.world=world;
for(const [i,id]of ['me','peer'].entries())world.addPlayer({id,name:id,isBot:false,isHost:i===0,connected:true,look:NOOB_LOOK,back:'cape',chair:i?'throne':'wooden',pet:null,seat:-1,wins:0,pos:{x:i*5,y:0,z:20,ry:0}});
world.setLocalPlayer('me');world.setMenuMode(false);world.start();
let sequence=0;
window.preview=(seconds=0,rescue=false,final=false)=>{
 const duration=final?TIDE.outro:21000;
 const m={previewSeconds:seconds,matchId:'preview'+(++sequence),phase:final?'ended':'tideFlood',phaseDuration:duration,phaseEndsIn:duration-seconds*1000,round:1,mode:'word_tide',participants:['me','peer'].map(id=>({id,alive:rescue||final,hearts:rescue?4:final?5:0,maxHearts:5})),tide:{seed:7,water:4,fromWater:0,rise:4,holdMs:rescue||final?0:18000,endingHoldMs:0,winners:final?['me']:[],towers:Object.fromEntries(['me','peer'].map((id,seat)=>[id,{id,seat,height:rescue?6:2,before:2,segments:[],earned:0,added:0,rescued:rescue,answer:'',...(!rescue&&!final?{wreck:{id:'wreck'+sequence,height:2,water:0,rescue:false,ageMs:seconds*1000}}:{})}]))}};
 world.setMatch(m);world.setTide(m);
};
document.querySelector('#play').onclick=()=>window.preview();document.querySelector('#rescue').onclick=()=>window.preview(0,true);document.querySelector('#end').onclick=()=>window.preview(0,false,true);
window.preview();
