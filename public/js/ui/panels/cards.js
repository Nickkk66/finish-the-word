import { h, fmt } from '../dom.js';
import { icons } from '../icons.js';
import { cardArt, modelArt, oddsText } from '../art.js';
import { CARDS, CARDS_BY_ID, CARD_BOXES, RARITIES } from '../../shared/catalog.js';
import { profile } from '../../profile.js';

export function cardsPanel({ state, actions }) {
  return { id: 'cards', title: 'Cards', color: 'blue', icon: icons.gift,
    mount(body) {
      const boxes = h('div', { class: 'block-row' });
      const inventory = h('div', { class: 'item-grid card-inventory' });
      const note = h('p', { class: 'panel-note' });
      const boxHeading = h('h3', { class: 'section-title stroke' }, 'Card Boxes');
      const guidance = h('p', { class: 'card-guidance', hidden: true, role: 'status' });
      let selected = null;
      body.append(boxHeading, boxes, h('h3', { class: 'section-title stroke' }, 'Your Cards'), note, guidance, inventory);
      function update() {
        const m = state.match;
        const active = ['choosing', 'typing', 'roundEnd'].includes(m?.phase);
        const turn = m?.phase === 'typing' && m.typerId === state.you;
        note.textContent = turn ? 'Pick a card, then click a glowing player. One card per turn.' : 'Collect cards from boxes, then use them on your typing turn.';
        boxHeading.hidden = boxes.hidden = turn;
        inventory.classList.toggle('card-turn-tray', turn);
        boxes.replaceChildren(...CARD_BOXES.map((box) => {
          const total = Object.values(box.odds).reduce((sum, n) => sum + n, 0);
          return h('div', { class: 'block-card', style: { '--bc': box.color } }, modelArt(actions, 'cardBox', box.id, box.name, 100),
            h('div', { class: 'block-info' }, h('div', { class: 'item-name stroke' }, box.name),
              h('div', { class: 'odds' }, Object.entries(box.odds).map(([id, n]) => h('span', { class: 'odd', style: { '--rc': CARDS_BY_ID[id].color } }, `${CARDS_BY_ID[id].name} ${oddsText(n, total)}`))),
              h('button', { type: 'button', class: 'btn small green', disabled: active || profile.coins < box.price, onClick: () => actions.openCardBox(box.id) }, `Open · ${fmt(box.price)}`)));
        }));
        inventory.replaceChildren(...CARDS.map((card) => {
          const count = profile.cards[card.id] || 0;
          const used = turn && state.cardUsedTurn === m?.turnId;
          const description = h('p', { class: 'item-desc', id: `card-description-${card.id}` }, card.description);
          const art = h('button', { type: 'button', class: 'card-art-button', 'aria-label': `${card.name}: ${card.description}`, 'aria-expanded': String(selected === card.id), onClick: () => { selected = selected === card.id ? null : card.id; update(); } }, cardArt(card));
          const use = () => {
            guidance.hidden = false;
            if (!count) {
              guidance.textContent = `You don’t own ${card.name} yet. Buy a Card Crate or Royal Deck between matches to collect cards.`;
              return;
            }
            if (!turn) { guidance.textContent = 'You can use your cards when it’s your typing turn.'; return; }
            if (used) { guidance.textContent = 'You already used a card this turn. Save this one for your next turn!'; return; }
            guidance.hidden = true;
            actions.beginCardTarget(card.id);
          };
          return h('div', { class: `item-card collection-card${selected === card.id ? ' selected' : ''}`, style: { '--rc': RARITIES[card.rarity].color } }, art,
            h('span', { class: 'item-count stroke' }, `×${count}`),
            h('div', { class: 'item-name stroke' }, card.name),
            h('span', { class: 'pill' }, card.rarity), description,
            h('button', { type: 'button', class: `btn small ${count ? 'blue' : 'green'} block`, disabled: !!state.cardPending, onClick: use }, used && count ? 'Used this turn' : 'Use card'));
        }));
      }
      update(); return { update };
    },
  };
}
