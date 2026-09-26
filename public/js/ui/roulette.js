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
  const enter = h('button', { class: 'btn green', type: 'button', onClick: onEnter });
  const start = h('button', { class: 'btn purple', type: 'button', onClick: onStart }, 'Begin the ritual');
  const controls = h('div', { class: 'roulette-actions' }, clock, drink, pass, enter, start);
  const el = h('div', { class: 'roulette-hud', hidden: true }, h('div', { class: 'roulette-heading' }, title, pot), h('div', { class: 'roulette-bottom' }, note, controls));
  let state, nextBeat = 0;
  const timer = setInterval(() => {
    if (!el.hidden && state) {
      const left = Math.max(0,(state.deadline-performance.now())/1000);
      clock.textContent = `${left.toFixed(1)}s`;
      el.classList.toggle('danger', state.match?.roulette?.risk >= .5);
      if (['roulette','rouletteReveal'].includes(state.match?.phase) && performance.now()>nextBeat) { sfx.heartbeat(); nextBeat=performance.now()+(state.match.phase==='rouletteReveal'?650:Math.max(450,1100+Math.min(0,left-5)*110)); }
    }
  }, 100);
  function update(st, active) {
    state = st; el.hidden = !active;
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
    enter.disabled = !!st.betPending || profile.coins < st.rouletteEntry;
    enter.textContent = st.betPending ? 'Entering…' : `Enter · ${fmt(st.rouletteEntry || 0)} coins`;
    const ready = [...st.players.values()].filter(p => p.seat >= 0 && (p.isBot || !st.rouletteEntry || p.rouletteBet != null)).length;
    start.hidden = !lobby || !(st.you === st.hostId || st.isAdmin);
    start.disabled = ready < 2;
    title.textContent = m?.phase === 'ended' ? (m.winnerId ? 'THE LAST ONE AWAKE' : 'THE RITUAL ENDS') : 'THE LAST SIP';
    const name = id => st.players.get(id)?.name || 'Someone';
    note.textContent = lobby ? (mine?.seat < 0 ? `Take a seat in the light. ${st.rouletteEntry ? `Entry: ${fmt(st.rouletteEntry)} game coins.` : 'Entry starts at 25 coins.'}` : `Waiting at the table · ${ready} ready${st.rouletteEntry ? ' · confirm your entry below' : ''}`)
      : m?.phase === 'roulette' ? (turn ? `Your cup. ${(r.risk*100).toFixed(1)}% poison chance.` : `${name(m.typerId)} holds the cup… ${(r.risk*100).toFixed(1)}% poison chance.`)
      : m?.phase === 'rouletteReveal' ? (r.event.action === 'pass' ? `${name(r.event.id)} slides the cup away…` : 'Drink. Wait. Do you feel anything…?')
      : m?.phase === 'ended' ? (m.winnerId ? `${name(m.winnerId)} claims ${fmt(r?.pot || 0)} coins.` : 'Entries are returned.') : '';
  }
  return { el, update, dispose: () => clearInterval(timer) };
}
