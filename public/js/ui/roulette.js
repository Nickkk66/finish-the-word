import { h, fmt } from './dom.js';
import { sfx } from '../audio.js';
import { profile } from '../profile.js';

export function createRouletteHud({ onAction, onEnter, onStart }) {
  const title = h('div', { class: 'roulette-title' }, 'THE LAST SIP');
  const note = h('div', { class: 'roulette-note' });
  const pot = h('div', { class: 'roulette-pot' });
  const clock = h('span', { class: 'roulette-clock' });
  const drink = h('button', { class: 'btn purple', type: 'button', onClick: () => onAction('drink') }, 'Drink');
  const pass = h('button', { class: 'btn grey', type: 'button', onClick: () => onAction('pass') }, 'Pass');
  const wager = h('input', {class:'roulette-wager',type:'number',min:25,step:1,value:25,'aria-label':'Your bet in coins'});
  const odds = h('div',{class:'roulette-odds'});
  const enter = h('button', { class: 'btn green', type: 'button', onClick: () => onEnter(Number(wager.value)) });
  const start = h('button', { class: 'btn purple', type: 'button', onClick: onStart }, 'Begin the ritual');
  const controls = h('div', { class: 'roulette-actions' }, clock, drink, pass, wager, enter, start);
  const el = h('div', { class: 'roulette-hud', hidden: true }, h('div', { class: 'roulette-heading' }, title, pot), h('div', { class: 'roulette-bottom' }, note, odds, controls));
  const heartbeat=h('div',{class:'roulette-heartbeat','aria-hidden':'true'});el.append(heartbeat);
  let state, nextBeat = 0;
  const timer = setInterval(() => {
    if (!el.hidden && state) {
      const left = Math.max(0,(state.deadline-performance.now())/1000);
      clock.textContent = `${left.toFixed(1)}s`;
      el.classList.toggle('danger', state.match?.roulette?.risk >= .5);
      if (['roulette','rouletteReveal'].includes(state.match?.phase) && performance.now()>nextBeat) { sfx.heartbeat(); if(state.match.typerId===state.you && state.match.phase==='roulette'){heartbeat.getAnimations().forEach(a=>a.cancel());heartbeat.animate([{opacity:0},{opacity:.9,offset:.12},{opacity:.2,offset:.28},{opacity:.65,offset:.4},{opacity:0}],{duration:650});} nextBeat=performance.now()+(state.match.phase==='rouletteReveal'?650:Math.max(450,1100+Math.min(0,left-5)*110)); }
    }
  }, 100);
  function update(st, active) {
    state = st; el.hidden = !active;
    heartbeat.hidden = !active || st.match?.typerId!==st.you || st.match?.phase!=='roulette';
    if (!active) return;
    const m = st.match, r = m?.roulette;
    const lobby = ['lobby', 'countdown'].includes(m?.phase);
    const mine = st.players.get(st.you);
    const turn = m?.phase === 'roulette' && m.typerId === st.you;
    const pooled = lobby ? [...st.players.values()].reduce((n,p) => n + (p.rouletteBet || (p.isBot?st.rouletteEntry:0)), 0) : r?.pot || 0;
    pot.textContent = `${fmt(pooled)} COINS · ×${(r?.multiplier || 1).toFixed(2)} PRIZE`;
    drink.hidden = pass.hidden = !turn;
    pass.disabled = r?.passed?.includes(st.you);
    pass.textContent = pass.disabled ? 'Pass used' : 'Pass · 1 per round';
    clock.hidden = !['roulette', 'countdown'].includes(m?.phase);
    enter.hidden = !lobby || mine?.seat < 0 || !st.rouletteEntry || mine?.rouletteBet != null;
    wager.hidden=enter.hidden; wager.max=profile.coins;
    enter.disabled = !!st.betPending || profile.coins < 25;
    enter.textContent = st.betPending ? 'Entering…' : `Enter · your bet`;
    odds.replaceChildren();
    odds.hidden = !r || !['roulette','rouletteReveal'].includes(m.phase);
    if(!odds.hidden) {
      const base=r.baseRisk??r.risk, reduction=r.reduction||0;
      if(reduction>0)odds.append(h('s',null,`${(base*100).toFixed(1)}%`),h('span',{class:'roulette-discount'},` −${(reduction*100).toFixed(1)}% = `));
      odds.append(h('strong',null,`${(r.risk*100).toFixed(1)}% poison chance`));
    }
    const ready = [...st.players.values()].filter(p => p.seat >= 0 && (p.isBot || !st.rouletteEntry || p.rouletteBet != null)).length;
    start.hidden = !lobby || !(st.you === st.hostId || st.isAdmin);
    start.disabled = ready < 2;
    title.textContent = m?.phase === 'ended' ? (m.winnerId ? 'THE LAST ONE AWAKE' : 'THE RITUAL ENDS') : 'THE LAST SIP';
    const name = id => st.players.get(id)?.name || 'Someone';
    note.textContent = lobby ? (mine?.seat < 0 ? 'Take a seat in the light. Choose your own bet, from 25 coins.' : `Waiting at the table · ${ready} ready${st.rouletteEntry ? ' · confirm your entry below' : ''}`)
      : m?.phase === 'roulette' ? (turn ? 'Your cup. Drink or pass.' : `${name(m.typerId)} holds the cup…`)
      : m?.phase === 'rouletteReveal' ? (r.event.action === 'pass' ? `${name(r.event.id)} slides the cup away…` : 'Drink. Wait. Do you feel anything…?')
      : m?.phase === 'ended' ? (m.winnerId ? `${name(m.winnerId)} claims ${fmt(r?.pot || 0)} coins.` : 'Entries are returned.') : '';
  }
  return { el, update, dispose: () => clearInterval(timer) };
}
