// Pets: lucky blocks ("Open $price" + odds) and the pet inventory (equip / unequip).

import { h, fmt } from '../dom.js';
import { icons } from '../icons.js';
import { BLOCKS, PETS, PETS_BY_ID, RARITIES, abilityText } from '../../shared/catalog.js';
import { profile } from '../../profile.js';

function oddsList(block) {
  const entries = Object.entries(block.odds);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  return h('div', { class: 'odds' }, entries.map(([id, w]) => {
    const pet = PETS_BY_ID[id];
    return h('span', { class: 'odd', title: `${pet.name} (${pet.rarity})`, style: { '--rc': RARITIES[pet.rarity].color } },
      h('span', { 'aria-hidden': 'true' }, pet.emoji), `${Math.round((w / total) * 100)}%`);
  }));
}

/** actions.openBlock(blockId), actions.equipPet(petId | null); state.settings.petAbilities. */
export function petsPanel({ state, actions }) {
  return {
    id: 'pets',
    title: 'Pets',
    color: 'purple',
    icon: icons.paw,
    mount(body) {
      const blockBtns = BLOCKS.map((block) => {
        const btn = h('button', { type: 'button', class: 'btn small block green', onClick: () => actions.openBlock(block.id) }, `Open 💵 ${fmt(block.price)}`);
        return { block, btn };
      });
      const invTitle = h('h3', { class: 'section-title stroke' });
      const offNote = h('p', { class: 'panel-note', hidden: true }, '⚠️ Pet abilities are turned off in this room (host setting).');
      const inventory = h('div', { class: 'item-grid pets-grid' });

      body.append(
        h('h3', { class: 'section-title stroke' }, 'Lucky Blocks'),
        h('div', { class: 'block-row' }, blockBtns.map(({ block, btn }) =>
          h('div', { class: 'block-card', style: { '--bc': block.color } },
            h('div', { class: 'block-art', 'aria-hidden': 'true' }, '?'),
            h('div', { class: 'block-info' },
              h('div', { class: 'item-name stroke' }, block.name),
              oddsList(block),
              btn)))),
        invTitle,
        offNote,
        inventory);

      function petCard(pet, count) {
        const equipped = profile.equippedPet === pet.id;
        const rarity = RARITIES[pet.rarity];
        return h('div', { class: `item-card${equipped ? ' equipped' : ''}`, style: { '--rc': rarity.color } },
          count > 1 ? h('span', { class: 'item-count stroke' }, `×${count}`) : null,
          h('div', { class: 'item-art' }, h('span', { class: 'item-emoji', 'aria-hidden': 'true' }, pet.emoji)),
          h('div', { class: 'item-name stroke' }, pet.name),
          h('span', { class: 'pill', style: { '--pc': rarity.color } }, pet.rarity),
          h('div', { class: 'item-desc' }, abilityText(pet.ability)),
          h('button', {
            type: 'button',
            class: `btn small block ${equipped ? 'red' : 'blue'}`,
            onClick: () => actions.equipPet(equipped ? null : pet.id),
          }, equipped ? 'Unequip' : 'Equip'));
      }

      function update() {
        for (const { block, btn } of blockBtns) btn.disabled = profile.coins < block.price;
        const owned = PETS.filter((p) => profile.pets[p.id] > 0)
          .sort((a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order);
        invTitle.textContent = `Your Pets (${owned.length}/${PETS.length})`;
        offNote.hidden = state.settings.petAbilities !== false;
        inventory.replaceChildren(...(owned.length
          ? owned.map((pet) => petCard(pet, profile.pets[pet.id]))
          : [h('p', { class: 'empty' }, 'No pets yet — open a Lucky Block to hatch one!')]));
      }
      update();
      return { update };
    },
  };
}
