import { h, fmt } from '../dom.js';
import { icons } from '../icons.js';
import { modelArt } from '../art.js';
import { CHAIRS, TABLES, BACK_BLING, RARITIES } from '../../shared/catalog.js';
import { profile } from '../../profile.js';

export function chairsPanel({ actions }) {
  return {
    id: 'chairs', title: 'Shop', color: 'orange', icon: icons.chair,
    mount(body) {
      let kind = 'chair';
      const balance = h('div', { class: 'balance stroke' });
      const grid = h('div', { class: 'item-grid' });
      const tabs = [['chair', 'Chairs'], ['table', 'Tables'], ['back', 'Back Bling']].map(([id, name]) =>
        h('button', { type: 'button', class: 'seg-btn', onClick: () => { kind = id; update(); } }, name));
      body.append(h('div', { class: 'panel-bar' }, h('div', { class: 'seg' }, tabs), balance), grid);
      function update() {
        balance.textContent = `💵 ${fmt(profile.coins)}`;
        tabs.forEach((button, i) => button.setAttribute('aria-pressed', String(['chair', 'table', 'back'][i] === kind)));
        const catalog = kind === 'chair' ? CHAIRS : kind === 'table' ? TABLES : BACK_BLING;
        const owned = kind === 'chair' ? profile.ownedChairs : kind === 'table' ? profile.ownedTables : profile.ownedBacks;
        const equipped = kind === 'chair' ? profile.equippedChair : kind === 'table' ? profile.equippedTable : profile.equippedBack;
        grid.replaceChildren(...catalog.map((item) => {
          const selected = equipped === item.id;
          const has = owned.includes(item.id);
          return h('div', { class: `item-card${selected ? ' equipped' : ''}`, style: { '--rc': RARITIES[item.rarity]?.color || '#b0b7c3' } },
            h('div', { class: 'item-art' }, modelArt(actions, kind, item.id, item.name)),
            h('div', { class: 'item-name stroke' }, item.name),
            h('span', { class: 'item-desc' }, item.rarity || 'Default'),
            h('button', { type: 'button', class: `btn small block ${selected ? 'grey' : has ? 'blue' : 'green'}`, disabled: selected || (!has && profile.coins < item.price), onClick: () => actions.cosmetic(kind, item.id) }, selected ? 'Equipped ✓' : has ? 'Equip' : `Buy · ${fmt(item.price)}`));
        }));
      }
      update(); return { update };
    },
  };
}
