import { h, fmt } from '../dom.js';
import { icons } from '../icons.js';
import { cardArt, modelArt, oddsText } from '../art.js';
import { CARDS, CARDS_BY_ID, CARD_BOXES, RARITIES } from '../../shared/catalog.js';
import { profile } from '../../profile.js';
import { noticeDialog } from '../overlays.js';

export function cardsPanel({ state, actions }) {
  return { id: 'cards', title: 'Cards', color: 'blue', icon: icons.gift,
    mount(body) {
      const boxes = h('div', { class: 'block-row' });
      const inventory = h('div', { class: 'item-grid card-inventory' });
      const note = h('p', { class: 'panel-note' });
      const boxHeading = h('h3', { class: 'section-title stroke' }, 'Card Boxes');
      let selected = null;
      body.append(h('h3', { class: 'section-title stroke' }, 'Your Cards'), note, inventory, boxHeading, boxes);
      function update() {
        const m = state.match;
        const active = ['choosing', 'typing', 'cardReveal', 'roundEnd'].includes(m?.phase) && m?.participants?.some(p => p.id === state.you && p.alive);
        const turn = m?.phase === 'typing' && m.typerId === state.you;
        note.textContent = turn ? 'Pick a card, then click a glowing player. Press C to close cards; Esc closes any panel.' : 'Collect cards from boxes. During a match, plan a card before your next turn. Press C to close.';
        boxHeading.hidden = boxes.hidden = turn;
        inventory.classList.toggle('card-turn-tray', turn);
        boxes.replaceChildren(...CARD_BOXES.map((box) => {
          const total = Object.values(box.odds).reduce((sum, n) => sum + n, 0);
          return h('div', { class: 'block-card', 'data-card-box': box.id, style: { '--bc': box.color }, title: `Open for a random card. ${Object.keys(box.odds).map(id => `${CARDS_BY_ID[id].name}: ${CARDS_BY_ID[id].description}`).join('; ')}` }, modelArt(actions, 'cardBox', box.id, box.name, 100),
            h('div', { class: 'block-info' }, h('div', { class: 'item-name stroke' }, box.name),
              h('div', { class: 'odds' }, Object.entries(box.odds).map(([id, n]) => h('span', { class: 'odd', title: CARDS_BY_ID[id].description, style: { '--rc': CARDS_BY_ID[id].color } }, `${CARDS_BY_ID[id].name} ${oddsText(n, total)}`))),
              h('button', { type: 'button', class: 'btn small green', disabled: active || profile.coins < box.price, onClick: () => actions.openCardBox(box.id) }, `Open · ${fmt(box.price)}`)));
        }));
        inventory.replaceChildren(...CARDS.map((card) => {
          const count = profile.cards[card.id] || 0;
          const used = turn && state.cardUsedTurn === m?.turnId;
          const source = CARD_BOXES.filter(box => Object.hasOwn(box.odds, card.id)).sort((a, b) => a.price - b.price)[0];
          const description = h('p', { class: 'item-desc', id: `card-description-${card.id}` }, card.description);
          const art = h('button', { type: 'button', class: 'card-art-button', title: card.description, 'aria-label': `${card.name}: ${card.description}`, 'aria-expanded': String(selected === card.id), onClick: () => { selected = selected === card.id ? null : card.id; update(); } }, cardArt(card));
          const use = async () => {
            if (!count) {
              const box = body.querySelector(`[data-card-box="${source.id}"]`);
              if (box) {
                body.querySelector('.card-box-highlight')?.classList.remove('card-box-highlight');
                box.classList.add('card-box-highlight');
                box.scrollIntoView({ behavior: 'smooth', block: 'center' });
                note.textContent = `${card.name} is in the ${source.name} · Open it for ${fmt(source.price)} coins to try to collect this card.`;
                setTimeout(() => box.classList.remove('card-box-highlight'), 2600);
              }
              return;
            }
            if (!turn) { await noticeDialog('Plan during a match', 'Open My cards during a match and choose a card and target before your next turn begins.'); return; }
            if (used) { await noticeDialog('One card per turn', 'You already used a card this turn.'); return; }
            actions.beginCardTarget(card.id);
          };
          return h('div', { class: `item-card collection-card${selected === card.id ? ' selected' : ''}`, style: { '--rc': RARITIES[card.rarity].color } }, art,
            h('span', { class: 'item-count stroke' }, `×${count}`),
            h('div', { class: 'item-name stroke' }, card.name),
            h('span', { class: 'pill' }, card.rarity), description,
            h('button', { type: 'button', class: `btn small ${count ? 'blue' : 'green'} block`, disabled: !!state.cardPending, onClick: use }, used && count ? 'Used this turn' : count ? 'Use card' : 'Find in crate'));
        }));
      }
      update(); return { update };
    },
  };
}
