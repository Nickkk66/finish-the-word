import {h} from './dom.js';
import {PETS_BY_ID,CARDS_BY_ID,CHAIRS,BACK_BLING} from '../shared/catalog.js';
import {modelArt} from './art.js';

function offered(offer,actions){
 const items=[];
 for(const item of offer?.items||[]){
  const label=item.kind==='pet'?`${PETS_BY_ID[item.id]?.name||item.id} · T${item.tier} ×${item.qty}`:item.kind==='card'?`${CARDS_BY_ID[item.id]?.name||item.id} ×${item.qty}`:item.kind==='chair'?CHAIRS.find(v=>v.id===item.id)?.name||item.id:BACK_BLING.find(v=>v.id===item.id)?.name||item.id;
  items.push(h('span',{class:'admin-trade-item'},item.kind==='pet'?modelArt(actions,'pet',item.id,PETS_BY_ID[item.id]?.name||item.id,40):null,label));
 }
 return h('div',{class:'admin-trade-items'},items.length?items:h('span',{class:'panel-note'},'No items'));
}
export function adminTradeRecord(trade,actions,onPerson){
 return h('article',{class:'admin-trade-record'},
  h('div',{class:'admin-trade-heading'},h('strong',{},'Completed trade'),h('time',{},new Date(trade.at).toLocaleString()),h('small',{},trade.source==='saved'?'Earlier saved history':`Room ${trade.room}`)),
  h('div',{class:'admin-trade-sides'},trade.people.map(person=>h('div',{class:'admin-trade-side'},h('button',{type:'button',class:'admin-trade-person',disabled:!person.id,onClick:()=>onPerson(person.id,person.name)},person.name),h('small',{},'Gave'),offered(trade.offers[person.id||'unknown'],actions)))));
}
export function createAdminTrades({state,actions}){
 const title=h('h3',{},'Global recent trades'),list=h('div',{class:'admin-trade-list'}),note=h('p',{class:'panel-note'},'Completed trades, newest first. Earlier saved histories are labelled.');
 const filter=h('select',{class:'field','aria-label':'Filter trades by account',onChange:()=>choose(filter.value)},h('option',{value:''},'Everyone · global trades'));
 const controls=h('div',{class:'admin-trade-controls'},filter,h('button',{class:'btn small blue',type:'button',onClick:()=>load()},'Refresh trades'));
 const el=h('section',{class:'admin-trades-view'},title,controls,note,list);
 let selected='',selectedName='',key='';
 function load(){list.replaceChildren(h('p',{class:'panel-note'},'Loading trades…'));actions.admin('listTrades',selected?{id:selected}:{});}
 function choose(id,name=''){selected=id||'';selectedName=name;state.adminTradeFilter=selected;key='';state.adminTrades=null;load();update();}
 function update(){
  const users=new Map((state.adminProfiles||[]).map(p=>[p.id,p]));for(const r of state.adminRooms||[])for(const p of r.players||[])if(!users.has(p.id))users.set(p.id,p);
  if(selected&&!users.has(selected))users.set(selected,{id:selected,name:selectedName||selected});
  filter.replaceChildren(h('option',{value:''},'Everyone · global trades'),...[...users.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>h('option',{value:p.id},p.name)));filter.value=selected;
  title.textContent=selected?`${users.get(selected)?.name||selected}’s trades`:'Global recent trades';
  const result=state.adminTrades;if(!result||(result.id||'')!==selected)return;
  const nextKey=JSON.stringify([selected,result]);if(nextKey===key)return;key=nextKey;
  list.replaceChildren(...(result.trades||[]).map(trade=>adminTradeRecord(trade,actions,(id,name)=>choose(id,name))));
  if(!list.childElementCount)list.append(h('div',{class:'empty'},'No completed trades for this selection.'));
 }
 return {el,update,select(id,name){key='';choose(id,name);},load};
}
