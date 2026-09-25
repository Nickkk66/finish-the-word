import { h, fmt } from '../dom.js';
import { icons } from '../icons.js';
import { cardArt, modelArt, oddsText } from '../art.js';
import { CARDS, CARDS_BY_ID, CARD_BOXES, RARITIES } from '../../shared/catalog.js';
import { profile } from '../../profile.js';

export function cardsPanel({ state, actions }) {
  return { id: 'cards', title: 'Cards', color: 'blue', icon: icons.gift,
    mount(body) {
      const selectedTargets = new Map();
      const boxes = h('div', { class: 'block-row' });
      const inventory = h('div', { class: 'item-grid' });
      const note = h('p', { class: 'panel-note' });
      body.append(h('h3', { class: 'section-title stroke' }, 'Card Boxes'), boxes,
        h('h3', { class: 'section-title stroke' }, 'Your Cards'), note, inventory);
      function update() {
        const m = state.match;
        const active = ['choosing', 'typing', 'roundEnd'].includes(m?.phase);
        const turn = m?.phase === 'typing' && m.typerId === state.you;
        note.textContent = turn ? 'Choose a card and a player. One card per turn; consumed only when accepted.' : 'Use a card on your typing turn. Buy boxes between matches.';
        boxes.replaceChildren(...CARD_BOXES.map((box) => {
          const total = Object.values(box.odds).reduce((sum, n) => sum + n, 0);
          return h('div', { class: 'block-card', style: { '--bc': box.color } }, modelArt(actions, 'cardBox', box.id, box.name, 100),
            h('div', { class: 'block-info' }, h('div', { class: 'item-name stroke' }, box.name),
              h('div', { class: 'odds' }, Object.entries(box.odds).map(([id, n]) => h('span', { class: 'odd', style: { '--rc': CARDS_BY_ID[id].color } }, `${CARDS_BY_ID[id].name} ${oddsText(n, total)}`))),
              h('button', { type: 'button', class: 'btn small green', disabled: active || profile.coins < box.price, onClick: () => actions.openCardBox(box.id) }, `Open · ${fmt(box.price)}`)));
        }));
        inventory.replaceChildren(...CARDS.map((card) => {
          const targets = (m?.participants || []).filter((p) => p.id !== state.you && p.alive);
          const target = h('select', { class: 'field', 'aria-label': `Target for ${card.name}`, disabled: !turn, onChange: (e) => selectedTargets.set(card.id, e.target.value) }, targets.map((p) => h('option', { value: p.id }, state.players.get(p.id)?.name || 'Player')));
          if (targets.some((p) => p.id === selectedTargets.get(card.id))) target.value = selectedTargets.get(card.id);
          return h('div', { class: 'item-card', style: { '--rc': RARITIES[card.rarity].color } }, cardArt(card),
            h('span', { class: 'item-count stroke' }, `×${profile.cards[card.id] || 0}`),
            h('div', { class: 'item-name stroke' }, card.name),
            h('span', { class: 'pill' }, card.rarity), h('p', { class: 'item-desc' }, card.description), target,
            h('button', { type: 'button', class: 'btn small blue block', disabled: !turn || !profile.cards[card.id] || !targets.length || !!state.cardPending || state.cardUsedTurn === m?.turnId, onClick: () => actions.useCard(card.id, target.value) }, state.cardUsedTurn === m?.turnId ? 'Used this turn' : 'Use card'));
        }));
      }
      update(); return { update };
    },
  };
}
