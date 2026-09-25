// Chairs shop: every CHAIRS entry with rarity, price and Buy / Equip / Equipped.

import { h, fmt } from '../dom.js';
import { icons } from '../icons.js';
import { CHAIRS, RARITIES } from '../../shared/catalog.js';
import { profile } from '../../profile.js';

const CHAIR_EMOJI = {
  wooden: '🪑', glass: '🧊', goop: '🫧', toilet: '🚽', slime: '🟩',
  flower: '🌸', swing: '🎠', gamer: '🎮', electric: '⚡', throne: '👑',
};

/** actions.chair(id): buy (if needed) + equip. */
export function chairsPanel({ actions }) {
  return {
    id: 'chairs',
    title: 'Chairs',
    color: 'orange',
    icon: icons.chair,
    mount(body) {
      const balance = h('div', { class: 'balance stroke' });
      const cards = CHAIRS.map((chair) => {
        const rarity = RARITIES[chair.rarity];
        const btn = h('button', { type: 'button', class: 'btn small block', onClick: () => actions.chair(chair.id) });
        const el = h('div', { class: 'item-card', style: { '--rc': rarity.color } },
          h('div', { class: 'item-art' }, h('span', { class: 'item-emoji', 'aria-hidden': 'true' }, CHAIR_EMOJI[chair.id] || '🪑')),
          h('div', { class: 'item-name stroke' }, chair.name),
          h('span', { class: 'pill', style: { '--pc': rarity.color } }, chair.rarity),
          btn);
        return { chair, el, btn };
      });
      body.append(
        h('div', { class: 'panel-bar' },
          h('p', { class: 'panel-tip' }, 'Your chair replaces your seat at the table. You can also walk up to the chairs on the island and press E.'),
          balance),
        h('div', { class: 'item-grid' }, cards.map((c) => c.el)));

      function update() {
        balance.textContent = `💵 ${fmt(profile.coins)}`;
        for (const { chair, el, btn } of cards) {
          const owned = profile.ownedChairs.includes(chair.id);
          const equipped = profile.equippedChair === chair.id;
          el.classList.toggle('equipped', equipped);
          btn.className = `btn small block ${equipped ? 'grey' : owned ? 'blue' : 'green'}`;
          btn.disabled = equipped || (!owned && profile.coins < chair.price);
          btn.textContent = equipped ? 'Equipped ✓' : owned ? 'Equip' : `💵 ${fmt(chair.price)}`;
        }
      }
      update();
      return { update };
    },
  };
}
