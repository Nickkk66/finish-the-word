import { SEAT_COUNT } from '../shared/constants.js';
import { rouletteRules } from '../shared/roulette.js';
import { h, fmt } from './dom.js';
import { sfx } from '../audio.js';
import { profile } from '../profile.js';

export function createRouletteHud({ onAction, onEnter, onStart }) {
  const title = h('div', { class: 'roulette-title' }, 'THE LAST SIP');
  const note = h('div', { class: 'roulette-note' });
  const pot = h('div', { class: 'roulette-pot' });
  const clock = h('span', { class: 'roulette-clock' });
  const drink = h('button', { class: 'btn purple', type: 'button', onClick: () => onAction('drink') }, 'Drink');
  const double = h('button', { class: 'btn red', type: 'button', onClick: () => onAction('double'), title: '60% poison chance. If you survive and win, your multiplied entry is added to the prize.' }, 'Double Sip · 60%');
  const pass = h('button', { class: 'btn grey', type: 'button', onClick: () => onAction('pass') }, 'Pass');
  const wager = h('input', {class:'roulette-wager',type:'text',inputmode:'numeric',pattern:'[0-9]*',value:profile.coins,'aria-label':'Your bet in coins'});
  const odds = h('div',{class:'roulette-odds'});
  const enter = h('button', { class: 'btn green', type: 'button', onClick: () => onEnter(Number(wager.value)) });
  const start = h('button', { class: 'btn purple', type: 'button', onClick: onStart }, 'Begin the ritual');
  const wagerField=h('label',{class:'roulette-wager-field'},h('span',null,'Your bet'),wager);
  const controls = h('div', { class: 'roulette-actions' }, clock, drink, double, pass, wagerField, enter, start);
  const el = h('div', { class: 'roulette-hud', hidden: true }, h('div', { class: 'roulette-heading' }, title, pot), h('div', { class: 'roulette-bottom' }, note, odds, controls));
  const heartbeat=h('div',{class:'roulette-heartbeat','aria-hidden':'true'});el.append(heartbeat);
  const feelsHeartbeat=st=>st?.match?.phase==='roulette'&&st.match.typerId===st.you || st?.match?.phase==='rouletteReveal'&&st.match.roulette?.event?.action!=='pass';
  let state, nextBeat = 0, betEdited=false, betRoom=null;
  wager.addEventListener('input',()=>{betEdited=true;wager.value=wager.value.replace(/[^0-9]/g,'');});
  const timer = setInterval(() => {
    if (!el.hidden && state) {
      const left = Math.max(0,(state.deadline-performance.now())/1000);
      clock.textContent = `${left.toFixed(1)}s`;
      el.classList.toggle('danger', state.match?.roulette?.event?.action === 'double' && state.match?.phase === 'rouletteReveal' || state.match?.roulette?.risk >= .5);
      if (['roulette','rouletteReveal'].includes(state.match?.phase) && performance.now()>nextBeat) { sfx.heartbeat(); if(feelsHeartbeat(state)){heartbeat.getAnimations().forEach(a=>a.cancel());heartbeat.animate([{opacity:0},{opacity:.9,offset:.12},{opacity:.2,offset:.28},{opacity:.65,offset:.4},{opacity:0}],{duration:650});} nextBeat=performance.now()+(state.match.phase==='rouletteReveal'?650:Math.max(450,1100+Math.min(0,left-5)*110)); }
    }
  }, 100);
  function update(st, active) {
    if(betRoom!==st.code){betRoom=st.code;betEdited=false;}
    if(!betEdited)wager.value=String(profile.coins);
    state = st; el.hidden = !active;
    heartbeat.hidden = !active || !feelsHeartbeat(st);
    if(heartbeat.hidden)heartbeat.getAnimations().forEach(a=>a.cancel());
    if (!active) return;
    const m = st.match, r = m?.roulette;
    const lobby = ['lobby', 'countdown'].includes(m?.phase);
    const mine = st.players.get(st.you);
    const turn = m?.phase === 'roulette' && m.typerId === st.you;
    const pooled = lobby ? [...st.players.values()].reduce((n,p) => n + (p.rouletteBet || (p.isBot?st.rouletteEntry:0)), 0) : r?.pot || 0;
    pot.textContent = m?.practice ? `PRACTICE · ${m.practiceReason || 'Entries returned.'} · ${fmt(pooled)} COINS RETURNED` : `${fmt(pooled)} COINS · ×${(r?.multiplier || 1).toFixed(2)} PRIZE`;
    drink.hidden = double.hidden = pass.hidden = !turn;
    double.disabled = !!r?.doubleSurvivors?.includes(st.you);
    double.textContent = double.disabled ? 'Double Sip won ✓' : 'Double Sip · 60%';
    pass.disabled = r?.passed?.includes(st.you);
    pass.textContent = pass.disabled ? 'Pass used' : 'Pass · 1 per match';
    clock.hidden = !['roulette', 'countdown'].includes(m?.phase);
    enter.hidden = !lobby || mine?.seat < 0 || mine?.seat >= SEAT_COUNT || !st.rouletteEntry || mine?.rouletteBet != null;
    wagerField.hidden=enter.hidden; wager.max=profile.coins;
    enter.disabled = !!st.betPending || profile.coins < 25;
    enter.textContent = st.betPending ? 'Entering…' : `Enter · your bet`;
    odds.replaceChildren();
    odds.hidden = !r || !['roulette','rouletteReveal'].includes(m.phase);
    if(!odds.hidden) {
      const base=r.baseRisk??r.risk, reduction=r.reduction||0;
      const shownRisk = m.phase === 'rouletteReveal' && r.event?.action === 'double' ? .6 : r.risk;
      odds.append(h('div',{class:'risk-readout',style:{'--risk-color':`hsl(${Math.round(125*(1-Math.min(1,shownRisk/.75)))} 76% 43%)`}},h('strong',null,`${(shownRisk*100).toFixed(1)}%`),h('span',null,r.event?.action==='double'&&m.phase==='rouletteReveal'?'Double Sip risk':'Poison chance')));
      if(reduction>0)odds.append(h('div',{class:'risk-tag',title:`${(base*100).toFixed(1)}% base chance, reduced by ${(reduction*100).toFixed(1)} percentage points`},h('strong',null,`−${(reduction*100).toFixed(1)}%`),h('small',null,'CHANCE OFF')));
    }
    const ready = [...st.players.values()].filter(p => p.seat >= 0 && p.seat < SEAT_COUNT && (p.isBot || !st.rouletteEntry || p.rouletteBet != null)).length;
    start.hidden = !lobby || !(st.you === st.hostId || st.isAdmin);
    start.disabled = ready < 2;
    title.textContent = m?.phase === 'ended' ? (m.winnerId ? 'THE LAST ONE AWAKE' : 'THE RITUAL ENDS') : rouletteRules(['roulette','rouletteReveal'].includes(m?.phase) ? m.mode : st.settings.mode).name.toUpperCase();
    const name = id => st.players.get(id)?.name || 'Someone';
    note.textContent = lobby ? (mine?.seat < 0 ? (mine?.rouletteBet ? 'Your entry is still committed. Sit down again to play.' : 'Take a seat in the light. Choose your own bet, from 25 coins. Paid play requires one recorded win each.') : `Waiting at the table · ${ready} ready${st.rouletteEntry && !mine?.rouletteBet ? ' · confirm your entry below' : ''} · paid play requires 1 win each (kept)`)
      : m?.phase === 'roulette' ? (turn ? 'Your cup. Drink, pass, or risk a Double Sip.' : `${name(m.typerId)} holds the cup…`)
      : m?.phase === 'rouletteReveal' ? (r.event.action === 'pass' ? `${name(r.event.id)} slides the cup away…` : r.event.action === 'double' ? 'Double Sip. Will they survive?' : 'Drink. Wait. Do you feel anything…?')
      : m?.phase === 'ended' ? (m.winnerId ? `${name(m.winnerId)} claims the pot${r?.doubleSurvivors?.includes(m.winnerId) ? ' plus their doubled entry' : ''}.` : 'Entries are returned.') : '';
  }
  return { el, update, dispose: () => clearInterval(timer) };
}
