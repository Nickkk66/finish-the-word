import { h } from './dom.js';
import { cardArt } from './art.js';
import { CARDS } from '../shared/catalog.js';
import { profile } from '../profile.js';

export function createCardTray(root, state, actions) {
  const el = h('section', { class: 'quick-card-tray', hidden: true, 'aria-label': 'Plan a card' });
  root.append(el);
  let selected = null;
  const eligible = () => ['choosing', 'typing', 'cardReveal', 'roundEnd'].includes(state.match?.phase) && state.match.participants.some(p => p.id === state.you && p.alive);
  const locked = () => ['typing', 'cardReveal'].includes(state.match?.phase) && state.match.typerId === state.you;
  function close() { el.hidden = true; selected = null; }
  function update() {
    if (el.hidden) return;
    if (!eligible()) return close();
    const queue = state.cardQueue;
    const card = CARDS.find(c => c.id === selected);
    el.replaceChildren(...[
      h('div', { class: 'quick-card-heading' }, h('strong', {}, 'Play a card'), h('button', { class: 'btn small grey', onClick: close, 'aria-label': 'Close card tray' }, '×')),
      h('p', { class: 'quick-card-help' }, locked() ? 'Choose after this turn.' : 'Choose a card, then choose a player.'),
      h('div', { class: 'quick-card-options' }, CARDS.map(c => h('button', { class: `quick-card${selected === c.id ? ' selected' : ''}`, disabled: locked() || !!state.cardPending || !profile.cards[c.id], onClick: () => { selected = c.id; update(); }, title: c.description }, cardArt(c), h('strong', {}, c.name), h('span', {}, `×${profile.cards[c.id] || 0}`)))),
      card ? h('div', { class: 'quick-card-targets' }, h('p', {}, card.description), state.match.participants.filter(p => p.alive && state.players.get(p.id)?.connected && (p.id !== state.you || card.effect === 'skip')).map(p => h('button', { class: 'btn small purple', disabled: locked() || !!state.cardPending, onClick: () => actions.useCard(card.id, p.id) }, p.id === state.you ? 'Me' : state.players.get(p.id)?.name || 'Player'))) : null,
      h('p', { class: 'quick-card-queue', role: 'status' }, queue ? `${CARDS.find(c => c.id === queue.cardId)?.name} → ${state.players.get(queue.targetId)?.name || 'Player'} · ready` : 'No card selected'),
      queue ? h('button', { class: 'btn small grey', disabled: locked() || !!state.cardPending, onClick: actions.cancelQueuedCard }, 'Cancel queued card') : null,
      (state.match.cardHistory?.length || 0) ? h('details', { class: 'quick-card-history' }, h('summary', {}, `Used cards · ${state.match.cardHistory.length}`), state.match.cardHistory.map(e => h('p', {}, `✓ ${CARDS.find(c => c.id === e.cardId)?.name} → ${state.players.get(e.targetId)?.name || 'Player'}`))) : null,
      h('div', { class: 'quick-card-style' }, h('span', {}, 'Animation'), ...[['pocket', 'A · Pocket'], ['deck', 'B · Deck']].map(([value, label]) => h('button', { class: `btn small ${profile.settings.cardStyle === value ? 'purple' : 'grey'}`, disabled: locked() || !!state.cardPending, onClick: () => { actions.setCardStyle(value); update(); } }, label)))
    ].filter(Boolean));
  }
  return { close, update, toggle() { if (!el.hidden) return close(); el.hidden = false; update(); } };
}
