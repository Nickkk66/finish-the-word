import { h, fmt } from './dom.js';
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
  let state;
  const timer = setInterval(() => {
    if (!el.hidden && state) clock.textContent = `${Math.max(0, (state.deadline - performance.now()) / 1000).toFixed(1)}s`;
  }, 100);
  function update(st, active) {
    state = st; el.hidden = !active;
    if (!active) return;
    const m = st.match, r = m?.roulette;
    const lobby = ['lobby', 'countdown'].includes(m?.phase);
    const mine = st.players.get(st.you);
    const turn = m?.phase === 'roulette' && m.typerId === st.you;
    const pooled = lobby ? [...st.players.values()].reduce((n,p) => n + (p.rouletteBet || 0), 0) : r?.pot || 0;
    pot.textContent = `${fmt(pooled)} COINS IN THE POT`;
    drink.hidden = pass.hidden = !turn;
    pass.disabled = r?.passed?.includes(st.you);
    pass.textContent = pass.disabled ? 'Pass used' : 'Pass · 1 per bottle';
    clock.hidden = !['roulette', 'countdown'].includes(m?.phase);
    enter.hidden = !lobby || mine?.seat < 0 || !st.rouletteEntry || mine?.rouletteBet != null;
    enter.disabled = !!st.betPending || profile.coins < st.rouletteEntry;
    enter.textContent = st.betPending ? 'Entering…' : `Enter · ${fmt(st.rouletteEntry || 0)} coins`;
    const ready = [...st.players.values()].filter(p => p.seat >= 0 && (!st.rouletteEntry || p.rouletteBet != null)).length;
    start.hidden = !lobby || !(st.you === st.hostId || st.isAdmin);
    start.disabled = ready < 2;
    title.textContent = m?.phase === 'ended' ? (m.winnerId ? 'THE LAST ONE AWAKE' : 'THE RITUAL ENDS') : 'THE LAST SIP';
    const name = id => st.players.get(id)?.name || 'Someone';
    note.textContent = lobby ? (mine?.seat < 0 ? `Take a seat in the light. ${st.rouletteEntry ? `Entry: ${fmt(st.rouletteEntry)} game coins.` : 'Free entry.'}` : `Waiting at the table · ${ready} ready${st.rouletteEntry ? ' · confirm your entry below' : ''}`)
      : m?.phase === 'roulette' ? (turn ? `Your cup. ${r.remaining} sips remain; one is poisoned.` : `${name(m.typerId)} holds the cup…`)
      : m?.phase === 'rouletteReveal' ? (r.event.action === 'pass' ? `${name(r.event.id)} slides the cup away…` : 'The table holds its breath…')
      : m?.phase === 'ended' ? (m.winnerId ? `${name(m.winnerId)} claims ${fmt(r?.pot || 0)} coins.` : 'Entries are returned.') : '';
  }
  return { el, update, dispose: () => clearInterval(timer) };
}
