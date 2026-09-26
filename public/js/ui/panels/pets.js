import { h, fmt } from '../dom.js';
import { icons } from '../icons.js';
import { modelArt, oddsText } from '../art.js';
import { BLOCKS, PETS, PETS_BY_ID, RARITIES, abilityText } from '../../shared/catalog.js';
import { profile } from '../../profile.js';

export function petsPanel({ state, actions }) {
  return {
    id: 'pets', title: 'Pets', color: 'purple', icon: icons.paw,
    mount(body) {
      const blocks = h('div', { class: 'block-row' });
      const title = h('h3', { class: 'section-title stroke' });
      const note = h('p', { class: 'panel-note' }, 'Merging uses 3 copies to make a higher-tier pet: Tier 2 is slightly bigger with a blue glow, Tier 3 is bigger with a gold glow. The ability does not get stronger.');
      const off = h('p', { class: 'panel-note', hidden: true }, 'Pet abilities are off in this room.');
      const inventory = h('div', { class: 'item-grid pets-grid' });
      body.append(h('h3', { class: 'section-title stroke' }, 'Lucky Blocks'), blocks, title, note, off, inventory);
      function update() {
        blocks.replaceChildren(...BLOCKS.map((block) => {
          const total = Object.values(block.odds).reduce((sum, n) => sum + n, 0);
          return h('div', { class: `block-card${block.id === 'secret' ? ' secret-block' : ''}`, style: { '--bc': block.color } },
            modelArt(actions, 'block', block.id, block.name, 100),
            h('div', { class: 'block-info' }, h('div', { class: 'item-name stroke' }, block.name),
              h('div', { class: 'odds model-odds' }, Object.entries(block.odds).map(([id, n]) => {
                const pet = PETS_BY_ID[id];
                const img = modelArt(actions, 'pet', id, pet.name, 48);
                img.classList.toggle('silhouette', !profile.discoveredPets.includes(id));
                return h('span', { class: 'odd', title: pet.name, style: { '--rc': RARITIES[pet.rarity].color } }, img, oddsText(n, total));
              })),
              h('button', { type: 'button', class: 'btn small green', disabled: profile.coins < block.price, onClick: () => actions.openBlock(block.id) }, `Open · ${fmt(block.price)}`)));
        }));
        const owned = PETS.filter((p) => profile.pets[p.id]).sort((a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order);
        title.textContent = `Your Pets (${owned.length}/${PETS.length})`;
        off.hidden = state.settings.petAbilities !== false;
        const cards = owned.flatMap((pet) => [1, 2, 3].filter((tier) => profile.petTiers[pet.id]?.[tier]).map((tier) => {
          const count = profile.petTiers[pet.id][tier];
          const equipped = profile.equippedPet === pet.id && profile.equippedPetTier === tier;
          return h('div', { class: `item-card tier-${tier}${equipped ? ' equipped' : ''}`, style: { '--rc': RARITIES[pet.rarity].color } },
            h('span', { class: 'item-count stroke' }, `×${count}`),
            h('div', { class: 'item-art' }, modelArt(actions, 'pet', pet.id, pet.name)),
            h('div', { class: 'item-name stroke' }, pet.name), h('span', { class: 'pill' }, `Tier ${tier} · ${pet.rarity}`),
            h('div', { class: 'item-desc' }, abilityText(pet.ability)),
            h('button', { type: 'button', class: `btn small block ${equipped ? 'grey' : 'blue'}`, onClick: () => actions.equipPet(equipped ? null : pet.id, tier) }, equipped ? 'Unequip' : 'Equip'),
            h('button', { type: 'button', class: 'btn small block purple', disabled: tier === 3 || (!(state.isAdmin && state.adminFreeMerge) && count < 3), onClick: () => actions.mergePet(pet.id, tier) }, tier === 3 ? 'Maximum tier' : state.isAdmin && state.adminFreeMerge ? `Admin free merge → Tier ${tier + 1}` : `Merge 3 → Tier ${tier + 1}`),
            h('button', { type: 'button', class: 'btn small block red', onClick: () => actions.deletePet(pet.id, tier) }, 'Delete one'));
        }));
        inventory.replaceChildren(...(cards.length ? cards : [h('p', { class: 'empty' }, 'Open a Lucky Block to hatch your first pet!')]));
      }
      update(); return { update };
    },
  };
}
