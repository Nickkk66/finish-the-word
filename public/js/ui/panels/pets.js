import { h, fmt } from '../dom.js';
import { icons } from '../icons.js';
import { modelArt, oddsText } from '../art.js';
import { BLOCKS, PETS, PETS_BY_ID, RARITIES } from '../../shared/catalog.js';
import { petAbilities, petAbilitySummary } from '../pet-abilities.js';
import { attachPetTooltip, hidePetTooltip } from '../pet-tooltip.js';
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
      const dictionary = h('div', { class: 'pet-dictionary' });
      const dictionaryTitle = h('h3', { class: 'section-title stroke dict-title' });
      let dictOpen = false;

      const mainContent = [blocks, title, note, off, inventory];

      const dictionaryButton = h('button', {
        type: 'button', class: 'btn small purple pet-dictionary-button',
        'aria-label': 'Pet dictionary', 'aria-expanded': 'false',
        onClick: () => {
          dictOpen = !dictOpen;
          dictionary.hidden = !dictOpen;
          dictionaryTitle.hidden = !dictOpen;
          dictionaryButton.setAttribute('aria-expanded', String(dictOpen));
          dictionaryButton.innerHTML = '';
          if (dictOpen) {
            dictionaryButton.append('← Back to Pets');
          } else {
            dictionaryButton.append(icons.book(), ' Pet dictionary');
          }
          mainContent.forEach(el => { el.hidden = dictOpen; });
          // When showing dictionary, keep pet-abilities-off notice in sync
          if (!dictOpen) off.hidden = state.settings.petAbilities !== false;
        },
      }, icons.book(), ' Pet dictionary');

      dictionary.hidden = true;
      dictionaryTitle.hidden = true;

      body.append(dictionaryButton, ...mainContent, dictionaryTitle, dictionary);

      function update() {
        blocks.replaceChildren(...BLOCKS.map((block) => {
          const total = Object.values(block.odds).reduce((sum, n) => sum + n, 0);
          return h('div', { class: `block-card${block.id === 'secret' ? ' secret-block' : ''}`, style: { '--bc': block.color }, title: `Open for a random pet. ${Object.keys(block.odds).map(id => `${PETS_BY_ID[id].name}: ${petAbilitySummary(PETS_BY_ID[id])}`).join('; ')}` },
            modelArt(actions, 'block', block.id, block.name, 100),
            h('div', { class: 'block-info' }, h('div', { class: 'item-name stroke' }, block.name),
              h('div', { class: 'odds model-odds' }, Object.entries(block.odds).map(([id, n]) => {
                const pet = PETS_BY_ID[id];
                const img = modelArt(actions, 'pet', id, pet.name, 48);
                img.classList.toggle('silhouette', !profile.discoveredPets.includes(id));
                return h('span', { class: 'odd', title: `${pet.name}: ${petAbilitySummary(pet)}`, style: { '--rc': RARITIES[pet.rarity].color } }, img, oddsText(n, total));
              })),
              h('button', { type: 'button', class: 'btn small green', disabled: profile.coins < block.price, onClick: () => actions.openBlock(block.id) }, `Open · ${fmt(block.price)}`)));
        }));

        const owned = PETS.filter((p) => profile.pets[p.id]).sort((a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order);
        title.textContent = `Your Pets (${owned.length}/${PETS.length})`;
        if (!dictOpen) off.hidden = state.settings.petAbilities !== false;

        const cards = owned.flatMap((pet) => [1, 2, 3].filter((tier) => profile.petTiers[pet.id]?.[tier]).map((tier) => {
          const count = profile.petTiers[pet.id][tier];
          const equipped = profile.equippedPet === pet.id && profile.equippedPetTier === tier;
          const rarity = RARITIES[pet.rarity];
          const canMerge = tier < 3 && (state.isAdmin && state.adminFreeMerge ? true : count >= 3);
          const mergeNeeded = 3 - Math.min(count, 3);

          const card = h('div', {
            class: `item-card tier-${tier}${equipped ? ' equipped' : ''}`,
            style: { '--rc': rarity.color },
          },
            // Count badge
            count > 1 ? h('span', { class: 'item-count stroke' }, `×${count}`) : null,
            // Art circle
            h('div', { class: 'item-art' }, modelArt(actions, 'pet', pet.id, pet.name)),
            // Name + rarity row
            h('div', { class: 'pet-card-header' },
              h('div', { class: 'item-name stroke' }, pet.name),
              h('span', { class: 'pet-rarity-badge', style: { background: rarity.color } }, pet.rarity),
            ),
            // Tier dots
            h('div', { class: 'pet-tier-row' },
              [1, 2, 3].map(t => h('span', { class: `pet-tier-dot${t <= tier ? ' filled' : ''}` })),
              h('span', { class: 'pet-tier-label' }, `Tier ${tier}`),
            ),
            // Ability
            h('div', { class: 'item-desc' }, petAbilities(pet)),
            // Merge progress (if not max tier)
            tier < 3 ? h('div', { class: 'pet-merge-bar' },
              h('span', { class: 'pet-merge-info' }, count >= 3 ? 'Ready to merge!' : `${count}/3 to merge`),
              h('div', { class: 'pet-merge-pips' },
                [0, 1, 2].map(i => h('span', { class: `pet-merge-pip${i < count ? ' filled' : ''}` })),
              ),
            ) : null,
            // Buttons
            h('button', {
              type: 'button',
              class: `btn small block ${equipped ? 'grey' : 'blue'}`,
              onClick: () => actions.equipPet(equipped ? null : pet.id, tier),
            }, equipped ? 'Unequip' : 'Equip'),
            h('button', {
              type: 'button',
              class: 'btn small block purple',
              disabled: tier === 3 || !canMerge,
              onClick: () => actions.mergePet(pet.id, tier),
            }, tier === 3 ? 'Max tier' : state.isAdmin && state.adminFreeMerge ? `Admin merge → T${tier + 1}` : `Merge 3 → Tier ${tier + 1}`),
            h('button', {
              type: 'button',
              class: 'btn small block red',
              onClick: () => actions.deletePet(pet.id, tier),
            }, 'Delete one'),
          );
          attachPetTooltip(card, pet);
          return card;
        }));
        inventory.replaceChildren(...(cards.length ? cards : [h('p', { class: 'empty' }, 'Open a Lucky Block to hatch your first pet!')]));

        const discovered = profile.discoveredPets.length;
        dictionaryTitle.textContent = `Pet Dictionary · ${discovered}/${PETS.length} discovered`;
        dictionary.replaceChildren(...PETS.map(pet => {
          const isDiscovered = profile.discoveredPets.includes(pet.id);
          const rarity = RARITIES[pet.rarity];
          const art = modelArt(actions, 'pet', pet.id, pet.name, 72);
          if (!isDiscovered) art.classList.add('silhouette');

          return h('div', {
            class: `pet-dict-card${isDiscovered ? '' : ' locked'}`,
            style: { '--rc': rarity.color },
          },
            h('div', { class: 'pet-dict-art' }, art),
            h('div', { class: 'pet-dict-info' },
              h('div', { class: 'pet-dict-name stroke' }, isDiscovered ? pet.name : '???'),
              h('span', { class: 'pet-rarity-badge', style: { background: rarity.color } }, pet.rarity),
              isDiscovered
                ? h('div', { class: 'pet-dict-desc' }, petAbilities(pet))
                : h('div', { class: 'pet-dict-desc locked-hint' }, 'Find in a Lucky Block'),
            ),
            state.isAdmin ? h('button', { type: 'button', class: 'btn small purple', style: { marginTop: '4px' }, onClick: () => actions.admin('grantPet', { petId: pet.id, id: state.you }) }, 'Admin collect') : null,
          );
        }));
      }
      update(); return { update, unmount: hidePetTooltip };
    },
  };
}
