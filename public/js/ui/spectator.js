import {h} from './dom.js';

// Table games share the same player switching controls; Word Tide has its own HUD.
export function createSpectator({onView}) {
 let state, target=null, view='follow', matchId=null, watching=false;
 const name=h('strong',{},'Watching');
 const previous=h('button',{type:'button',class:'btn small blue','aria-label':'Watch previous player',onClick:()=>cycle(-1)},'←');
 const next=h('button',{type:'button',class:'btn small blue','aria-label':'Watch next player',onClick:()=>cycle(1)},'→');
 const perspective=h('button',{type:'button',class:'btn small yellow',onClick:()=>{view=view==='follow'?'overhead':'follow';render();}},'View: Follow');
 const toggle=h('button',{type:'button',class:'btn small blue',onClick:()=>{watching=!watching;render();}},'Watch players');
 const row=h('div',{class:'tide-watch-target'},previous,name,next);
 const el=h('div',{class:'game-spectator',hidden:true},row,perspective,toggle);
 const survivors=()=>state.match.participants.filter(p=>p.alive&&state.players.get(p.id)?.connected!==false);
 function cycle(direction){const list=survivors();if(!list.length)return;const index=list.findIndex(p=>p.id===target);target=list[(Math.max(0,index)+direction+list.length)%list.length].id;render();}
 function render(){
  row.hidden=perspective.hidden=!watching;toggle.textContent=watching?'Exit spectator view':'Watch players';
  if(!watching){onView(null,'follow');return;}
  const list=survivors();if(!list.some(p=>p.id===target))target=list[0]?.id||null;
  name.textContent=target?`Watching ${state.players.get(target)?.name||'Player'}`:'No survivors';
  previous.disabled=next.disabled=list.length<2;perspective.disabled=!target;
  perspective.textContent=view==='follow'?'View: Follow':'View: Overhead';onView(target,view);
 }
 return {el,update(st){
  state=st;const m=st.match,own=m?.participants.find(p=>p.id===st.you);
  el.hidden=!st.inRoom||st.zone!=='island'||!m?.participants.length||m.tide||['lobby','countdown','ended'].includes(m.phase)||!!own?.alive;
  if(el.hidden){onView(null,'follow');return;}
  if(matchId!==m.matchId){matchId=m.matchId;target=null;view='follow';watching=!!own;}
  render();
 }};
}
