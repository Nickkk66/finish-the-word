import {h} from './dom.js';
import {TIDE} from '../shared/word-tide.js';
import {WRECK} from '../shared/tide-wreck.js';

// Local presentation only: no room messages, stakes, rewards, or saved profile edits.
export function createAnimationTester({state,preview}) {
 let enabled=false,playing=false,start=0,elapsed=0,frame=0,serial=0;
 const mode=h('select',{'aria-label':'Animation to test',class:'field'},
  h('option',{value:'intro'},'Tsunami · launch / parachutes'),h('option',{value:'shark'},'Chair break · shark / piranhas'),h('option',{value:'outro'},'Tide goes away'));
 const seek=h('input',{type:'range',min:0,max:24,step:.1,value:0,'aria-label':'Animation time'});
 const clock=h('span',{}),play=h('button',{type:'button',class:'btn small green',onClick:()=>run()},'Play / Restart');
 const el=h('div',{class:'animation-tester',hidden:true},h('strong',{},'Animation tester · local preview'),mode,seek,clock,
  h('div',{class:'host-tools'},play,h('button',{type:'button',class:'btn small grey',onClick:stop},'Restore game')));
 function length(){return mode.value==='intro'?TIDE.intro/1000:mode.value==='outro'?TIDE.outro/1000:WRECK.swarmEnd;}
 function show(seconds){
  if(!state.isAdmin)return stop();elapsed=seconds;seek.value=String(seconds);clock.textContent=seconds.toFixed(1)+'s';
  const people=[...state.players.values()].filter(p=>p.id===state.you||mode.value==='intro');
  const phase=mode.value==='intro'?'tideIntro':mode.value==='outro'?'ended':'tideFlood',duration=length()*1000;
  preview({previewSeconds:seconds,matchId:'animation-preview-'+serial,mode:'word_tide',phase,phaseDuration:duration,phaseEndsIn:duration-seconds*1000,round:1,practice:true,participants:people.map(p=>({id:p.id,alive:mode.value!=='shark',hearts:mode.value==='shark'?0:5,maxHearts:5})),tide:{seed:7,water:mode.value==='intro'?0:4,fromWater:0,holdMs:mode.value==='shark'?18000:0,endingHoldMs:0,winners:mode.value==='outro'?[state.you]:[],rise:4,category:{prompt:''},towers:Object.fromEntries(people.map((p,seat)=>[p.id,{id:p.id,seat,height:mode.value==='outro'?9:2,before:2,segments:[],earned:0,added:0,rescued:false,...(mode.value==='shark'?{wreck:{id:'preview-loss-'+serial,ageMs:seconds*1000,height:2,water:0,rescue:false}}:{})}]))}});
 }
 function tick(now){frame=0;if(!playing)return;const t=Math.min(length(),(now-start)/1000);show(t);if(t<length())frame=requestAnimationFrame(tick);else playing=false;}
 function run(){cancelAnimationFrame(frame);serial++;playing=true;start=performance.now();show(0);frame=requestAnimationFrame(tick);}
 function stop(){playing=false;cancelAnimationFrame(frame);frame=0;preview(null);}
 seek.addEventListener('input',()=>{playing=false;cancelAnimationFrame(frame);show(Number(seek.value));});
 mode.addEventListener('change',()=>{seek.max=String(length());run();});
 return {el,toggle(on){enabled=!!on;el.hidden=!enabled||!state.isAdmin;if(!enabled)stop();},update(){el.hidden=!enabled||!state.isAdmin;if(!state.isAdmin&&enabled){enabled=false;stop();}},stop};
}
