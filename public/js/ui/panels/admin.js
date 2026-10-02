import {h} from '../dom.js';
import {icons} from '../icons.js';
import {confirmDialog} from '../overlays.js';
import {createAdminProfileEditor} from '../admin-profile.js';
import {createAdminTrades} from '../admin-trades.js';
const button=(label,onClick,tone='blue')=>h('button',{type:'button',class:`btn small ${tone}`,onClick},label);
const row=(label,control)=>h('label',{class:'set-row'},h('span',{class:'set-label'},label),control);
export function adminPanel({state,actions}){
 return {id:'admin',title:'Admin Tools',color:'purple',icon:icons.gear,mount(body){
  if(!state.isAdmin){body.append(h('p',{},'Unlock admin tools to continue.'));return{};}
  const home=h('div',{class:'admin-dashboard'}),content=h('div',{class:'admin-section-content'}),heading=h('h3',{class:'admin-section-heading'},'');
  const back=button('← All admin tools',()=>show('home'),'grey');
  const breadcrumb=h('div',{class:'admin-breadcrumb',hidden:true},back,heading);
  body.append(home,breadcrumb,content);
  const editor=createAdminProfileEditor({state,actions}),trades=createAdminTrades({state,actions});
  const live=h('div',{class:'admin-live-accounts'}),rooms=h('div',{class:'admin-room-list'}),leaders=h('div',{class:'admin-room-players'});
  const accounts=h('section',{},editor.el,h('h3',{},'Online players'),h('p',{class:'panel-note'},'Select a player to view their full profile, including guests.'),live);
  let section='home',lastRooms=0,roomKey='',liveKey='';
  function requestRooms(){lastRooms=Date.now();actions.admin('listRooms');}
  function select(person,roomCode){state.adminProfile=null;show('accounts');actions.admin('getProfile',{id:person.id,roomCode});}
  function tile(id,title,description,icon,tone){return h('button',{type:'button',class:`admin-dashboard-tile ${tone}`,'data-admin-section':id,onClick:()=>{if(id==='trades'){state.adminTradeFilter='';state.adminTradeName='';}show(id);}},h('span',{class:'admin-tile-icon'},icon()),h('strong',{},title),h('small',{},description));}
  home.append(tile('accounts','Accounts','Coins, wins, pets and full profiles',icons.face,'blue'),tile('general','General Controls','Announcements, admin tag and game tools',icons.gear,'orange'),tile('rooms','Rooms','Players, room access and moderation',icons.chair,'green'),tile('trades','Trades','Global activity and account trade history',icons.trade,'purple'));
  const announce=h('textarea',{class:'field',rows:3,maxlength:120,placeholder:'Write an announcement…','aria-label':'Announcement'});
  const tag=h('input',{type:'checkbox',checked:!!state.players.get(state.you)?.isAdmin,'aria-label':'Show admin tag',onChange:e=>actions.admin('tag',{on:e.target.checked})});
  const freeMerge=h('input',{type:'checkbox',checked:!!state.adminFreeMerge,onChange:e=>state.adminFreeMerge=e.target.checked});
  const animation=h('input',{type:'checkbox',checked:!!state.showAnimationTester,'aria-label':'Show animation tester',onChange:e=>actions.toggleAnimationTester(e.target.checked)});
  const general=h('section',{class:'admin-general'},
   h('div',{class:'admin-control-card'},h('h3',{},'Announcements'),announce,h('div',{class:'host-tools'},button('Announce in room',()=>{actions.admin('announce',{text:announce.value});announce.value='';}),button('Announce globally',()=>{actions.admin('announce',{text:announce.value,global:true});announce.value='';},'purple'))),
   h('div',{class:'admin-control-card'},h('h3',{},'Your admin setup'),row('Show ADMIN tag',tag),row('Free admin pet merges',freeMerge),row('Show animation tester',animation),button('Test animations',actions.testAnimations,'purple'),row('Player list preview',h('div',{class:'host-tools'},button('Classic',()=>actions.preference('playerListStyle','classic')),button('Slim roster',()=>actions.preference('playerListStyle','compact'))))),
   h('div',{class:'admin-control-card'},h('h3',{},'Current room'),h('div',{class:'host-tools'},button('Take host',()=>actions.admin('takeHost')),button('Force start',()=>actions.admin('forceStart'),'green'),button('End match · refund',()=>actions.admin('endMatch'),'orange'),button('Reset room',async()=>{if(await confirmDialog({title:'Reset this room?',message:'Refund active games and restore the default rules?',ok:'Reset room',tone:'red'}))actions.admin('reset');},'red'))));
  const roomSection=h('section',{},h('div',{class:'panel-bar'},h('p',{class:'panel-note'},'Live public and private rooms'),button('Refresh rooms',requestRooms)),rooms,h('h3',{},'Leaderboard accounts'),leaders);
  function show(next){
   section=next;home.hidden=next!=='home';breadcrumb.hidden=next==='home';content.hidden=next==='home';
   heading.textContent=({accounts:'Accounts',general:'General Controls',rooms:'Rooms',trades:'Trades'})[next]||'';
   content.replaceChildren(...({accounts:[accounts],general:[general],rooms:[roomSection],trades:[trades.el],home:[]})[next]);
   body.scrollTop=0;
   if(next==='accounts'){editor.loadAccounts();requestRooms();}
   if(next==='rooms')requestRooms();
   if(next==='trades'){actions.admin('listProfiles');requestRooms();trades.select(state.adminTradeFilter||'',state.adminTradeName||'');}
   update();
  }
  function update(){
   if(!state.isAdmin){home.hidden=content.hidden=breadcrumb.hidden=true;return;}
   if(['accounts','rooms'].includes(section)&&Date.now()-lastRooms>15000)requestRooms();
   if(section==='accounts'){
    editor.update();const people=new Map([...state.players.values()].filter(p=>!p.isBot).map(p=>[p.id,{...p,room:state.code}]));for(const r of state.adminRooms||[])for(const p of r.players||[])people.set(p.id,{...p,room:r.code});
    const key=JSON.stringify([...people.values()].map(p=>[p.id,p.name,p.room]));if(key!==liveKey){liveKey=key;live.replaceChildren(...[...people.values()].map(p=>button(`${p.name} · ${p.room}`,()=>select(p,p.room),'grey')));}
   }
   if(section==='trades'){trades.update();}
   if(section==='rooms'){
    const key=JSON.stringify([state.adminRooms,state.adminLeaders,state.code]);if(key===roomKey)return;roomKey=key;
    rooms.replaceChildren(...(state.adminRooms||[]).map(r=>h('article',{class:'admin-room'},h('div',{class:'admin-room-head'},h('strong',{},`${r.code} · ${r.public?'Public':'Private'} · ${r.humans} players`),h('div',{class:'host-tools'},button(r.code===state.code?'Here':'Join',()=>actions.joinAdminRoom(r.code),r.code===state.code?'grey':'green'),button('Shut down',async()=>{if(await confirmDialog({title:`Shut down ${r.code}?`,message:'Players will leave and active games will be refunded.',ok:'Shut down',tone:'red'}))actions.admin('shutdownRoom',{code:r.code});},'red'))),h('div',{class:'admin-room-players'},(r.players||[]).map(p=>button(p.name,()=>select(p,r.code),'grey'))))));
    if(!rooms.childElementCount)rooms.append(h('div',{class:'empty'},'No occupied rooms.'));
    leaders.replaceChildren(...(state.adminLeaders||[]).map(p=>button(`${p.name} · ${p.wins} wins`,()=>select(p),'grey')));
   }
  }
  const timer=setInterval(update,2000);show(state.adminSection||'home');state.adminSection=null;
  return {update,unmount:()=>clearInterval(timer),showTrades(id,name){state.adminTradeFilter=id||'';state.adminTradeName=name||'';show('trades');}};
 }};
}
